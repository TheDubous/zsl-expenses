import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {REQUIRED_SHEETS} from '../src/zsl-template-map.mjs';
import {buildEventArchive} from '../src/archive.js';

const xml={DOMParserCtor:DOMParser,XMLSerializerCtor:XMLSerializer};
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const names=[REQUIRED_SHEETS[0],'s.2 - súhlas MV',...REQUIRED_SHEETS.slice(1)];
const base='<?xml version="1.0" encoding="UTF-8"?>';
function sheet(cells=[]){
 const rows=new Map();
 for(const [ref,raw] of cells){
  const row=Number(ref.match(/\d+$/)[0]);
  if(!rows.has(row))rows.set(row,[]);
  rows.get(row).push([ref,raw]);
 }
 return base+'<worksheet xmlns="'+NS+'"><sheetData>'+
  [...rows.entries()].sort((a,b)=>a[0]-b[0]).map(([row,cols])=>
   '<row r="'+row+'">'+cols.map(([ref,raw])=>
    '<c r="'+ref+'" s="3">'+raw+'</c>').join('')+'</row>').join('')+
  '</sheetData></worksheet>';
}
async function sampleTemplate(){
 const zip=new JSZip();
 const sheets=names.map((name,i)=>'<sheet name="'+name+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('');
 zip.file('xl/workbook.xml',base+'<workbook xmlns="'+NS+
   '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
   '<sheets>'+sheets+'</sheets><calcPr calcId="123"/></workbook>');
 zip.file('xl/_rels/workbook.xml.rels',base+
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
  names.map((_,i)=>'<Relationship Id="rId'+(i+1)+
   '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"'+
   ' Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+
  '</Relationships>');
 for(let i=0;i<names.length;i++){
  const name=names[i];
  const cells=name==='s.1 - pokyn'?
   [['B12',''],['B4',''],['I32',"<f>SUM('s.3 - výdavky'!H3:I3)</f><v>0</v>"]]:
   name==='s.3 - výdavky'?
   [['C26',''],['F26',''],['H26',''],['C49',''],['F49',''],['H49',''],
    ['H3','<f>H26</f><v>0</v>']]:
   name==='s.4 - stravné zahr.'?
   [['B74',''],['C74',''],['F74',''],['I74',''],['J74',''],['K74','<v>1</v>'],
    ['L74','<f>J74/K74</f><v>0</v>']]:[['A1','']];
  zip.file('xl/worksheets/sheet'+(i+1)+'.xml',sheet(cells));
 }
 // Independent package part should survive the workbook export unchanged.
 zip.file('xl/media/original.png',new Uint8Array([137,80,78,71,13,10,26,10]));
 return new Blob([await zip.generateAsync({type:'uint8array'})]);
}
const event={id:'trip',name:'SBX Test',currency:'EUR',startsOn:'2026-11-03',
 endsOn:'2026-11-05',location:'Pitztal',purpose:'Training',trainerId:'coach'};
const trainer={name:'Test trainer'};
const fuel={id:'diesel',eventId:'trip',receipt_path:'r1',receipt_name:'photo.jpg',
 amount:127.78,spent_on:'2026-11-03',itemLabel:'Diesel',
 merchant:'Gutmann',category:'fuel',payment_method:'card'};
function formula(xml,ref){
 const doc=new DOMParser().parseFromString(xml,'application/xml');
 const cell=Array.from(doc.getElementsByTagNameNS(NS,'c')).find(c=>c.getAttribute('r')===ref);
 return {text:cell?.getElementsByTagNameNS(NS,'f')[0]?.textContent??null,
  value:cell?.getElementsByTagNameNS(NS,'v')[0]?.textContent??null};
}
const options=(templateBlob)=>({trainer,riders:[],templateBlob,xlsxOptions:xml,
 documentReader:async(table,id)=>id==='r1'?
  {id,name:'photo.jpg',blob:new Blob([new Uint8Array([12,34,56])])}:null});
test('ZIP of a settlement contains the real editable 11-sheet ZSL XLSX with original formulas',async()=>{
 const source=await sampleTemplate();
 const out=await buildEventArchive(event,[fuel],[],options(source));
 assert.equal(out.financialReceiptCount,1);
 assert.equal(out.expectedReceiptCount,1);
 const outer=await JSZip.loadAsync(out.blob);
 const workbookFile=outer.file(out.workbookFilename);
 assert.ok(workbookFile,'A complete .xlsx must be present, not only CSV');
 assert.ok(outer.file('Kontrola_vzorcu_a_exportu.txt'));
 assert.ok(outer.file('Vydaje.csv'));
 assert.ok(outer.file('Doklady/001_Gutmann/Uctenka_photo.jpg'));
 const audit=await outer.file('Kontrola_vzorcu_a_exportu.txt').async('string');
 assert.match(audit,/Zachované původní vzorce/);
 assert.match(audit,/Původní listy: 11/);
 const before=await JSZip.loadAsync(source);
 const after=await JSZip.loadAsync(await workbookFile.async('uint8array'));
 const beforeWB=await before.file('xl/workbook.xml').async('string');
 const afterWB=await after.file('xl/workbook.xml').async('string');
 for(const name of names){
  assert.ok(beforeWB.includes('name="'+name+'"'));
  assert.ok(afterWB.includes('name="'+name+'"'));
 }
 for(const [file,ref] of [['sheet1.xml','I32'],['sheet3.xml','H3'],['sheet5.xml','L74']]){
  const original=await before.file('xl/worksheets/'+file).async('string');
  const filled=await after.file('xl/worksheets/'+file).async('string');
  assert.equal(formula(filled,ref).text,formula(original,ref).text,file+' '+ref+' formula');
 }
 assert.equal(formula(await after.file('xl/worksheets/sheet3.xml').async('string'),'H26').value,'127.78');
 assert.deepEqual(await after.file('xl/media/original.png').async('uint8array'),
  await before.file('xl/media/original.png').async('uint8array'));
 assert.match(afterWB,/fullCalcOnLoad="1"/);
});
test('a partial export with no eligible expenses still includes an editable ZSL XLSX for manual completion',async()=>{
 const source=await sampleTemplate();
 const pending={...fuel,id:'unassigned',amount:0,receipt_path:'r1'};
 const out=await buildEventArchive(event,[pending],[],options(source));
 assert.equal(out.financialReceiptCount,0);
 assert.equal(out.skipped.length,1);
 const zip=await JSZip.loadAsync(out.blob);
 assert.ok(zip.file(out.workbookFilename));
 assert.match(await zip.file('Kontrola_vzorcu_a_exportu.txt').async('string'),/NEZAPSANÉ ÚČTENKY/);
 assert.match(await zip.file('Kontrola_vzorcu_a_exportu.txt').async('string'),/částka nebyla nalezena/);
});
