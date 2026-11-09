import React,{useState} from 'react';
import {FileSpreadsheet,FileText,Upload,Download,AlertCircle,CheckCircle2,ShieldCheck,ClipboardList} from 'lucide-react';
import {buildTemplatePatches,REQUIRED_SHEETS} from './zsl-template-map.mjs';

function Message({children,type='warning'}){
 return <div className={'zsl-message '+type}>{type==='warning'?<AlertCircle size={17}/>:<CheckCircle2 size={17}/>}<div>{children}</div></div>;
}
export default function SettlementPreview({
 event,trainer,riders=[],expenses=[],funding=[],
 onEditEvent,onImportTemplate,onDownloadXlsx,onDownloadAttachments,templateInfo,exportAudit,attachmentAudit,busy=false
}){
 const [details,setDetails]=useState(false);
 const [allowExisting,setAllowExisting]=useState(false);
 const proposed=buildTemplatePatches({event,trainer,riders,expenses,funding});
 return <div className="stack">
  <div className="panel">
   <div className="heading"><h3><FileSpreadsheet size={20}/> Originální soubor ZSL – Excel</h3></div>
   <Message type="success"><strong>Nevytváříme novou podobu cestovního příkazu.</strong> Použijeme skutečný XLSX, který sem vybereš. Všechny jeho listy, formátování, vzorce i předvyplněné hodnoty zůstanou zachované; doplňujeme jen ověřená prázdná pole do kopie souboru.</Message>
   <p className="muted">Šablonu vyber z aplikace <strong>Soubory</strong> na iPhonu. Ukládá se pouze do tohoto telefonu, nikoli na GitHub. Můžeš použít i již částečně vyplněný ZSL Excel – obsazená pole nepřepisujeme.</p>
   <label className={'btn filebtn '+(busy?'disabled':'')}>
    <Upload size={17}/> {templateInfo?'Změnit originální XLSX':'Vybrat originální XLSX ZSL'}
    <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy}
      onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file){setAllowExisting(false);onImportTemplate(file)}}}/>
   </label>
   {templateInfo?<Message type="success"><strong>Načteno:</strong> {templateInfo.name}<br/>
    <small>{REQUIRED_SHEETS.length} očekávaných listů · {(templateInfo.size/1024).toFixed(0)} kB · bez přenosu na server</small></Message>:
    <Message>Originální soubor dosud není vybraný. Bez něj se XLSX nevygeneruje, aby nedošlo k vytvoření další neodpovídající šablony.</Message>}
   {templateInfo?.hasExistingTrip&&<div className="zsl-existing-trip">
      <Message><strong>Pozor:</strong> tento Excel obsahuje již vyplněný termín nebo výdaje starší cesty ({templateInfo.existingCount} buněk). Výchozí export je proto zablokovaný, aby se nesmíchala vyúčtování dvou různých akcí. Nejbezpečnější je vybrat čistou původní šablonu.</Message>
      <label className="zsl-confirm-existing"><input type="checkbox" checked={allowExisting} onChange={e=>setAllowExisting(e.target.checked)}/>
        <span>Vím, že jde o <strong>stejný rozpracovaný výkaz</strong> a chci do něj pouze přidat nové položky. Žádné původní údaje se nemají přepsat.</span>
      </label>
    </div>}
  </div>

  <div className="panel">
   <div className="heading"><h3><Download size={20}/> Dva samostatné výstupy</h3></div>
   <div className="zsl-download-split">
    <div className="zsl-download-option">
      <FileSpreadsheet size={27}/>
      <h4>1. Původní ZSL výkaz (XLSX)</h4>
      <p>Stejný excelový soubor jako originál; pouze doplněné vstupní buňky v příslušných listech. Vzorce se přepočítají po otevření v Excelu.</p>
      <button className="btn" onClick={()=>onDownloadXlsx(allowExisting)} disabled={busy||!templateInfo||(templateInfo.hasExistingTrip&&!allowExisting)}><Download size={17}/> Stáhnout vyplněný originál</button>
    </div>
    <div className="zsl-download-option">
      <FileText size={27}/>
      <h4>2. Přílohy výkazu (PDF)</h4>
      <p>Účtenky seřazené po jednotlivých výdajích, ke každé platbě kartou její bankovní potvrzení. Chybějící dokumenty budou uvedené v kontrole.</p>
      <button className="btn secondary" onClick={onDownloadAttachments} disabled={busy||!expenses.length}><Download size={17}/> Stáhnout PDF příloh</button>
    </div>
   </div>
   <p className="muted smalltext">Nevytváříme falešnou kopii formuláře v PDF. Pokud bude potřeba také <strong>PDF samotného výkazu</strong> se 100% zachováním rozložení, otevři stažený originální XLSX v Microsoft Excelu a exportuj jej do PDF. Automatický věrný převod v offline prohlížeči zatím není ověřený.</p>
  </div>

  <div className="panel">
   <div className="heading"><h3><ClipboardList size={20}/> Kontrola zápisu před odesláním</h3></div>
   <div className="counts">
    <div><strong>{proposed.patches.length}</strong><span>Plánované zápisy do buněk</span></div>
    <div><strong>{proposed.skipped.length}</strong><span>Výdaje k doplnění</span></div>
    <div><strong>{exportAudit?.conflicts?.length||0}</strong><span>Obsazené oblasti</span></div>
   </div>
   <p className="muted">Přesně porovnáváme originální strukturu s místní evidencí. Například vozidlo ZSL zapisujeme do <code>C24/F24/H24</code> a dalších volných řádků; ubytování od řádku 38; ostatní náklady od řádku 47.</p>
   {proposed.skipped.length>0&&<div className="zsl-alert-list">
     <strong>Nezařazené nebo neúplné doklady:</strong>
     {proposed.skipped.map((message,i)=><p key={i}><AlertCircle size={14}/>{message}</p>)}
   </div>}
   {exportAudit&&<div className="zsl-audit">
     <Message type="success">Stažená kopie původního Excelu. Úspěšně doplněno <strong>{exportAudit.changes.length}</strong> buněk; <strong>{exportAudit.conflicts.length}</strong> obsazených oblastí bylo bez přepisu přeskočeno.</Message>
     {(exportAudit.conflicts||[]).map((v,i)=><Message key={i}>{v}</Message>)}
     {(exportAudit.warnings||[]).map((v,i)=><Message key={'w'+i}>{v}</Message>)}
     <details open={false}><summary>Zobrazit přesně změněné buňky ({exportAudit.changes.length})</summary>
       <div className="zsl-audit-entries">{exportAudit.changes.map((entry,i)=><div key={i}>
         <strong>{entry.sheet} – {entry.cell}</strong><span>{String(entry.value)}</span>
       </div>)}</div>
     </details>
   </div>}
   {attachmentAudit&&<div className="zsl-audit">
     <Message type="success">PDF příloh: {attachmentAudit.pages} stran, {attachmentAudit.attachmentCount} souborů, {attachmentAudit.warnings.length} upozornění.</Message>
     {(attachmentAudit.warnings||[]).map((v,i)=><Message key={i}>{v}</Message>)}
   </div>}
   <div className="zsl-controls"><button className="btn secondary" onClick={onEditEvent}>Upravit cestu a účastníky</button><button className="btn secondary" onClick={()=>setDetails(x=>!x)}>{details?'Skrýt':'Zobrazit'} mapu buněk</button></div>
   {details&&<div className="zsl-audit-entries">{proposed.patches.map((entry,i)=><div key={i}><strong>{entry.sheet}!{entry.cell}</strong><span>{String(entry.value)}</span></div>)}</div>}
  </div>

  <div className="panel">
   <div className="heading"><h3><ShieldCheck size={20}/> Co zůstane zachované</h3></div>
   <p className="muted">Oba listy knihy jízd, předvyplněné údaje o vozidlech, původní stravné, všechny vzorce a pomocné listy. Přepočty stravného a amortizace neodhadujeme. Pokud aplikace nenajde správné volné pole, raději ho nechá prázdné a uvede důvod.</p>
   <Message>Šablona, výsledný Excel i PDF mohou obsahovat citlivé osobní a bankovní údaje. ZIP zálohu ukládej mimo aplikaci a soubory neposílej veřejně.</Message>
  </div>
 </div>;
}
