import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DOMParser} from '@xmldom/xmldom';
import {refreshFormulaCaches,CORE_ZSL_FORMULA_CELLS} from '../src/zsl-formula-cache.mjs';
import {excelDateSerial,buildTemplatePatches} from '../src/zsl-template-map.mjs';
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
function workbookSheet(cells){
 const xml=new DOMParser().parseFromString('<worksheet xmlns="'+ns+'"><sheetData/></worksheet>','application/xml');
 const data=xml.getElementsByTagNameNS(ns,'sheetData')[0];
 const rows=new Map();
 for(const [cell,v] of Object.entries(cells)){
  const n=Number(cell.match(/\d+$/)[0]);
  if(!rows.has(n)){const row=xml.createElementNS(ns,'row');row.setAttribute('r',String(n));rows.set(n,row);data.appendChild(row)}
  const c=xml.createElementNS(ns,'c');c.setAttribute('r',cell);c.setAttribute('s','3');
  if(typeof v==='object'&&v.formula!=null){
   const f=xml.createElementNS(ns,'f');f.textContent=v.formula;c.appendChild(f);
   const old=xml.createElementNS(ns,'v');old.textContent=String(v.cached||0);c.appendChild(old);
  }else{const old=xml.createElementNS(ns,'v');old.textContent=String(v);c.appendChild(old)}
  rows.get(n).appendChild(c);
 }
 return xml;
}
function cell(xml,ref){
 return Array.from(xml.getElementsByTagNameNS(ns,'c')).find(c=>c.getAttribute('r')===ref);
}
function val(xml,ref){return Number(cell(xml,ref)?.getElementsByTagNameNS(ns,'v')[0]?.textContent)}
test('original formula XML survives while cached ZSL cost totals are refreshed',()=>{
 const source=workbookSheet({
  H26:127.78,H40:315,H49:650,
  I36:{formula:'SUM(H26:I35)',cached:0},
  H3:{formula:'I11+I17+I23+I36',cached:0},
  I11:{formula:'SUM(I6:I10)',cached:0},
  I17:{formula:'SUM(I14:I16)',cached:0},
  I23:{formula:'SUM(I20:I22)',cached:0},
  H45:{formula:'SUM(H40:I44)',cached:0},
  H38:{formula:'H45',cached:0},
  H56:{formula:'SUM(H49:I55)',cached:0},
  H47:{formula:'H56',cached:0}
 });
 const summary=workbookSheet({
  I30:2000,
  I32:{formula:"SUM('s.3 - výdavky'!H3:I3)",cached:0},
  I33:{formula:"SUM('s.3 - výdavky'!H38:I38)",cached:0},
  I34:{formula:"SUM('s.3 - výdavky'!H47:I47)",cached:0},
  I35:0,I36:0,I37:0,I38:0,
  I39:{formula:'SUM(I32:J38)',cached:0},
  I40:{formula:'I30-I39',cached:0}
 });
 const map=new Map([['s.3 - výdavky',source],['s.1 - pokyn',summary]]);
 const formulaText=cell(summary,'I32').getElementsByTagNameNS(ns,'f')[0].textContent;
 const out=refreshFormulaCaches(map,{targets:CORE_ZSL_FORMULA_CELLS});
 assert.equal(out.unsupported,0);
 assert.equal(val(source,'H3'),127.78);
 assert.equal(val(source,'H38'),315);
 assert.equal(val(source,'H47'),650);
 assert.equal(val(summary,'I32'),127.78);
 assert.equal(val(summary,'I33'),315);
 assert.equal(val(summary,'I34'),650);
 assert.equal(val(summary,'I39'),1092.78);
 assert.equal(val(summary,'I40'),907.22);
 assert.equal(cell(summary,'I32').getElementsByTagNameNS(ns,'f')[0].textContent,formulaText);
 assert.equal(cell(summary,'I32').getAttribute('s'),'3');
});
test('foreign meal reimbursement MIN formula handles receipt total, remaining diet and preserves text',()=>{
 const meal=workbookSheet({
  J74:55.84,K74:1,L74:{formula:'J74/K74',cached:0},
  J75:20,K75:1,L75:{formula:'J75/K75',cached:0},
  L32:38,L33:38,
  L108:{formula:'SUM(L74:L107)',cached:0},
  H111:{formula:'MIN(SUM(L32:L65),L108)',cached:0}
 });
 const changed=refreshFormulaCaches(new Map([['s.4 - stravné zahr.',meal]]),{
   targets:[{sheet:'s.4 - stravné zahr.',cell:'L74'}, {sheet:'s.4 - stravné zahr.',cell:'L75'},
    {sheet:'s.4 - stravné zahr.',cell:'L108'},{sheet:'s.4 - stravné zahr.',cell:'H111'}]});
 assert.equal(changed.unsupported,0);
 assert.equal(val(meal,'L74'),55.84);
 assert.equal(val(meal,'L75'),20);
 assert.equal(val(meal,'L108'),75.84);
 assert.equal(val(meal,'H111'),75.84);
});
test('unsupported lookups are not replaced or assigned fabricated amounts',()=>{
 const sheet=workbookSheet({L4:{formula:'IFERROR(VLOOKUP(F4,Other!A1:B5,2,0),"")',cached:0}});
 const source=cell(sheet,'L4').getElementsByTagNameNS(ns,'f')[0].textContent;
 const out=refreshFormulaCaches(new Map([['s.4 - stravné zahr.',sheet]]),{
  targets:[{sheet:'s.4 - stravné zahr.',cell:'L4'}]});
 assert.equal(out.updated,0);assert.equal(out.unsupported,1);
 assert.equal(cell(sheet,'L4').getElementsByTagNameNS(ns,'f')[0].textContent,source);
});
test('dates are actual Excel numeric dates, not strings that break original calculations',()=>{
 const d=excelDateSerial('2026-11-09');
 assert.equal(d,(Date.UTC(2026,10,9)-Date.UTC(1899,11,30))/86400000);
 const made=buildTemplatePatches({event:{startsOn:'2026-11-09',endsOn:'2026-11-10',currency:'EUR'},trainer:{}});
 const start=made.patches.find(x=>x.sheet==='s.1 - pokyn'&&x.cell==='B12');
 const end=made.patches.find(x=>x.sheet==='s.1 - pokyn'&&x.cell==='J12');
 assert.equal(start.kind,'number');assert.equal(start.value,d);
 assert.equal(end.kind,'number');assert.equal(end.value,d+1);
});
