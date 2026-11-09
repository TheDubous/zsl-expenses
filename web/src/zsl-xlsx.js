import JSZip from 'jszip';
import {buildTemplatePatches,REQUIRED_SHEETS,VARIANT_SHEETS,TEMPLATE_ID} from './zsl-template-map.mjs';
import {getOne,putOne} from './localdb.js';
import {downloadBlob} from './archive.js';
import {safeFilename} from './utils.mjs';

const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RNS='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG='http://schemas.openxmlformats.org/package/2006/relationships';

function parseXml(text,Parser=globalThis.DOMParser){
 if(!Parser)throw new Error('Chybí XML parser tohoto prohlížeče.');
 const xml=new Parser().parseFromString(text,'application/xml');
 if(xml.getElementsByTagName('parsererror').length)throw new Error('Šablona obsahuje chybný XML soubor.');
 return xml;
}
function descendants(node,name,namespace=NS){
 return Array.from(node.getElementsByTagNameNS(namespace,name));
}
function direct(parent,name){
 return Array.from(parent.childNodes||[]).find(x=>x.nodeType===1&&x.localName===name&&x.namespaceURI===NS)||null;
}
function resolvePart(target){
 if(!target)throw new Error('XLSX nemá odkaz na list.');
 const path=target.startsWith('/')?target.slice(1):'xl/'+target;
 const stack=[];
 for(const part of path.split('/')){
  if(part==='..')stack.pop();
  else if(part&&part!=='.')stack.push(part);
 }
 return stack.join('/');
}
async function readWorkbook(zip,options){
 const workbookXml=await zip.file('xl/workbook.xml')?.async('string');
 const relsXml=await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
 if(!workbookXml||!relsXml)throw new Error('Soubor není platná excelová šablona XLSX.');
 const book=parseXml(workbookXml,options.DOMParserCtor);
 const rels=parseXml(relsXml,options.DOMParserCtor);
 const relationshipMap=new Map(descendants(rels,'Relationship',PKG).map(x=>[x.getAttribute('Id'),resolvePart(x.getAttribute('Target'))]));
 const sheets=new Map();
 for(const node of descendants(book,'sheet')){
  const relid=node.getAttributeNS(RNS,'id')||node.getAttribute('r:id');
  if(!relationshipMap.has(relid))throw new Error('Neznámý odkaz listu '+node.getAttribute('name'));
  const path=relationshipMap.get(relid);
  if(!zip.file(path))throw new Error('V šabloně chybí list: '+path);
  sheets.set(node.getAttribute('name'),path);
 }
 return {book,sheets};
}
export async function inspectZslXlsx(blob,options={}){
 if(!blob||blob.size>15*1024*1024)throw new Error('Vyber původní XLSX menší než 15 MB.');
 const zip=await JSZip.loadAsync(blob,{checkCRC32:true});
 const {sheets}=await readWorkbook(zip,options);
 const missing=REQUIRED_SHEETS.filter(name=>!sheets.has(name));
 if(missing.length)throw new Error('Soubor neodpovídá původnímu formuláři ZSL. Chybí listy: '+missing.join(', '));
 // A completed example workbook can contain old financial entries. Do not silently
 // mix them with a NEW event. Vehicle samples in the car log are not treated as
 // expenses, so those may be safely retained.
 const financialCells={
  's.1 - pokyn':['B12','J12'],
  's.3 - výdavky':[
    ...Array.from({length:3},(_,i)=>'I'+(i+6)),
    ...Array.from({length:10},(_,i)=>'H'+(i+24)),
    ...Array.from({length:5},(_,i)=>'H'+(i+38)),
    ...Array.from({length:13},(_,i)=>'H'+(i+47))
  ],
  's.4 - stravné zahr.':Array.from({length:34},(_,i)=>'J'+(i+74))
 };
 const existing=[];
 for(const [sheet,refs] of Object.entries(financialCells)){
  const doc=parseXml(await zip.file(sheets.get(sheet)).async('string'),options.DOMParserCtor);
  const data=descendants(doc,'sheetData')[0];
  for(const ref of refs){
   const cell=sourceCell(data,ref);
   if(cell&&occupied(cell))existing.push(sheet+'!'+ref);
  }
 }
 const names=[...sheets.keys()];
 const variant=names.includes('s.2 - súhlas MV')?'official':
   names.includes('s.5 - kniha jázd_Kufel_2')?'user-double-log':'unknown';
 return {sheets:names,size:blob.size,variant,existing,hasExistingTrip:existing.length>0};
}
export async function storeOriginalTemplate(file,options={}){
 if(!file||!/\.xlsx$/i.test(file.name))throw new Error('Vyber originální soubor ZSL ve formátu XLSX.');
 const inspected=await inspectZslXlsx(file,options);
 await putOne('documents',{
  id:TEMPLATE_ID,kind:'template',name:file.name,
  type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  blob:new Blob([await file.arrayBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),
  createdAt:new Date().toISOString(),
  hasExistingTrip:inspected.hasExistingTrip,existingCount:inspected.existing.length,
  variant:inspected.variant,source:'user'
 });
 return {...inspected,filename:file.name};
}
export async function getTemplateInfo(){
 const doc=await getOne('documents',TEMPLATE_ID);
 return doc?{name:doc.name,createdAt:doc.createdAt,size:doc.blob?.size||0,
  hasExistingTrip:!!doc.hasExistingTrip,existingCount:doc.existingCount||0,
  source:doc.source||'user',variant:doc.variant||'unknown'}:null;
}
// The PWA ships a vetted PUBLIC template. Do not overwrite a user-selected
// private workbook already saved in IndexedDB. A first successful load is stored
// locally, enabling the original workbook export without an upload dialog.
let defaultTemplatePromise=null;
export async function ensureBundledZslTemplate({fetchFn=globalThis.fetch,basePath=import.meta.env?.BASE_URL||'/',options={}}={}){
 const existing=await getOne('documents',TEMPLATE_ID);
 if(existing?.blob)return getTemplateInfo();
 if(defaultTemplatePromise)return defaultTemplatePromise;
 defaultTemplatePromise=(async()=>{
   const normalized=basePath.endsWith('/')?basePath:basePath+'/';
   const response=await fetchFn(normalized+'ZSL-Cestovny-prikaz.xlsx',{cache:'force-cache'});
   if(!response?.ok)throw new Error('Vestavěná ZSL šablona není dostupná: HTTP '+response?.status);
   const blob=await response.blob();
   const checked=await inspectZslXlsx(blob,options);
   if(checked.variant!=='official')
     throw new Error('Neplatná verze vestavěné šablony ZSL: chybí oficiální s.2 – súhlas MV.');
   const current=await getOne('documents',TEMPLATE_ID);
   if(current?.blob)return getTemplateInfo();
   await putOne('documents',{
     id:TEMPLATE_ID,kind:'template',name:'ZSL-Cestovny-prikaz-sablona-v20250430.xlsx',
     type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     blob,createdAt:new Date().toISOString(),source:'official-bundled',variant:'official',
     hasExistingTrip:checked.hasExistingTrip,existingCount:checked.existing.length
   });
   return getTemplateInfo();
 })().finally(()=>{defaultTemplatePromise=null});
 return defaultTemplatePromise;
}
function sourceCell(sheetData,ref){
 for(const row of Array.from(sheetData.childNodes||[])){
  if(row.nodeType!==1||row.localName!=='row')continue;
  const rowNum=Number(ref.match(/\d+$/)[0]);
  if(Number(row.getAttribute('r'))!==rowNum)continue;
  return Array.from(row.childNodes).find(x=>x.nodeType===1&&x.localName==='c'&&x.getAttribute('r')===ref)||null;
 }
 return null;
}
function occupied(cell){
 if(!cell)return true; // Do not create unformatted cells outside original template.
 if(direct(cell,'f'))return true;
 const val=direct(cell,'v');
 const inline=direct(cell,'is');
 if(val&&val.textContent?.trim()!=='')return true;
 if(inline&&inline.textContent?.trim()!=='')return true;
 return false;
}
function parseCell(ref){
 const m=/^([A-Z]+)(\d+)$/.exec(ref);
 return m?{col:m[1],row:Number(m[2])}:null;
}
function setValue(node,patch,xml){
 for(const n of Array.from(node.childNodes||[])){
  if(n.nodeType===1&&['v','is','f'].includes(n.localName))node.removeChild(n);
 }
 if(patch.kind==='number'){
  node.removeAttribute('t');
  const v=xml.createElementNS(NS,'v');v.textContent=String(patch.value);node.appendChild(v);
 }else{
  node.setAttribute('t','inlineStr');
  const str=xml.createElementNS(NS,'is'),t=xml.createElementNS(NS,'t');
  t.setAttribute('xml:space','preserve');
  t.textContent=String(patch.value);
  str.appendChild(t);node.appendChild(str);
 }
}
function getRowGroup(patches){
 const groups=[],map=new Map();
 for(const patch of patches){
  const key=patch.group||patch.sheet+'|'+patch.cell;
  if(!map.has(key)){const group={id:key,sheet:patch.sheet,rows:[],start:patch.rowStart,end:patch.rowEnd};map.set(key,group);groups.push(group)}
  map.get(key).rows.push(patch);
 }
 return groups;
}
export async function createFilledXlsx(blob,{event,trainer,riders,expenses,funding},options={}){
 const inspected=await inspectZslXlsx(blob,options);
 if(inspected.hasExistingTrip&&!options.allowExisting){
  throw new Error('Vybraný XLSX už obsahuje termíny nebo výdaje předchozí cesty ('+inspected.existing.length+' polí). Aby se částky různých akcí nesmíchaly, zvol čistou šablonu ZSL. Pokud chceš vědomě DOPLNIT stejný rozpracovaný výkaz, potvrď to v záložce Náhled.');
 }
 const zip=await JSZip.loadAsync(blob,{checkCRC32:true});
 const {sheets,book}=await readWorkbook(zip,options);
 const Parser=options.DOMParserCtor||globalThis.DOMParser;
 const Serializer=options.XMLSerializerCtor||globalThis.XMLSerializer;
 const {patches,warnings,skipped}=buildTemplatePatches({event,trainer,riders,expenses,funding});
 const grouped=getRowGroup(patches);
 const changes=[],conflicts=[];
 const touched=new Map();
 const alreadyUsed=new Set();

 for(const group of grouped){
  let item=touched.get(group.sheet);
  if(!item){
   const path=sheets.get(group.sheet);
   if(!path){warnings.push('Chybí list '+group.sheet);continue;}
   const xml=parseXml(await zip.file(path).async('string'),Parser);
   const sheetData=descendants(xml,'sheetData')[0];
   if(!sheetData)throw new Error('Poškozená struktura listu: '+group.sheet);
   item={path,xml,sheetData};touched.set(group.sheet,item);
  }
  const offset=group.rows[0]?.cell?parseCell(group.rows[0].cell):null;
  const start=group.start??offset?.row;
  const end=group.end??offset?.row;
  let target=null;
  for(let r=start;r<=end;r++){
   const delta=r-offset.row;
   const cells=group.rows.map(p=>{
    const ref=parseCell(p.cell);
    const at=ref.col+(ref.row+delta);
    return {at,patch:p,cell:sourceCell(item.sheetData,at)};
   });
   if(cells.every(c=>c.cell&&!occupied(c.cell)&&!alreadyUsed.has(group.sheet+'!'+c.at))){target=cells;break;}
  }
  if(!target){
   const message='Bez volných vstupních buněk pro '+group.sheet+' ('+group.rows.map(p=>p.cell).join(', ')+'). Původní údaje zachovány.';
   conflicts.push(message);continue;
  }
  for(const {at,patch,cell} of target){
   setValue(cell,patch,item.xml);
   alreadyUsed.add(group.sheet+'!'+at);
   changes.push({sheet:group.sheet,cell:at,value:patch.value,kind:patch.kind,source:patch.group||'profil/cesta'});
  }
 }
 for(const item of touched.values()){
  const serialized=new Serializer().serializeToString(item.xml);
  zip.file(item.path,serialized);
 }
 // The original formulas are kept verbatim, but cached values need recalculation by Excel.
 const calcs=descendants(book,'calcPr');
 if(calcs.length){
  calcs[0].setAttribute('fullCalcOnLoad','1');
  calcs[0].setAttribute('forceFullCalc','1');
  calcs[0].setAttribute('calcId','0');
 }else{
  const cp=book.createElementNS(NS,'calcPr');
  cp.setAttribute('fullCalcOnLoad','1');
  cp.setAttribute('forceFullCalc','1');
  book.documentElement.appendChild(cp);
 }
 zip.file('xl/workbook.xml',new Serializer().serializeToString(book));
 const out=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:5}});
 return {blob:out,template:inspected,changes,warnings,skipped,conflicts,
  filename:'ZSL_VYPLNENY_ORIGINAL_'+safeFilename(event?.name||'vyuctovanie')+'.xlsx'};
}
export async function downloadFilledOriginal(data,options={}){
 const stored=await getOne('documents',TEMPLATE_ID);
 if(!stored?.blob)throw new Error('Nejdřív vyber originální Excel ZSL v sekci Náhled.');
 const result=await createFilledXlsx(stored.blob,data,options);
 downloadBlob(result.blob,result.filename);
 return result;
}
