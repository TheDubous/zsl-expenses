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
 const formulas=[...xml.getElementsByTagNameNS(ns,'c')].flatMap(c=>{
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
