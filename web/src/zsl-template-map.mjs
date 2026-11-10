// Exact-cell mapping for original ZSL workbook. Do not overwrite existing data/formulas.
export const REQUIRED_SHEETS=['s.1 - pokyn','s.3 - výdavky','s.4 - stravné tuzem.','s.4 - stravné zahr.','s.5 - kniha jázd','s.6 - správa','Náhrady INT 2021','pomocný hárok','DIÉTY SLOVENSKO','str.4 - stravné INT'];
export const VARIANT_SHEETS=['s.2 - súhlas MV','s.5 - kniha jázd_Kufel_2'];
export const TEMPLATE_ID='zsl-original-xlsx-template';
const rounded=n=>Math.round(Number(n)*100)/100;
const dateText=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))?[s.slice(8,10),s.slice(5,7),s.slice(2,4)].join('.'):null;
export const excelDateSerial=iso=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||'')))return null;
 const day=Date.parse(iso+'T00:00:00Z');
 return Number.isFinite(day)?Math.round((day-Date.UTC(1899,11,30))/86400000):null;
};
const timeValue=s=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(s||''))?(Number(s.slice(0,2))*60+Number(s.slice(3,5)))/1440:null;
const t=(sheet,cell,value)=>value==null||String(value).trim()===''?null:{sheet,cell,value:String(value),kind:'text'};
const n=(sheet,cell,value)=>value==null||!Number.isFinite(Number(value))?null:{sheet,cell,value:Number(value),kind:'number'};
const S1='s.1 - pokyn',S3='s.3 - výdavky',S4='s.4 - stravné zahr.',S6='s.6 - správa';
export function recommendedZslSection(expense,event){
  // Ownership of a vehicle and eligibility of a meal allowance cannot be
  // deduced solely from OCR; these items require a one-time human selection.
  if(expense.zsl_section)return expense.zsl_section;
  if(expense.category==='fuel'){
    return ['zsl_car','private_car','company_car'].includes(event?.defaultFuelSection)
      ?event.defaultFuelSection:'unassigned';
  }
  if(expense.category==='food')return 'unassigned';
  if(expense.category==='lodging')return 'lodging';
  if(expense.category==='travel')return 'transport';
  return 'other'; // Resort fees, parking and other actual receipts.
}
export function exportExpenseReadiness(expense,event){
  const issues=[],warnings=[],section=recommendedZslSection(expense,event);
  const name=expense.merchant||expense.receipt_name||'Neznámá účtenka';
  if(!expense.receipt_path)issues.push('chybí fotografie nebo PDF účtenky');
  if(!(Number(expense.amount)>0))issues.push('chybí ověřená částka');
  if(!String(expense.merchant||'').trim())issues.push('chybí dodavatel');
  if(expense.ocr?.reviewed===false&&!expense.ocr?.autoReady)warnings.push('nízká jistota OCR – zkontroluj rozpoznanou částku nebo dodavatele');
  if(expense.payment_method==='card'&&!expense.bank_path)
    warnings.push('bankovní potvrzení zatím chybí – částka přesto patří do evidence; potvrzení přilož před odevzdáním');
  if(!['cash','card'].includes(expense.payment_method))
    warnings.push('způsob platby zatím není určen');
  if(event?.currency!=='EUR')issues.push('není zadán bezpečný přepočet z '+(event?.currency||'jiné měny')+' do EUR');
  if(section==='unassigned'){
    if(expense.category==='fuel')issues.push('vyber typ vozidla (ZSL / soukromé / právnické osoby)');
    else if(expense.category==='food')issues.push('vyber zahraniční stravování nebo jinou sekci formuláře');
    else issues.push('vyber sekci formuláře ZSL');
  }
  if(section==='private_car'||section==='company_car')
    issues.push('chybí podklady pro výpočet náhrady: ujeté km, spotřeba a cena PHM');
  if(section==='domestic_meal')
    issues.push('tuzemské stravné vyžaduje samostatné podklady pro výpočet nároku');
  if(!['transport','zsl_car','lodging','other','foreign_meal'].includes(section)&&section!=='unassigned'&&
     section!=='private_car'&&section!=='company_car'&&section!=='domestic_meal')
    issues.push('neznámá sekce výkazu');
  return {name,section,issues,warnings,canExport:issues.length===0};
}
export function buildTemplatePatches({event,trainer,riders=[],expenses=[],funding=[],variant='user-double-log'}){
 const patches=[],warnings=[],skipped=[];
 const add=p=>{if(p)patches.push(p)};
 const coach=[trainer?.title,trainer?.name].filter(Boolean).join(' ');
 [
  t(S1,'B4',coach),t(S1,'G4',trainer?.role),t(S1,'B6',trainer?.address),t(S1,'G6',trainer?.department),
  t(S1,'B8',trainer?.contact),t(S1,'H8',trainer?.iban),
  n(S1,'B12',excelDateSerial(event?.startsOn)),n(S1,'C12',timeValue(event?.startTime)),
  t(S1,'D12',event?.startPlace),t(S1,'F12',[event?.location,event?.country].filter(Boolean).join(', ')),
  t(S1,'H12',event?.purpose||event?.kind),n(S1,'J12',excelDateSerial(event?.endsOn)),
  n(S1,'K12',timeValue(event?.endTime)),t(S1,'L12',event?.endPlace),
  t(S1,'B18',trainer?.name),t(S1,'F18',trainer?.name)
 ].forEach(add);
 riders.slice(0,10).forEach((r,i)=>add(t(S1,'D'+(18+i),r.name)));
 if(riders.length>10)warnings.push('Více než 10 športovcov: zbylí účastníci se nevešli na list s.1.');
 const deposits=funding.filter(x=>x.kind==='advance').reduce((s,x)=>s+Math.round(Number(x.amount||0)*100),0)/100;
 if(event?.currency==='EUR'&&deposits>0)add(n(S1,'I30',deposits));
 else if(deposits>0)warnings.push('Suma zálohy v EUR: jiné měny se bez kurzu nepřepočítávají.');
 // CRITICAL: The officially published 2025 ZSL workbook differs from the
 // user's older "Kufel_2" custom variant. Finance rows were shifted, and
 // the official OTHER section has only seven rows. Never write below the
 // "CELKOM" formula as those receipts would not be included in settlement.
 const official=variant==='official';
 const ranges=official?{
  transport:{sheet:S3,start:6,end:10,cols:['C','D','I']},
  zsl_car:{sheet:S3,start:26,end:35,cols:['C','F','H']},
  lodging:{sheet:S3,start:40,end:44,cols:['C','F','H']},
  other:{sheet:S3,start:49,end:55,cols:['C','F','H']},
  foreign_meal:{sheet:S4,start:74,end:107,cols:['B','C','F','I','J']}
 }:{
  transport:{sheet:S3,start:6,end:8,cols:['C','D','I']},
  zsl_car:{sheet:S3,start:24,end:33,cols:['C','F','H']},
  lodging:{sheet:S3,start:38,end:42,cols:['C','F','H']},
  other:{sheet:S3,start:47,end:59,cols:['C','F','H']},
  foreign_meal:{sheet:S4,start:74,end:107,cols:['B','C','F','I','J']}
 };
 const used=Object.fromEntries(Object.keys(ranges).map(k=>[k,new Set()]));
 for(const e of [...expenses].sort((a,b)=>String(a.spent_on||'').localeCompare(String(b.spent_on||'')))){
  const readiness=exportExpenseReadiness(e,event);
  const {name,section}=readiness;
  // Incomplete bank attachments must not erase a correctly recognized receipt
  // from the financial workbook. We list such issues as warnings, separately.
  for(const warning of readiness.warnings)warnings.push(name+': '+warning);
  if(!readiness.canExport){
    skipped.push(name+': '+readiness.issues.join('; '));
    continue;
  }
  const cfg=ranges[section];
  if(!cfg){skipped.push(name+': sekcia nie je bezpečne namapovaná.');continue;}
  const taken=used[section];
  let row=null;
  for(let i=cfg.start;i<=cfg.end;i++){
   if(cfg.cols.every(col=>!taken.has(col+i))){row=i;break;}
  }
  if(row==null){skipped.push(name+': v sekcii '+section+' nie sú voľné riadky.');continue;}
  for(const col of cfg.cols)taken.add(col+row);
  const amount=rounded(e.amount),cells=[];
  if(section==='transport')cells.push(t(S3,'C'+row,name),t(S3,'D'+row,e.note||'Iná miestna doprava'),n(S3,'I'+row,amount));
  else if(section==='zsl_car'){
   const info=[e.vehicleDetails||event?.vehicleDetails||'',name,dateText(e.spent_on)].filter(Boolean).join(' – ');
   cells.push(t(S3,'C'+row,info),n(S3,'F'+row,amount),n(S3,'H'+row,amount));
  }else if(section==='lodging'||section==='other'){
   cells.push(t(S3,'C'+row,e.note?name+' – '+e.note:name),n(S3,'F'+row,amount),n(S3,'H'+row,amount));
  }else if(section==='foreign_meal'){
   cells.push(n(S4,'B'+row,excelDateSerial(e.spent_on)),t(S4,'C'+row,'Pokladničný doklad zo strav. zariadenia'),t(S4,'F'+row,name),t(S4,'I'+row,'EUR'),n(S4,'J'+row,amount));
  }
  cells.filter(Boolean).forEach(p=>add({...p,group:'receipt:'+e.id,rowStart:cfg.start,rowEnd:cfg.end}));
 }
 if(event?.reportText){
  add(t(S6,'B3',event.reportText));add(t(S6,'D20',trainer?.name));
  add(n(S6,'I20',excelDateSerial(event?.endsOn)));add(t(S6,'C26',trainer?.name));
  add(t(S6,'F26',trainer?.role||'Tréner'));
  riders.slice(0,20).forEach((r,i)=>{add(t(S6,'C'+(27+i),r.name));add(t(S6,'F'+(27+i),'Športovec'));});
 }
 return {patches,warnings,skipped};
}
