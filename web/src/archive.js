import JSZip from 'jszip';
import {safeFilename,csvCell,expenseStatus,CATEGORIES} from './utils.mjs';
import {snapshot,getOne,restoreAll} from './localdb.js';
import {expenseSection,ZSL_EXPENSE_SECTIONS} from './zsl-report.mjs';
import {receiptItemLabel} from './zsl-template-map.mjs';

const TABLES=['trainers','riders','events','funding','expenses'];
const FORMAT='zsl-expenses-local-backup',VERSION=1;

export function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;a.rel='noopener';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export async function exportBackup(){
  const contents=await snapshot();
  const zip=new JSZip();
  const documents=[];
  for(const item of contents.documents){
    const path='files/'+item.id+'_'+safeFilename(item.name);
    zip.file(path,item.blob);
    const {blob,...metadata}=item;
    documents.push({...metadata,filePath:path});
  }
  const data=Object.fromEntries(TABLES.map(t=>[t,contents[t]]));
  zip.file('manifest.json',JSON.stringify({format:FORMAT,version:VERSION,createdAt:new Date().toISOString(),data,documents},null,2));
  const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:1}});
  const timestamp=new Date().toISOString().slice(0,10);
  downloadBlob(blob,'ZSL_Expenses_KOMPLETNI_ZALOHA_'+timestamp+'.zip');
  return {events:contents.events.length,expenses:contents.expenses.length,documents:contents.documents.length};
}
export async function importBackup(file){
  if(!file||!/\.zip$/i.test(file.name))throw new Error('Vyber ZIP vytvořený funkcí Kompletní záloha.');
  if(file.size>350*1024*1024)throw new Error('Záložní ZIP je příliš velký pro bezpečnou obnovu v telefonu (350 MB).');
  const zip=await JSZip.loadAsync(file);
  const entry=zip.file('manifest.json');
  if(!entry)throw new Error('Chybí manifest.json. Nejedná se o kompletní zálohu aplikace.');
  const text=await entry.async('string');
  if(text.length>15*1024*1024)throw new Error('Manifest je příliš velký.');
  let manifest;try{manifest=JSON.parse(text)}catch{throw new Error('Záloha obsahuje neplatné údaje.')}
  if(manifest.format!==FORMAT||manifest.version!==VERSION)throw new Error('Nepodporovaný formát nebo verze zálohy.');
  if(!manifest.data||!Array.isArray(manifest.documents)||manifest.documents.length>5000)throw new Error('Poškozená nebo nepodporovaná záloha.');
  const restored={...manifest.data,documents:[]};
  const seen=new Set();
  for(const d of manifest.documents){
    if(!d||typeof d.id!=='string'||seen.has(d.id))throw new Error('Neplatné nebo duplicitní ID dokumentu.');
    seen.add(d.id);
    if(typeof d.filePath!=='string'||!/^files\/[a-zA-Z0-9_-]+_[^/]+$/.test(d.filePath))throw new Error('Neplatná cesta k dokumentu v záloze.');
    const item=zip.file(d.filePath);
    if(!item)throw new Error('Chybí příloha: '+d.name);
    if(item._data?.uncompressedSize>15*1024*1024)throw new Error('Příliš velká příloha: '+d.name);
    const bytes=await item.async('uint8array');
    if(bytes.byteLength>15*1024*1024)throw new Error('Příliš velká příloha: '+d.name);
    const {filePath,...metadata}=d;
    restored.documents.push({...metadata,blob:new Blob([bytes],{type:metadata.type||'application/octet-stream'})});
  }
  await restoreAll(restored);
  return {events:restored.events.length,expenses:restored.expenses.length,documents:restored.documents.length};
}
export async function exportEvent(event,expenses,funding){
  const zip=new JSZip(),folder=zip.folder('Doklady');
  const rows=[['ID','Datum','Polozka','Dodavatel','Castka','Mena','Kategorie','Sekce ZSL podle s.3','Vozidlo / ECV','Zpusob platby','Doklady']];
  for(const [index,e] of expenses.entries()){
    const dir=folder.folder(String(index+1).padStart(3,'0')+'_'+safeFilename(e.merchant||e.receipt_name||'vydaj'));
    rows.push([e.id,e.spent_on,receiptItemLabel(e),e.merchant,e.amount,event.currency,CATEGORIES.find(c=>c.id===e.category)?.label||'Ostatní',
      ZSL_EXPENSE_SECTIONS.find(x=>x.id===expenseSection(e,event))?.label||'NEZARADENÉ',e.vehicleDetails||'',e.payment_method,expenseStatus(e)]);
    for(const f of [
      {id:e.receipt_path,prefix:'Uctenka',name:e.receipt_name},
      {id:e.bank_path,prefix:'Bankovni_potvrzeni',name:e.bank_name}
    ]){
      if(!f.id)continue;
      const doc=await getOne('documents',f.id);
      if(!doc||!doc.blob){dir.file('CHYBI_PRILOHA_'+f.prefix+'.txt','Soubor chybí v lokální databázi.');continue}
      dir.file(f.prefix+'_'+safeFilename(f.name||doc.name),doc.blob);
    }
  }
  zip.file('Vydaje.csv','\ufeff'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'));
  zip.file('Zaloha_a_pohyby.csv','\ufeff'+[
    ['Typ','Datum','Castka','Mena','Poznamka'],
    ...funding.map(f=>[f.kind,f.occurredOn||f.occurred_on,f.amount,event.currency,f.note])
  ].map(r=>r.map(csvCell).join(';')).join('\r\n'));
  zip.file('Kontrola_dokladu.txt',expenses.filter(e=>expenseStatus(e)!=='Doklady kompletní').map(e=>[e.merchant||e.receipt_name,e.amount,expenseStatus(e)].join(' | ')).join('\r\n')||'Všechny doklady jsou kompletní.');
  const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:1}});
  downloadBlob(blob,'ZSL_'+safeFilename(event.name)+'_vyuctovani.zip');
}
