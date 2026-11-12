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
// What was purchased, not where. Keep this short for ZSL's original
// narrow description cells. Explicit user correction always wins.
export function receiptItemLabel(expense={}){
 const manual=String(expense.itemLabel||'').trim();
 if(manual)return manual.slice(0,70);
 const source=String([
   expense.ocr?.rawText||'',expense.note||'',
   expense.receipt_name||'',expense.merchant||''
 ].join('\n')).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const match=re=>re.test(source);
 // Fuel can list multiple products at the same station. Prefer a single
 // reliable receipt-level label; AdBlue is not silently called diesel.
 if(expense.category==='fuel'||match(/\b(?:adblue|diesel|nafta|benz[iy]n|benzin|petrol|super\s*95|tankstelle|kraftstoff)\b/)){
  const adblue=match(/\b(?:ad\s*blue|adblue|harnovina)\b/);
  const diesel=match(/\b(?:diesel|nafta|gas[oó]leo|dizel)\b/);
  const petrol=match(/\b(?:benz[iy]n|benzin|petrol|super\s*(?:95|98)|unleaded|bleifrei)\b/);
  if([adblue,diesel,petrol].filter(Boolean).length>1)return 'PHM / AdBlue';
  if(adblue)return 'AdBlue';
  if(diesel)return 'Diesel';
  if(petrol)return 'Benzín';
  return 'PHM';
 }
 // Separate piste/track rental from lift passes and race entry fees.
 if(match(/\b(?:startovn[eéy]|startovny|startovne|startgeld|nenngeld|entry\s*fee|registration\s*fee|race\s*fee|prihlasovac[iy]\s*poplatek)\b/))
  return 'Startovné';
 if(match(/\b(?:(?:pronajem|prenajom|prenajem)\s*(?:trate|trati|zjazdovky|sjezdovky)|piste[n]?\s*miete|streckenmiete|track\s*rental|slope\s*rental|pistenbenutzung|trainingspiste)\b/))
  return 'Prenájom trate';
 if(match(/\b(?:ski\s*pass|skipass|skipasy|skipassy|skipas|liftkarte|liftpass|skipasse|ski\s*ticket|seilbahnkarte|bergbahnticket)\b/))
  return 'Skipas';
 if(expense.category==='lodging')return 'Ubytovanie';
 if(expense.category==='food'){
  if(match(/\b(?:supermarket|potraviny|lebensmittel|interspar|hofer|lidl|billa|spar)\b/))return 'Potraviny';
  return 'Strava';
 }
 if(expense.category==='travel'){
  if(match(/\b(?:parkovn[eéy]|parking|parkgebuhr|parkplatz)\b/))return 'Parkovné';
  if(match(/\b(?:myto|maut|toll|vignette|dialnicn[aá])\b/))return 'Mýto';
  return 'Doprava';
 }
 if(expense.category==='resort')return 'Skipas'; // fallback for older scanned lift receipts
 if(match(/\b(?:servis|service)\b/))return 'Servis';
 return 'Ostatné výdavky';
}
export function zslReceiptDescription(expense){
 const date=dateText(expense.spent_on);
 return [date,receiptItemLabel(expense)].filter(Boolean).join(' – ');
}
export function recommendedZslSection(expense,event){
  // ZSL owns the vehicle for all fuel, diesel, petrol and AdBlue receipts.
  // This also migrates old receipts that stored a private/car-choice section.
  if(expense.category==='fuel')return 'zsl_car';
  if(expense.zsl_section)return expense.zsl_section;
  if(expense.category==='food')return 'unassigned';
  if(expense.category==='lodging')return 'lodging';
  if(expense.category==='travel')return 'transport';
  return 'other';
}
export function exportExpenseReadiness(expense,event){
  const issues=[],warnings=[],section=recommendedZslSection(expense,event);
  const name=expense.merchant||expense.receipt_name||'Neznámá účtenka';
  if(!expense.receipt_path)issues.push('chybí fotografie nebo PDF účtenky');
  if(Number(expense.sourceAmount)>0 && expense.sourceCurrency!=='EUR' && !expense.conversionConfirmed)
    issues.push('PDF je v '+(expense.sourceCurrency||'neznámé měně')+' ('+expense.sourceAmount+'); doplň správnou částku v EUR');
  if(!(Number(expense.amount)>0))issues.push(Number(expense.sourceAmount)>0?
    'částka v EUR zatím není zadaná – původní cenu z PDF do ZSL nepřepisujeme':'chybí ověřená částka');
  if(!String(expense.merchant||'').trim())issues.push('chybí dodavatel');
  if(expense.ocr?.reviewed===false&&!expense.ocr?.autoReady)warnings.push('nízká jistota OCR – zkontroluj rozpoznanou částku nebo dodavatele');
  if(expense.payment_method==='card'&&!expense.bank_path)
    warnings.push('bankovní potvrzení zatím chybí – částka přesto patří do evidence; potvrzení přilož před odevzdáním');
  if(!['cash','card'].includes(expense.payment_method))
    warnings.push('způsob platby zatím není určen');
  if(event?.currency!=='EUR')issues.push('není zadán bezpečný přepočet z '+(event?.currency||'jiné měny')+' do EUR');
  if(section==='unassigned'){
    if(expense.category==='food')issues.push('vyber zahraniční stravování nebo jinou sekci formuláře');
    else issues.push('vyber sekci formuláře ZSL');
  }
  if(section==='domestic_meal')
    issues.push('tuzemské stravné vyžaduje samostatné podklady pro výpočet nároku');
  if(!['transport','zsl_car','lodging','other','foreign_meal'].includes(section)&&section!=='unassigned'&&
     section!=='domestic_meal')
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
  if(section==='transport')cells.push(t(S3,'C'+row,zslReceiptDescription(e)),t(S3,'D'+row,name),n(S3,'I'+row,amount));
  else if(section==='zsl_car'){
   const info=zslReceiptDescription(e);
   cells.push(t(S3,'C'+row,info),n(S3,'F'+row,amount),n(S3,'H'+row,amount));
  }else if(section==='lodging'||section==='other'){
   cells.push(t(S3,'C'+row,zslReceiptDescription(e)),n(S3,'F'+row,amount),n(S3,'H'+row,amount));
  }else if(section==='foreign_meal'){
   cells.push(n(S4,'B'+row,excelDateSerial(e.spent_on)),t(S4,'C'+row,'Pokladničný doklad zo strav. zariadenia'),t(S4,'F'+row,receiptItemLabel(e)),t(S4,'I'+row,'EUR'),n(S4,'J'+row,amount));
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
