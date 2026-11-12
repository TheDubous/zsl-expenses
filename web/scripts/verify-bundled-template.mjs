import {readFile} from 'node:fs/promises';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {inspectZslXlsx,createFilledXlsx} from '../src/zsl-xlsx.js';
const bytes=await readFile('web/public/ZSL-Cestovny-prikaz.xlsx');
const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
const xml={DOMParserCtor:DOMParser,XMLSerializerCtor:XMLSerializer};
const info=await inspectZslXlsx(blob,xml);
console.log('Official template:',JSON.stringify({variant:info.variant,sheets:info.sheets.length,hasExistingTrip:info.hasExistingTrip,existing:info.existing.length,existingCells:info.existing}));
const {default:JSZip}=await import('jszip');
if(info.variant!=='official'||info.sheets.length!==11)
 throw new Error('Downloaded template is not the approved 11-sheet official version.');
const data={
 event:{name:'SANDBOX',kind:'Sústredenie',startsOn:'2026-11-09',endsOn:'2026-11-10',
  startPlace:'Test',location:'Test',country:'AUT',purpose:'SBX',currency:'EUR'},
 trainer:{name:'TEST TRAINER',role:'Trener',department:'Sekcia modernych disciplin',address:'Test',contact:'000000',iban:'SK0000000000000000000000'},
 riders:[],funding:[],expenses:[
  {id:'fuel-1',category:'fuel',zsl_section:'zsl_car',merchant:'Gutmann GmbH',amount:127.78,
   receipt_path:'receipt1',spent_on:'2026-11-09',payment_method:'card',bank_path:null,ocr:{reviewed:true,rawText:'DIESEL 58,24 L 127,78 EUR'}},
  {id:'skipass-1',category:'resort',merchant:'Pitztaler Gletscherbahn',amount:650,
   receipt_path:'receipt2',spent_on:'2026-11-09',payment_method:'card',bank_path:null,ocr:{reviewed:true}},
  {id:'hotel-1',category:'lodging',merchant:'Hotel Test',amount:315,
   receipt_path:'receipt3',spent_on:'2026-11-09',payment_method:'cash',ocr:{reviewed:true}},
  {id:'food-1',category:'food',zsl_section:'foreign_meal',merchant:'INTERSPAR',amount:55.84,
   receipt_path:'receipt4',spent_on:'2026-11-09',payment_method:'card',bank_path:null,ocr:{reviewed:true}}
 ]
};
const result=await createFilledXlsx(blob,data,{...xml,allowExisting:true});
console.log('Write into actual official template:',JSON.stringify({changed:result.changes.length,conflicts:result.conflicts.length,warnings:result.warnings.length,skipped:result.skipped.length,example:result.changes.slice(0,7).map(x=>x.cell)}));
const amountChanges=result.changes.filter(x=>x.source?.startsWith('receipt:')&&x.kind==='number');
console.log('Financial verification:',JSON.stringify({financialReceiptCount:result.financialReceiptCount,financialAmount:result.financialAmount,numberCells:amountChanges.map(x=>x.sheet+'!'+x.cell+'='+x.value)}));
if(result.financialReceiptCount!==4||Math.abs(result.financialAmount-1148.62)>0.001)throw Error('Actual ZSL workbook did not receive four verified receipts totaling 1148.62 EUR.');
if(!result.formulaCache||result.formulaCache.updated<4)throw Error('Source ZSL workbook formula caches were not refreshed for Quick Look.');
const values=(await JSZip.loadAsync(result.blob));
const xmlNs='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const contentAt=async (sheetFile,cell)=>{
 const doc=new DOMParser().parseFromString(await values.file('xl/worksheets/'+sheetFile).async('string'),'application/xml');
 const c=Array.from(doc.getElementsByTagNameNS(xmlNs,'c')).find(x=>x.getAttribute('r')===cell);
 if(!c)throw Error('Missing original output cell '+cell);
 return {value:c.getElementsByTagNameNS(xmlNs,'v')[0]?.textContent||'',
   formula:c.getElementsByTagNameNS(xmlNs,'f')[0]?.textContent||''};
};
for(const [file,cell,expected,expectedFormula] of [
 ['sheet3.xml','H3',127.78,'I11+I17+I23+I36'],
 ['sheet3.xml','H38',315,'H45'],
 ['sheet3.xml','H47',650,'H56'],
 ['sheet1.xml','I32',127.78,"SUM('s.3 - výdavky'!H3:I3)"],
 ['sheet1.xml','I33',315,"SUM('s.3 - výdavky'!H38:I38)"],
 ['sheet1.xml','I34',650,"SUM('s.3 - výdavky'!H47:I47)"],
 ['sheet5.xml','L74',55.84,'J74/K74']
]){
 const actual=await contentAt(file,cell);
 if(Math.abs(Number(actual.value)-expected)>0.0001||actual.formula!==expectedFormula)
  throw Error('Formula or cached result missing: '+file+'!'+cell+' '+JSON.stringify(actual)+' expected '+expected);
}
const dateCell=await contentAt('sheet1.xml','B12');
if(Math.abs(Number(dateCell.value)-46335)>30||!Number.isFinite(Number(dateCell.value)))
 throw Error('Original trip departure date was not stored as Excel serial number.');
