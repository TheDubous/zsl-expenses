import {expenseStatus,summarize} from './utils.mjs';

// Headings and labels transcribed from the source ZSL workbook (s.1, s.3, s.4, s.5, s.6).
export const ZSL_SHEET_TITLES=[
  {id:'pokyn',sheet:'s.1 - pokyn',title:'CESTOVNÝ PRÍKAZ'},
  {id:'vydavky',sheet:'s.3 - výdavky',title:'PREUKÁZANÉ CESTOVNÉ VÝDAVKY'},
  {id:'tuzemsko',sheet:'s.4 - stravné tuzem.',title:'VYÚČTOVANIE CESTOVNÝCH NÁHRAD - TUZEMSKO'},
  {id:'zahranicie',sheet:'s.4 - stravné zahr.',title:'VYÚČTOVANIE CESTOVNÝCH NÁHRAD - ZAHRANIČIE'},
  {id:'jazdy',sheet:'s.5 - kniha jázd',title:'KNIHA JÁZD'},
  {id:'jazdy2',sheet:'s.5 - kniha jázd_Kufel_2',title:'KNIHA JÁZD'},
  {id:'sprava',sheet:'s.6 - správa',title:'SPRÁVA Z PRACOVNEJ CESTY'}
];
export const ZSL_EXPENSE_SECTIONS=[
  {id:'transport',label:'Lietadlo, vlak, loď, iná miestna doprava (taxi, električka, autobus, metro...)',short:'Iná miestna doprava'},
  {id:'private_car',label:'Motorové vozidlo vlastné evidované na súkromnú osobu - spotreba PHM + amortizácia',short:'Súkromné vozidlo'},
  {id:'company_car',label:'Motorové vozidlo vlastné evidované na právnickú osobu (IČO) - spotreba PHM',short:'Vozidlo právnickej osoby'},
  {id:'zsl_car',label:'Motorové vozidlo ZSL',short:'Motorové vozidlo ZSL'},
  {id:'lodging',label:'Náhrada preukázaných výdavkov za ubytovanie',short:'Ubytovanie'},
  {id:'other',label:'INÉ vedľajšie výdavky (mýto, parkovné, skipassy, prenájom infraštruktúry..)',short:'INÉ vedľajšie výdavky'},
  {id:'foreign_meal',label:'s.4 - stravné zahr. – Pokladničné doklady zo stravovacích zariadení',short:'Príspevok na stravu zahraničie'},
  {id:'domestic_meal',label:'s.4 - stravné tuzem. – stravné a príspevky na stravu',short:'Strava tuzemsko'},
  {id:'unassigned',label:'NEZARADENÉ - určite typ vozidla alebo druh výdavku',short:'Nezaradené (vyžaduje kontrolu)'}
];
export const ZSL_SETTLEMENT_ROWS=[
  {id:'travel',label:'Cestovné',status:'estimated'},
  {id:'lodging',label:'Ubytovanie',status:'estimated'},
  {id:'other',label:'Ostatné',status:'estimated'},
  {id:'domestic_perdiem',label:'Stravné tuzemsko',status:'not_computed'},
  {id:'foreign_perdiem',label:'Stravné zahraničie',status:'not_computed'},
  {id:'domestic_food',label:'Príspevok na stravu tuzemsko',status:'not_computed'},
  {id:'foreign_food',label:'Príspevok na stravu zahraničie',status:'not_computed'},
  {id:'total',label:'Výdavok celkom',status:'provisional'},
  {id:'balance',label:'Doplatok / Preplatok',status:'provisional'}
];
export const NOT_COMPUTED='NEVYPOČÍTANÉ';
const CENT=value=>Math.round((Number(value)||0)*100);
export const num2=value=>Math.round((Number(value)||0)*100)/100;
function sumCents(list){return list.reduce((acc,item)=>acc+CENT(item.amount),0)/100}
export function expenseSection(expense,event){
  if(expense.category==='fuel')return 'zsl_car';
  if(ZSL_EXPENSE_SECTIONS.some(x=>x.id===expense.zsl_section))return expense.zsl_section;
  if(expense.category==='food')return 'unassigned';
  if(expense.category==='lodging')return 'lodging';
  if(expense.category==='travel')return 'transport';
  return 'other';
}
export function makeZslReport({event,trainer,riders=[],expenses=[],funding=[]}){
  const financial=summarize(expenses,funding);
  const sections=ZSL_EXPENSE_SECTIONS.map(section=>{
    const entries=[...expenses].filter(e=>expenseSection(e,event)===section.id).sort((a,b)=>(a.spent_on||'').localeCompare(b.spent_on||''));
    return {...section,expenses:entries,total:sumCents(entries)};
  });
  const travel=sumCents(expenses.filter(x=>['travel','fuel'].includes(x.category)));
  const lodging=sumCents(expenses.filter(x=>x.category==='lodging'));
  const other=sumCents(expenses.filter(x=>!['travel','fuel','lodging'].includes(x.category)));
  const calculations={travel,lodging,other,total:financial.spent,balance:financial.remaining};
  const settlement=ZSL_SETTLEMENT_ROWS.map(row=>({...row,amount:row.status==='not_computed'?null:calculations[row.id]}));
  const missing=[];
  const expect=(field,value)=>{if(!String(value||'').trim())missing.push(field)};
  expect('Priezvisko, meno, titul',trainer?.name);
  expect('Trvalé bydlisko',trainer?.address);
  expect('Telefónny kontakt na vyúčtovateľa',trainer?.contact);
  expect('IBAN vyúčtovateľa',trainer?.iban);
  expect('Funkcia',trainer?.role);
  expect('Oddelenie ZSL',trainer?.department);
  expect('Začiatok pracovnej cesty - dátum',event?.startsOn);
  expect('Koniec pracovnej cesty - dátum',event?.endsOn);
  expect('Miesto konania/Štát',event?.location);
  expect('Účel cesty',event?.purpose);
  const invalid=expenses.filter(e=>expenseStatus(e)!=='Doklady kompletní');
  for(const e of invalid)missing.push('Doklad: '+(e.merchant||e.receipt_name||e.id)+' - '+expenseStatus(e));
  const unassigned=sections.find(x=>x.id==='unassigned');
  if(unassigned.expenses.length)missing.push('Zařazení paliva nebo stravy: '+unassigned.expenses.length+' nezařazených dokladů');
  if(event?.currency!=='EUR')missing.push('Prepočet na EUR - nie je nastavený; základné sumy sú v '+(event?.currency||'meně'));
  return {
    event,trainer,riders,expenses:[...expenses].sort((a,b)=>(a.spent_on||'').localeCompare(b.spent_on||'')),
    funding:[...funding].sort((a,b)=>(a.occurredOn||'').localeCompare(b.occurredOn||'')),
    financial,sections,settlement,missing,
    provisional:true, 
    currency:event?.currency||'EUR',
    note:'Kontrolný prehľad, nie oficiálny cestovný príkaz ZSL. Nároky na cestovné náhrady, amortizáciu a stravné neboli vypočítané ani schválené.'
  };
}
