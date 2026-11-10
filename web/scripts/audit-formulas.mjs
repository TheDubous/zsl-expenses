import JSZip from 'jszip';
import {readFile} from 'node:fs/promises';
import {DOMParser} from '@xmldom/xmldom';
const bytes=await readFile('web/public/ZSL-Cestovny-prikaz.xlsx');
const zip=await JSZip.loadAsync(bytes);
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const sheets=[['s.1 - pokyn',1],['s.3 - výdavky',3],['s.4 - stravné tuzem.',4],['s.4 - stravné zahr.',5],['s.6 - správa',7]];
for(const [name,idx] of sheets){
 const text=await zip.file('xl/worksheets/sheet'+idx+'.xml').async('string');
 const xml=new DOMParser().parseFromString(text,'application/xml');
 const formulas=Array.from(xml.getElementsByTagNameNS(ns,'c')).flatMap(c=>{
  const f=c.getElementsByTagNameNS(ns,'f')[0],v=c.getElementsByTagNameNS(ns,'v')[0];
  if(!f)return [];
  return [{cell:c.getAttribute('r'),formula:f.textContent,value:v?.textContent??null,type:c.getAttribute('t')||'n'}];
 });
 console.log('FORMULA-SHEET',name,'TOTAL',formulas.length);
 console.log('FORMULA-SET',name,JSON.stringify(formulas.filter(x=>
  name==='s.1 - pokyn'?Number(x.cell.match(/\d+/)[0])>=28&&Number(x.cell.match(/\d+/)[0])<=49:
  name==='s.3 - výdavky'?true:
  name==='s.4 - stravné zahr.'?/^(H|I|J|K|L|M|N|O|P|Q)\d+$/.test(x.cell):
  false
 ).slice(0,95)));
}

const inputs=[
 ['s.1 - pokyn',1,['B12','J12','C12','K12','I30','I32','I33','I34','I35','I36','I37','I38','I39','I40']],
 ['s.4 - stravné tuzem.',4,['H85','H86']],
 ['s.4 - stravné zahr.',5,['L74','L75','L76','H110','I110','H111','I111','B74','B75']]
];
for(const [name,index,refs] of inputs){
 const xml=new DOMParser().parseFromString(await zip.file('xl/worksheets/sheet'+index+'.xml').async('string'),'application/xml');
 const cells=Array.from(xml.getElementsByTagNameNS(ns,'c'));
 console.log('IMPORTANT-CELLS',name,JSON.stringify(refs.map(ref=>{
  const cell=cells.find(c=>c.getAttribute('r')===ref);
  return {ref,style:cell?.getAttribute('s')||'',type:cell?.getAttribute('t')||'',f:cell?.getElementsByTagNameNS(ns,'f')[0]?.textContent||null,v:cell?.getElementsByTagNameNS(ns,'v')[0]?.textContent||null};
 })));
}

const sharedXml=new DOMParser().parseFromString(await zip.file('xl/sharedStrings.xml').async('string'),'application/xml');
const strs=Array.from(sharedXml.getElementsByTagNameNS(ns,'si')).map(si=>Array.from(si.getElementsByTagNameNS(ns,'t')).map(t=>t.textContent).join(''));
for(const [label,sheetNumber,rows] of [['s.1 - pokyn',1,22],['s.6 - správa',7,32]]){
 const xml=new DOMParser().parseFromString(await zip.file('xl/worksheets/sheet'+sheetNumber+'.xml').async('string'),'application/xml');
 for(const row of Array.from(xml.getElementsByTagNameNS(ns,'row')).filter(r=>Number(r.getAttribute('r'))<=rows)){
  const selected=Array.from(row.getElementsByTagNameNS(ns,'c')).flatMap(c=>{
   const ref=c.getAttribute('r'),v=c.getElementsByTagNameNS(ns,'v')[0]?.textContent||'';
   const f=c.getElementsByTagNameNS(ns,'f')[0]?.textContent||'';
   const value=c.getAttribute('t')==='s'?strs[Number(v)]:v;
   return value||f?[ref+'='+String(value||'='+f).slice(0,55)]:[];
  });
  if(selected.length)console.log('SOURCE-LABELS',label,'row',row.getAttribute('r'),selected.slice(0,15).join(' | '));
 }
}