console.log('Formula-cache audit passed:',JSON.stringify({cached:result.formulaCache.updated,unsupported:result.formulaCache.unsupported}));
// No private image in CI: this is a synthetic OCR text fixture representing diesel.
if(!String((await values.file('xl/worksheets/sheet3.xml').async('string'))).includes('Diesel')||
   !result.changes.some(x=>x.cell==='C26'&&/^09\.11\.26 – Diesel$/.test(String(x.value))))
 throw Error('Real official ZSL C26 must show receipt date and short purchased item Diesel, not vendor Gutmann.');

if(!result.integrity||result.integrity.preservedFormulas<50||result.integrity.preservedStyles<500)
 throw Error('ZSL original formula or style integrity audit failed: '+JSON.stringify(result.integrity));
const department=await contentAt('sheet1.xml','G6');
if(!department.value&&!(await values.file('xl/worksheets/sheet1.xml').async('string')).includes('Sekcia modernych disciplin'))
 throw Error('Trainer department not recorded in original G6 cell');
const twoMeals={...data,expenses:[...data.expenses,
 {id:'food-2',category:'food',zsl_section:'foreign_meal',merchant:'Guesthouse',amount:20,
  receipt_path:'receipt5',spent_on:'2026-11-09',payment_method:'cash',ocr:{autoReady:true,reviewed:false}}]};
const twice=await createFilledXlsx(blob,twoMeals,{...xml,allowExisting:true});
if(twice.financialReceiptCount!==5||Math.abs(twice.financialAmount-1168.62)>0.001)
 throw Error('Second foreign meal was not included in original ZSL costs.');
const twoZip=await JSZip.loadAsync(twice.blob);
const mealDoc=new DOMParser().parseFromString(await twoZip.file('xl/worksheets/sheet5.xml').async('string'),'application/xml');
const cellAt=ref=>Array.from(mealDoc.getElementsByTagNameNS(xmlNs,'c')).find(c=>c.getAttribute('r')===ref);
const l75=cellAt('L75');
const existingShared=l75?.getElementsByTagNameNS(xmlNs,'f')[0];
if(!(existingShared?.getAttribute('t')==='shared'||existingShared?.textContent==='J75/K75')||
   Math.abs(Number(l75?.getElementsByTagNameNS(xmlNs,'v')[0]?.textContent)-20)>0.001)
 throw Error('Second food receipt must keep the original shared J75/K75 formula and refresh the cached EUR amount');
console.log('Second foreign meal formula and original ZSL integrity checks passed.');


for(const [sheet,cell,value] of [
 ['s.3 - výdavky','H26',127.78],
 ['s.3 - výdavky','H40',315],
 ['s.3 - výdavky','H49',650],
 ['s.4 - stravné zahr.','J74',55.84]
]){
 if(!result.changes.some(x=>x.sheet===sheet&&x.cell===cell&&x.value===value))
  throw Error('Missing source workbook value '+sheet+'!'+cell+' expected '+value);
}
if(result.changes.length<2)throw new Error('Original workbook structure cannot be safely filled.');
const after=await inspectZslXlsx(result.blob,xml);
if(after.sheets.length!==info.sheets.length)throw new Error('Writer changed worksheet count.');
console.log('Original template XLSX writer test succeeded.');
