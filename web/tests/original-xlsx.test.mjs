import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {REQUIRED_SHEETS,buildTemplatePatches} from '../src/zsl-template-map.mjs';
import {inspectZslXlsx,createFilledXlsx,ensureBundledZslTemplate,getTemplateInfo} from '../src/zsl-xlsx.js';
import 'fake-indexeddb/auto';

const X={DOMParserCtor:DOMParser,XMLSerializerCtor:XMLSerializer};
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
const aCell=(addr,content='',style=3)=>'<c r="'+addr+'" s="'+style+'">'+content+'</c>';
const cellValue=(xml,cell)=>{
 const doc=new DOMParser().parseFromString(xml,'application/xml');
 for(const c of Array.from(doc.getElementsByTagName('c'))){
  if(c.getAttribute('r')===cell)return c;
 }
 return null;
};
const xmlCellValue=c=>c?.getElementsByTagName('v')[0]?.textContent||c?.getElementsByTagName('t')[0]?.textContent||'';
function sheetFromCells(cells){
 const rows=new Map();
 for(const [ref,raw] of cells){
  const row=Number(ref.match(/\d+$/)[0]);
  if(!rows.has(row))rows.set(row,[]);
  rows.get(row).push([ref,raw]);
 }
 const out=[...rows.entries()].sort((a,b)=>a[0]-b[0]).map(([i,list])=>{
  const order=ref=>{let n=0;for(const c of ref.replace(/\d/g,''))n=n*26+c.charCodeAt(0)-64;return n};
  return '<row r="'+i+'">'+list.sort((a,b)=>order(a[0])-order(b[0])).map(([ref,raw])=>aCell(ref,raw)).join('')+'</row>';
 }).join('');
 return '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+out+'</sheetData></worksheet>';
}
async function syntheticTemplate({prefilledTrip=false,variant='user-double-log'}={}){
 const names=variant==='official'
 ? [REQUIRED_SHEETS[0],'s.2 - súhlas MV',...REQUIRED_SHEETS.slice(1)]
 : [...REQUIRED_SHEETS.slice(0,5),'s.5 - kniha jázd_Kufel_2',...REQUIRED_SHEETS.slice(5)];
 const zip=new JSZip();
 const main='<?xml version="1.0" encoding="UTF-8"?>';
 const sheets=names.map((name,i)=>'<sheet name="'+esc(name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('');
 zip.file('xl/workbook.xml',main+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets+'</sheets><calcPr calcId="123"/></workbook>');
 const rels=names.map((name,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('');
 zip.file('xl/_rels/workbook.xml.rels',main+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+rels+'</Relationships>');
 const filled1=new Map([
  ['B4',''],['G4',''],['B6',''],['B8',''],['H8',''],['B12',''],['C12',''],['D12',''],
  ['F12',''],['H12',''],['J12',''],['K12',''],['L12',''],['B18',''],['F18',''],['I30',''],
  ['I39','<f>SUM(I32:J38)</f><v>0</v>']
 ]);
 for(let i=18;i<28;i++)filled1.set('D'+i,'');
 if(prefilledTrip)filled1.set('B12','<is><t>28.01.26</t></is>');
 const s3=new Map();
 for(let i=24;i<=33;i++)for(const col of ['C','F','H'])s3.set(col+i,'');
 // The user's template can contain populated vehicle samples. Never overwrite them.
 s3.set('C24','<is><t>Old vehicle sample</t></is>');
 s3.set('H34','<f>SUM(H24:I33)</f><v>0</v>');
 for(let i=6;i<=8;i++)for(const col of ['C','D','I'])s3.set(col+i,'');
 for(let i=38;i<=42;i++)for(const col of ['C','F','H'])s3.set(col+i,'');
 for(let i=47;i<=59;i++)for(const col of ['C','F','H'])s3.set(col+i,'');
 const s4=new Map();
 for(let i=74;i<=107;i++)for(const col of ['B','C','F','I','J'])s4.set(col+i,'');
 const s6=new Map([['B3',''],['D20',''],['I20',''],['C26',''],['F26','']]);
 for(let i=27;i<47;i++)for(const col of ['C','F'])s6.set(col+i,'');
 for(let i=0;i<names.length;i++){
  const name=names[i];
  zip.file('xl/worksheets/sheet'+(i+1)+'.xml',sheetFromCells(
    name==='s.1 - pokyn'?filled1:name==='s.3 - výdavky'?s3:
    name==='s.4 - stravné zahr.'?s4:name==='s.6 - správa'?s6:new Map([['A1','']])));

 }
 zip.file('xl/media/irrelevant-image.png',new Uint8Array([137,80,78,71,13,10,26,10]));
 const bytes=await zip.generateAsync({type:'uint8array'});
 return new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
const event={name:'Pitztal Test',startsOn:'2026-11-02',endsOn:'2026-11-03',startTime:'13:30',endTime:'16:45',currency:'EUR',location:'Pitztal',country:'AUT',purpose:'SBX'};
const trainer={name:'Test Coach',role:'Trainer',address:'Test 1',contact:'555123',iban:'SK0000000000000000000000'};
const expense=(id,value)=>({id,category:'fuel',zsl_section:'zsl_car',merchant:'Diesel Test',amount:value,spent_on:'2026-11-02',payment_method:'cash',receipt_path:id});
test('original ZSL file with all 11 worksheets passes schema validation',async()=>{
 const file=await syntheticTemplate();
 const info=await inspectZslXlsx(file,X);
 assert.equal(info.sheets.length,11);
 assert.ok(info.sheets.includes('s.5 - kniha jázd_Kufel_2'));
 assert.equal(info.variant,'user-double-log');
});
test('preserves populated source cells, formulae and image bytes while shifting a receipt to free cells',async()=>{
 const file=await syntheticTemplate();
 const original=await JSZip.loadAsync(file);
 const {blob,changes,conflicts}=await createFilledXlsx(file,{event,trainer,riders:[{name:'Test Rider'}],expenses:[expense('a',26.9),expense('b',100)],funding:[{kind:'advance',amount:2000}]},X);
 assert.equal(conflicts.length,0);
 assert.ok(changes.some(x=>x.sheet==='s.3 - výdavky'&&x.cell==='H25'&&x.value===26.9));
 assert.ok(changes.some(x=>x.sheet==='s.3 - výdavky'&&x.cell==='H26'&&x.value===100));
 assert.ok(changes.some(x=>x.cell==='C12'&&x.value===.5625));
 const zip=await JSZip.loadAsync(blob);
 const baseXml=await original.file('xl/worksheets/sheet2.xml').async('string');
 const newXml=await zip.file('xl/worksheets/sheet2.xml').async('string');
 assert.equal(xmlCellValue(cellValue(baseXml,'C24')),'Old vehicle sample');
 assert.equal(xmlCellValue(cellValue(newXml,'C24')),'Old vehicle sample');
 assert.equal(cellValue(newXml,'H34').getElementsByTagName('f')[0].textContent,'SUM(H24:I33)');
 assert.equal(xmlCellValue(cellValue(newXml,'H25')),'26.9');
 assert.equal(cellValue(newXml,'C25').getAttribute('s'),'3');
 assert.deepEqual(await zip.file('xl/media/irrelevant-image.png').async('uint8array'),
                  await original.file('xl/media/irrelevant-image.png').async('uint8array'));
 const wb=await zip.file('xl/workbook.xml').async('string');
 assert.match(wb,/fullCalcOnLoad="1"/);
 for(let i=0;i<11;i++)assert.ok(zip.file('xl/worksheets/sheet'+(i+1)+'.xml'));
});
test('unsafe card documents are skipped, original existing values are not overwritten',()=>{
 const result=buildTemplatePatches({event,trainer,expenses:[{...expense('c',40),payment_method:'card',bank_path:null}],funding:[]});
 assert.equal(result.patches.some(x=>x.group==='receipt:c'),false);
 assert.equal(result.skipped.length,1);
});

test('a filled Colere-like source cannot silently mix with a new event',async()=>{
 const file=await syntheticTemplate({prefilledTrip:true});
 const info=await inspectZslXlsx(file,X);
 assert.equal(info.hasExistingTrip,true);
 assert.ok(info.existing.includes('s.1 - pokyn!B12'));
 await assert.rejects(()=>createFilledXlsx(file,{event,trainer,riders:[],expenses:[],funding:[]},X),/obsahuje termíny nebo výdaje předchozí cesty/);
 const allowed=await createFilledXlsx(file,{event,trainer,riders:[],expenses:[],funding:[]},{...X,allowExisting:true});
 const zip=await JSZip.loadAsync(allowed.blob);
 const s1=await zip.file('xl/worksheets/sheet1.xml').async('string');
 assert.equal(xmlCellValue(cellValue(s1,'B12')),'28.01.26');
});

test('official published variant with s.2 vehicle consent is supported without a manual file upload',async()=>{
 const file=await syntheticTemplate({variant:'official'});
 const inspected=await inspectZslXlsx(file,X);
 assert.equal(inspected.variant,'official');
 assert.equal(inspected.sheets.length,11);
 const visited=[];
 const loaded=await ensureBundledZslTemplate({
   basePath:'/zsl-expenses/',
   fetchFn:async (path)=>{visited.push(path);return {ok:true,blob:async()=>file}},
   options:X
 });
 assert.equal(visited[0],'/zsl-expenses/ZSL-Cestovny-prikaz.xlsx');
 assert.equal(loaded.source,'official-bundled');
 assert.equal(loaded.variant,'official');
 const again=await ensureBundledZslTemplate({fetchFn:()=>{throw Error('should not fetch again')}});
 assert.equal(again.source,'official-bundled');
});
