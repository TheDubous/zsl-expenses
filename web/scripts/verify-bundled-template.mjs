import {readFile} from 'node:fs/promises';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {inspectZslXlsx,createFilledXlsx} from '../src/zsl-xlsx.js';
const bytes=await readFile('web/public/ZSL-Cestovny-prikaz.xlsx');
const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
const xml={DOMParserCtor:DOMParser,XMLSerializerCtor:XMLSerializer};
const info=await inspectZslXlsx(blob,xml);
console.log('Official template:',JSON.stringify({variant:info.variant,sheets:info.sheets.length,hasExistingTrip:info.hasExistingTrip,existing:info.existing.length,existingCells:info.existing}));
if(info.variant!=='official'||info.sheets.length!==11)
 throw new Error('Downloaded template is not the approved 11-sheet official version.');
// Public official workbook: inspect numeric placeholder cells, not personal data.
const rawZip=(await import('jszip')).default;
const parts=await rawZip.loadAsync(bytes);
const expenseSheet=await parts.file('xl/worksheets/sheet3.xml').async('string');
for(const ref of ['H25','H39','H48']){
 const escaped=expenseSheet.match(new RegExp('<c\\b[^>]*\\br="'+ref+'"[^>]*>([\\s\\S]*?)<\\/c>'));
 console.log('Official default cell '+ref+':',escaped?escaped[1].slice(0,150):'NO CELL');
}
const data={
 event:{name:'SANDBOX',kind:'Sústredenie',startsOn:'2026-11-09',endsOn:'2026-11-10',
  startPlace:'Test',location:'Test',country:'AUT',purpose:'SBX',currency:'EUR'},
 trainer:{name:'TEST TRAINER',address:'Test',contact:'000000',iban:'SK0000000000000000000000'},
 riders:[],funding:[],expenses:[]
};
const result=await createFilledXlsx(blob,data,{...xml,allowExisting:true});
console.log('Write into actual official template:',JSON.stringify({changed:result.changes.length,conflicts:result.conflicts.length,warnings:result.warnings.length,skipped:result.skipped.length,example:result.changes.slice(0,7).map(x=>x.cell)}));
if(result.changes.length<2)throw new Error('Original workbook structure cannot be safely filled.');
const after=await inspectZslXlsx(result.blob,xml);
if(after.sheets.length!==info.sheets.length)throw new Error('Writer changed worksheet count.');
console.log('Original template XLSX writer test succeeded.');
