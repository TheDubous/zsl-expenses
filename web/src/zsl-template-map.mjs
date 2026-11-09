// Exact-cell mapping for original ZSL workbook. Do not overwrite existing data/formulas.
export const REQUIRED_SHEETS=['s.1 - pokyn','s.3 - výdavky','s.4 - stravné tuzem.','s.4 - stravné zahr.','s.5 - kniha jázd','s.5 - kniha jázd_Kufel_2','s.6 - správa','Náhrady INT 2021','pomocný hárok','DIÉTY SLOVENSKO','str.4 - stravné INT'];
export const TEMPLATE_ID='zsl-original-xlsx-template';
const rounded=n=>Math.round(Number(n)*100)/100;
const dateText=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))?[s.slice(8,10),s.slice(5,7),s.slice(2,4)].join('.'):null;
const timeValue=s=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(s||''))?(Number(s.slice(0,2))*60+Number(s.slice(3,5)))/1440:null;
const t=(sheet,cell,value)=>value==null||String(value).trim()===''?null:{sheet,cell,value:String(value),kind:'text'};
const n=(sheet,cell,value)=>value==null||!Number.isFinite(Number(value))?null:{sheet,cell,value:Number(value),kind:'number'};
const S1='s.1 - pokyn',S3='s.3 - výdavky',S4='s.4 - stravné zahr.',S6='s.6 - správa';
export function buildTemplatePatches({event,trainer,riders=[],expenses=[],funding=[]}){
 const patches=[],warnings=[],skipped=[];
 const add=p=>{if(p)patches.push(p)};
 const coach=[trainer?.title,trainer?.name].filter(Boolean).join(' ');
 [
  t(S1,'B4',coach),t(S1,'G4',trainer?.role),t(S1,'B6',trainer?.address),
  t(S1,'B8',trainer?.contact),t(S1,'H8',trainer?.iban),
  t(S1,'B12',dateText(event?.startsOn)),n(S1,'C12',timeValue(event?.startTime)),
  t(S1,'D12',event?.startPlace),t(S1,'F12',[event?.location,event?.country].filter(Boolean).join(', ')),
  t(S1,'H12',event?.purpose||event?.kind),t(S1,'J12',dateText(event?.endsOn)),
  n(S1,'K12',timeValue(event?.endTime)),t(S1,'L12',event?.endPlace),
  t(S1,'B18',trainer?.name),t(S1,'F18',trainer?.name)
 ].forEach(add);
 riders.slice(0,10).forEach((r,i)=>add(t(S1,'D'+(18+i),r.name)));
 if(riders.length>10)warnings.push('Více než 10 športovcov: zbylí účastníci se nevešli na list s.1.');
 const deposits=funding.filter(x=>x.kind==='advance').reduce((s,x)=>s+Math.round(Number(x.amount||0)*100),0)/100;
 if(event?.currency==='EUR'&&deposits>0)add(n(S1,'I30',deposits));
 else if(deposits>0)warnings.push('Suma zálohy v EUR: jiné měny se bez kurzu nepřepočítávají.');
 // These are exact writable rows/columns observed in the original ZSL form.
 const ranges={
  transport:{sheet:S3,start:6,end:8,cols:['C','D','I']},
  zsl_car:{sheet:S3,start:24,end:33,cols:['C','F','H']},
  lodging:{sheet:S3,start:38,end:42,cols:['C','F','H']},
  other:{sheet:S3,start:47,end:59,cols:['C','F','H']},
  foreign_meal:{sheet:S4,start:74,end:107,cols:['B','C','F','I','J']}
 };
 const used=Object.fromEntries(Object.keys(ranges).map(k=>[k,new Set()]));
 for(const e of [...expenses].sort((a,b)=>String(a.spent_on||'').localeCompare(String(b.spent_on||'')))){
  const name=e.merchant||e.receipt_name||'Neurčený dodávateľ';
  if(!e.receipt_path||e.ocr?.reviewed===false||!(Number(e.amount)>0)||!e.merchant?.trim()){
   skipped.push(name+': potvrď rozpoznané údaje, dodávateľa a sumu.');continue;
  }
  if(e.payment_method==='unknown'){skipped.push(name+': neurčený spôsob platby.');continue;}
  if(e.payment_method==='card'&&!e.bank_path){skipped.push(name+': chýba bankové potvrdenie.');continue;}
  if(event?.currency!=='EUR'){skipped.push(name+': prepočet na EUR nie je bezpečne určený.');continue;}
  let section=e.zsl_section||'';
  if(!section){
   if(e.category==='fuel'||e.category==='food')section='unassigned';
   else if(e.category==='lodging')section='lodging';
   else if(e.category==='travel')section='transport';
   else section='other';
  }
  if(section==='private_car'||section==='company_car'){
   skipped.push(name+': výdavky súkromného/firemného auta sa vypočítavajú zo spotreby, kilometrov a vzorcov. Účtenku tam bez údajov nevkladáme.');continue;
  }
  if(section==='unassigned'||section==='domestic_meal'){
   skipped.push(name+': urči správnu sekciu ZSL (palivo alebo strava).');continue;
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
   const info=[e.vehicleDetails||'',name,dateText(e.spent_on)].filter(Boolean).join(' – ');
   cells.push(t(S3,'C'+row,info),n(S3,'F'+row,amount),n(S3,'H'+row,amount));
  }else if(section==='lodging'||section==='other'){
   cells.push(t(S3,'C'+row,e.note?name+' – '+e.note:name),n(S3,'F'+row,amount),n(S3,'H'+row,amount));
  }else if(section==='foreign_meal'){
   cells.push(t(S4,'B'+row,dateText(e.spent_on)),t(S4,'C'+row,'Pokladničný doklad zo strav. zariadenia'),t(S4,'F'+row,name),t(S4,'I'+row,'EUR'),n(S4,'J'+row,amount));
  }
  cells.filter(Boolean).forEach(p=>add({...p,group:'receipt:'+e.id,rowStart:cfg.start,rowEnd:cfg.end}));
 }
 if(event?.reportText){
  add(t(S6,'B3',event.reportText));add(t(S6,'D20',trainer?.name));
  add(t(S6,'I20',dateText(event?.endsOn)));add(t(S6,'C26',trainer?.name));
  add(t(S6,'F26',trainer?.role||'Tréner'));
  riders.slice(0,20).forEach((r,i)=>{add(t(S6,'C'+(27+i),r.name));add(t(S6,'F'+(27+i),'Športovec'));});
 }
 return {patches,warnings,skipped};
}
