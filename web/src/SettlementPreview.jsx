import React,{useState} from 'react';
import {FileSpreadsheet,FileText,Upload,Download,AlertCircle,CheckCircle2,ShieldCheck,ClipboardList} from 'lucide-react';
import {buildTemplatePatches,exportExpenseReadiness,recommendedZslSection,REQUIRED_SHEETS} from './zsl-template-map.mjs';
import {currency} from './utils.mjs';

function Message({children,type='warning'}){
 return <div className={'zsl-message '+type}>{type==='warning'?<AlertCircle size={17}/>:<CheckCircle2 size={17}/>}<div>{children}</div></div>;
}
export default function SettlementPreview({
 event,trainer,riders=[],expenses=[],funding=[],
 onEditEvent,onImportTemplate,onDownloadXlsx,onDownloadAttachments,onLoadBuiltIn,onSetExpenseSection,onEditExpense,templateInfo,exportAudit,attachmentAudit,busy=false
}){
 const [details,setDetails]=useState(false);
 const [allowExisting,setAllowExisting]=useState(false);
 const proposed=buildTemplatePatches({event,trainer,riders,expenses,funding,variant:templateInfo?.variant});
 const checks=expenses.map(expense=>({expense,...exportExpenseReadiness(expense,event)}));
 const valid=checks.filter(x=>x.canExport);
 const readyTotal=valid.reduce((sum,x)=>sum+Math.round(Number(x.expense.amount||0)*100),0)/100;
 const blocked=checks.filter(x=>!x.canExport);
 return <div className="stack">
  <div className="panel">
   <div className="heading"><h3><FileSpreadsheet size={20}/> Originální soubor ZSL – Excel</h3></div>
   <Message type="success"><strong>Šablona je součástí aplikace.</strong> Ve výchozím nastavení se do telefonu automaticky uloží skutečný, veřejně vydaný formulář ZSL. Bez ručního nahrávání. Při exportu se upraví pouze jeho kopie; původní vzorce, rozložení a další listy se zachovají.</Message>
   <p className="muted">Oficiální šablona ZSL má list <strong>s.2 – súhlas MV</strong>. Tvoje dříve nahraná varianta má místo něj druhou knihu jízd. Základní buňky pro vyúčtování jsou společné. Pokud potřebuješ přesně svou upravenou variantu, můžeš ji i nadále vybrat ručně.</p>
   <label className={'btn filebtn '+(busy?'disabled':'')}>
    <Upload size={17}/> {templateInfo?'Použít vlastní upravený XLSX':'Vybrat vlastní XLSX (volitelné)'}
    <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy}
      onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file){setAllowExisting(false);onImportTemplate(file)}}}/>
   </label>
   {templateInfo?<Message type="success"><strong>{templateInfo.source==='official-bundled'?'Výchozí šablona připravena':'Vlastní šablona připravena'}:</strong> {templateInfo.name}
      <small>{templateInfo.variant==='official'?'Oficiální verze ZSL (s.2 – súhlas MV)':templateInfo.variant==='user-double-log'?'Upravená verze se dvěma knihami jízd':'Individuální verze'} · {(templateInfo.size/1024).toFixed(0)} kB · uložená v telefonu</small></Message>:
    <div><Message>Vestavěná šablona zatím není dostupná v tomto telefonu. Při prvním spuštění musí být na chvíli dostupný internet.</Message>
      <button className="btn secondary" type="button" disabled={busy} onClick={onLoadBuiltIn}>Načíst vestavěnou šablonu ZSL</button>
    </div>}
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
      <button className="btn" onClick={()=>onDownloadXlsx(allowExisting)} disabled={busy||!templateInfo||(templateInfo.hasExistingTrip&&!allowExisting)||(expenses.length>0&&valid.length===0)}><Download size={17}/> Stáhnout vyplněný originál</button>
      {expenses.length>0&&valid.length===0&&<p className="zsl-blocked-export">Žádný výdaj ještě není připravený pro zápis. Vyber sekce výdajů níže; jinak by byl Excel prázdný.</p>}
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
   <div className="heading"><h3><ClipboardList size={20}/> Zařazení účtenek do původního Excelu</h3></div>
   <p className="muted">Každá účtenka má přesnou sekci ZSL. U paliva potřebujeme znát majitele vozidla, u jídla správný typ výdaje. Účtenky bez bankovního potvrzení lze do Excelu zapsat; potvrzení však musíš doplnit před odevzdáním.</p>
   <div className="counts">
     <div><strong>{valid.length} / {expenses.length}</strong><span>Výdajů připravených k zápisu</span></div>
     <div><strong>{currency(readyTotal,event.currency)}</strong><span>Očekávaná suma zápisu</span></div>
     <div><strong>{blocked.length}</strong><span>Potřebují zařazení</span></div>
   </div>
   {expenses.length===0&&<Message>Pro kontrolu finančních buněk přidej do akce alespoň jednu účtenku.</Message>}
   <div className="zsl-preflight-list">
   {checks.map(({expense,...status})=><div className="zsl-preflight-item" key={expense.id}>
     <div className="zsl-preflight-top">
       <div><strong>{expense.merchant||expense.receipt_name||'Neurčený dodavatel'}</strong>
         <small>{expense.spent_on||'Bez data'} · {expense.receipt_name||'Doklad'} · {expense.payment_method==='card'?'Karta':expense.payment_method==='cash'?'Hotovost':'Platba neurčena'}</small>
       </div>
       <span>{currency(expense.amount,event.currency)}</span>
     </div>
     <div className="zsl-preflight-controls">
       <label>Kam zapsat v ZSL?
         <select value={recommendedZslSection(expense)} disabled={busy} onChange={e=>onSetExpenseSection(expense,e.target.value)}>
           <option value="unassigned">Vyžaduje rozhodnutí – nezařazeno</option>
           <option value="zsl_car">s.3 – Motorové vozidlo ZSL (tankovanie)</option>
           <option value="private_car">s.3 – Súkromné vozidlo (vyžaduje km)</option>
           <option value="company_car">s.3 – Vozidlo právnickej osoby (vyžaduje km)</option>
           <option value="transport">s.3 – Cestovné / doprava</option>
           <option value="lodging">s.3 – Ubytovanie</option>
           <option value="other">s.3 – INÉ vedľajšie výdavky</option>
           <option value="foreign_meal">s.4 – Príspevok na stravu zahraničie</option>
           <option value="domestic_meal">s.4 – Stravné tuzemsko (vyžaduje podklady)</option>
         </select>
       </label>
       <button type="button" className="btn secondary small" onClick={()=>onEditExpense(expense)}>Zkontrolovat údaje</button>
     </div>
     {status.canExport?<div className="zsl-preflight-status ready"><CheckCircle2 size={16}/> Připravené pro zápis do originálního Excelu</div>:
      <div className="zsl-preflight-status blocked"><AlertCircle size={16}/> {status.issues.join('; ')}</div>}
     {status.warnings.map((warn,i)=><p className="zsl-preflight-warning" key={i}>Poznámka: {warn}</p>)}
   </div>)}
   </div>
   {blocked.length>0&&<Message>{blocked.length} výdajů se do Excelu nezapíše, dokud neopravíš uvedené příčiny. Nejde o chybu rozpoznávání částky, ale o chybějící zařazení nebo podklady.</Message>}
  </div>

  <div className="panel">
   <div className="heading"><h3><ClipboardList size={20}/> Kontrola zápisu před odesláním</h3></div>
   <div className="counts">
    <div><strong>{valid.length}</strong><span>Plánované výdaje do Excelu</span></div>
    <div><strong>{proposed.skipped.length}</strong><span>Výdaje k doplnění</span></div>
    <div><strong>{exportAudit?.conflicts?.length||0}</strong><span>Obsazené oblasti</span></div>
   </div>
   <p className="muted">Aktuální zdroj: {templateInfo?.variant==='official'?'oficiální ZSL 2025':'vlastní původní šablona'}.
     {templateInfo?.variant==='official'?
       <> Tankování ZSL začíná na řádku <strong>26</strong>, ubytování na <strong>40</strong> a ostatní výdaje na <strong>49</strong> (max. 7 řádků). Původní součtové vzorce se zachovají.</>:
       <> Tankování ZSL začíná na řádku <strong>24</strong>, ubytování na <strong>38</strong> a ostatní výdaje na <strong>47</strong>. Původní součtové vzorce se zachovají.</>}
   </p>
   {proposed.skipped.length>0&&<div className="zsl-alert-list">
     <strong>Nezařazené nebo neúplné doklady:</strong>
     {proposed.skipped.map((message,i)=><p key={i}><AlertCircle size={14}/>{message}</p>)}
   </div>}
   {exportAudit&&<div className="zsl-audit">
     <Message type="success">Do originálního Excelu se skutečně zapsalo <strong>{exportAudit.financialReceiptCount||0} z {exportAudit.expectedReceiptCount||0}</strong> výdajů v hodnotě <strong>{currency(exportAudit.financialAmount||0,event.currency)}</strong>. Změněno {exportAudit.changes.length} buněk. Obsazené původní oblasti: {exportAudit.conflicts.length}.</Message>
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
   <p className="muted">Původní listy knihy jízd a další listy dle zvolené varianty, předvyplněné údaje o vozidlech, původní stravné, všechny vzorce a pomocné listy. Přepočty stravného a amortizace neodhadujeme. Pokud aplikace nenajde správné volné pole, raději ho nechá prázdné a uvede důvod.</p>
   <Message>Šablona, výsledný Excel i PDF mohou obsahovat citlivé osobní a bankovní údaje. ZIP zálohu ukládej mimo aplikaci a soubory neposílej veřejně.</Message>
  </div>
 </div>;
}
