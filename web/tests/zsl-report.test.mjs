import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeZslReport,expenseSection,ZSL_SHEET_TITLES,ZSL_EXPENSE_SECTIONS,NOT_COMPUTED} from '../src/zsl-report.mjs';
const event={id:'event1',name:'Pitztal',kind:'Sústredenie',currency:'EUR',startsOn:'2026-11-02',endsOn:'2026-11-03',location:'Pitztal',purpose:'Tréning SBX'};
const trainer={name:'Test Trainer',role:'Tréner',department:'Sekcia moderných disciplín',address:'Test 1',contact:'123456',iban:'SK0000000000000000000000'};
const expenses=[
{id:'1',category:'fuel',amount:132.34,merchant:'Slovnaft',receipt_path:'one',payment_method:'card',bank_path:'bank1'},
{id:'2',category:'food',amount:55.84,merchant:'INTERSPAR',receipt_path:'two',payment_method:'cash'},
{id:'3',category:'fuel',amount:26.90,merchant:'Slovnaft',receipt_path:'three',payment_method:'cash'},
{id:'4',category:'fuel',amount:127.78,merchant:'Gutmann',receipt_path:'four',payment_method:'card',bank_path:'bank4'},
{id:'5',category:'resort',amount:650,merchant:'Pitztaler',receipt_path:'five',payment_method:'card',bank_path:'bank5'},
{id:'6',category:'resort',amount:615,merchant:'Pitztaler',receipt_path:'six',payment_method:'card',bank_path:'bank6'}
];
test('exact heading names from original ZSL template are preserved',()=>{
 assert.deepEqual(ZSL_SHEET_TITLES.map(x=>x.title),[
 'CESTOVNÝ PRÍKAZ','PREUKÁZANÉ CESTOVNÉ VÝDAVKY',
 'VYÚČTOVANIE CESTOVNÝCH NÁHRAD - TUZEMSKO',
 'VYÚČTOVANIE CESTOVNÝCH NÁHRAD - ZAHRANIČIE','KNIHA JÁZD','KNIHA JÁZD','SPRÁVA Z PRACOVNEJ CESTY'
 ]);
 assert.ok(ZSL_EXPENSE_SECTIONS.some(x=>x.label==='Motorové vozidlo ZSL'));
});
test('ZSL rollup totals are computed but allowances stay unknown',()=>{
 const r=makeZslReport({event,trainer,expenses,funding:[{amount:2000,kind:'advance'}]});
 assert.equal(r.financial.spent,1607.86);
 assert.equal(r.financial.remaining,392.14);
 assert.equal(r.settlement.find(x=>x.label==='Cestovné').amount,287.02);
 assert.equal(r.settlement.find(x=>x.label==='Ostatné').amount,1320.84);
 assert.equal(r.settlement.find(x=>x.label==='Výdavok celkom').amount,1607.86);
 for(const id of ['domestic_perdiem','foreign_perdiem','domestic_food','foreign_food']){
   assert.equal(r.settlement.find(x=>x.id===id).amount,null);
 }
 assert.equal(NOT_COMPUTED,'NEVYPOČÍTANÉ');
});
test('fuel is not assigned to ZSL-owned vehicle unless selected',()=>{
 assert.equal(expenseSection(expenses[0]),'unassigned');
 assert.equal(expenseSection({...expenses[0],zsl_section:'zsl_car'}),'zsl_car');
 const r=makeZslReport({event,trainer,expenses, funding:[]});
 assert.equal(r.sections.find(x=>x.id==='unassigned').expenses.length,3);
 assert.ok(r.missing.some(x=>/Typ vozidla/.test(x)));
});
test('missing receipts and unverified card payments are listed in report',()=>{
 const r=makeZslReport({event,trainer,expenses:[{...expenses[0],bank_path:null}],funding:[]});
 assert.ok(r.missing.some(x=>/Chybí potvrzení/.test(x)));
});
