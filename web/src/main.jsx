import React,{useState,useEffect,useMemo,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {MountainSnow,Receipt,Users,Wallet,FolderArchive,Plus,Camera,CheckCircle2,AlertTriangle,Download,Upload,Settings2,CalendarDays,ChevronRight,FileText,X,Lock,RefreshCw,Check,Smartphone,HardDrive,Trash2,ShieldCheck,FileSpreadsheet,ScanLine,UserX,UserCheck} from 'lucide-react';
import {currency,decimal,CATEGORIES,expenseStatus,summarize} from './utils.mjs';
import {loadAll,getOne,putOne,uid,addReceipt,setBankConfirmation,saveExpense,deleteExpense,requestPersistence,storageEstimate} from './localdb.js';
import {exportBackup,importBackup,exportEvent,downloadBlob} from './archive.js';
import SettlementPreview from './SettlementPreview.jsx';
import ReceiptViewer from './ReceiptViewer.jsx';
import {createOCRSession,canRecognize} from './ocr.js';
import {recognizePdf,isPdf} from './pdf-reader.js';
import {mergeRecognizedExpense,isCurrencyConversionPending,requiresCurrencyConversion} from './receipt-import.mjs';
import {applyRosterChange} from './roster.mjs';
import {makeZslReport,ZSL_EXPENSE_SECTIONS,NOT_COMPUTED} from './zsl-report.mjs';
import {exportExpenseReadiness,receiptItemLabel} from './zsl-template-map.mjs';
import {storeOriginalTemplate,getTemplateInfo,ensureBundledZslTemplate,downloadFilledOriginal} from './zsl-xlsx.js';
import {downloadAttachmentsPdf} from './attachments-pdf.js';
import './style.css';

const initial={trainers:[],riders:[],events:[],funding:[],expenses:[]};
const today=()=>new Date().toISOString().slice(0,10);
const autoOCRReady=found=>found?.confidence==='high'&&found?.merchantConfidence==='high'&&
  Number(found.amount)>0&&!!String(found.merchant||'').trim()&&/^\d{4}-\d{2}-\d{2}$/.test(found.spent_on||'');

const showDate=(date)=>date?new Date(date+'T12:00:00').toLocaleDateString('cs-CZ'):'—';
function Button({children,onClick,secondary=false,disabled=false,danger=false,small=false,type='button'}){
  return <button type={type} disabled={disabled} onClick={onClick} className={'btn '+(secondary?'secondary ':'')+(danger?'danger ':'')+(small?'small':'')}>{children}</button>
}
function Input({label,...props}){return <label className="input-label"><span>{label}</span><input {...props}/></label>}
function Select({label,children,...props}){return <label className="input-label"><span>{label}</span><select {...props}>{children}</select></label>}
function Pill({children,ok=false,warn=false}){return <span className={'pill '+(ok?'ok':warn?'warn':'')}>{children}</span>}
function Placeholder({title,text,icon:Icon=Receipt}){return <div className="empty"><Icon size={31}/><strong>{title}</strong><span>{text}</span></div>}
function Status({item}){const value=expenseStatus(item);return <Pill ok={value==='Doklady kompletní'} warn={value!=='Doklady kompletní'}>{value==='Doklady kompletní'?<CheckCircle2 size={13}/>:<AlertTriangle size={13}/>} {value}</Pill>}

function App(){
  const [db,setDb]=useState(initial);
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [activeId,setActiveId]=useState(null);
  const [view,setView]=useState('overview');
  const [newEvent,setNewEvent]=useState(false);
  const [editing,setEditing]=useState(null);
  const [editingTrainer,setEditingTrainer]=useState(null);
  const [editingRider,setEditingRider]=useState(null);
  const [editingEvent,setEditingEvent]=useState(false);
  const [viewingDoc,setViewingDoc]=useState(null);
  const [ocrProgress,setOcrProgress]=useState('');
  const [ocrMode,setOcrMode]=useState('precise');
  const [templateInfo,setTemplateInfo]=useState(null);
  const [exportAudit,setExportAudit]=useState(null);
  const [attachmentAudit,setAttachmentAudit]=useState(null);
  const [online,setOnline]=useState(navigator.onLine);
  const [storage,setStorage]=useState(null);
  const [isPersistent,setIsPersistent]=useState(null);

  const refresh=useCallback(async()=>{const all=await loadAll();setDb(all);
    const e=await storageEstimate();setStorage(e);
    const current=await getTemplateInfo();
    setTemplateInfo(current||await ensureBundledZslTemplate().catch(()=>null));
  },[]);
  useEffect(()=>{refresh().catch(e=>setError(e.message||String(e))).finally(()=>setReady(true))},[refresh]);
  useEffect(()=>{const on=()=>setOnline(true),off=()=>setOnline(false);window.addEventListener('online',on);window.addEventListener('offline',off);return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)}},[]);
  useEffect(()=>{requestPersistence().then(v=>setIsPersistent(v)).catch(()=>{})},[]);

  const events=useMemo(()=>[...db.events].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),[db.events]);
  const active=events.find(e=>e.id===activeId)||events[0]||null;
  const expenses=useMemo(()=>db.expenses.filter(e=>e.eventId===active?.id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),[db.expenses,active?.id]);
  const funding=useMemo(()=>db.funding.filter(x=>x.eventId===active?.id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),[db.funding,active?.id]);
  const summary=useMemo(()=>summarize(expenses,funding),[expenses,funding]);
  const trainer=db.trainers.find(x=>x.id===active?.trainerId);
  const participants=active?.riderIds?.map(id=>db.riders.find(r=>r.id===id)?.name).filter(Boolean)||[];
  const reportRiders=useMemo(()=>db.riders.filter(r=>(active?.riderIds||[]).includes(r.id)),[db.riders,active?.riderIds]);
  const zslReport=useMemo(()=>active?makeZslReport({event:active,trainer,riders:reportRiders,expenses,funding}):null,[active,trainer,reportRiders,expenses,funding]);

  async function run(action){
    setBusy(true);setError('');setNotice('');
    try{await action();await refresh()}
    catch(e){setError(e.message||String(e))}
    finally{setBusy(false)}
  }
  async function addTrainer(e){
    e.preventDefault();const form=e.currentTarget;
    const f=new FormData(form);const name=String(f.get('name')||'').trim();
    const iban=String(f.get('iban')||'').trim().replace(/\s+/g,'').toUpperCase();
    if(!name){setError('Vyplň jméno trenéra.');return}
    if(iban&&!/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(iban)){setError('IBAN má mít mezinárodní formát (15 až 34 znaků, začíná kódem země).');return}
    await run(async()=>{
      const row={
        id:editingTrainer?.id||uid(),name,title:String(f.get('title')||'').trim(),
        role:String(f.get('role')||'').trim(),department:String(f.get('department')||'').trim(),
        club:String(f.get('club')||'ZSL').trim(),address:String(f.get('address')||'').trim(),
        contact:String(f.get('contact')||'').trim(),email:String(f.get('email')||'').trim(),
        iban,bic:String(f.get('bic')||'').trim().toUpperCase(),bankName:String(f.get('bankName')||'').trim(),
        notes:String(f.get('notes')||'').trim(),createdAt:editingTrainer?.createdAt||new Date().toISOString()
      };
      await putOne('trainers',row);setEditingTrainer(null);form.reset();
      setNotice('Profil trenéra včetně bankovních údajů byl uložen v tomto telefonu.');
    });
  }
  async function addRider(e){
    e.preventDefault();const form=e.currentTarget;const f=new FormData(form),name=String(f.get('rider')||'').trim();
    if(!name)return;
    await run(async()=>{await putOne('riders',{id:uid(),name,createdAt:new Date().toISOString()});form.reset();setNotice('Jezdec přidán.')})
  }
  async function createEvent(e){
    e.preventDefault();const f=new FormData(e.currentTarget),name=String(f.get('name')||'').trim(),advance=decimal(f.get('advance'));
    if(!name||!db.trainers.some(t=>t.id===f.get('trainer'))||!Number.isFinite(advance)||advance<0){setError('Vyplň název, vyber trenéra a správně zadej zálohu.');return}
    if(f.get('start')&&f.get('end')&&f.get('end')<f.get('start')){setError('Datum konce nemůže být před začátkem.');return}
    await run(async()=>{
      const idEvent=uid();
      await putOne('events',{id:idEvent,name,kind:f.get('kind'),trainerId:f.get('trainer'),riderIds:f.getAll('riders'),rosterChanges:[],location:String(f.get('location')||''),country:String(f.get('country')||''),purpose:String(f.get('purpose')||''),
        defaultFuelSection:'zsl_car',
        vehicleDetails:String(f.get('vehicleDetails')||'').trim(),startPlace:String(f.get('startPlace')||''),startTime:String(f.get('startTime')||''),endPlace:String(f.get('endPlace')||''),endTime:String(f.get('endTime')||''),advanceNumber:String(f.get('advanceNumber')||''),reportText:String(f.get('reportText')||''),startsOn:f.get('start'),endsOn:f.get('end'),currency:f.get('currency'),createdAt:new Date().toISOString()});
      if(advance>0)await putOne('funding',{id:uid(),eventId:idEvent,kind:'advance',amount:advance,occurredOn:today(),note:'Počáteční záloha',createdAt:new Date().toISOString()});
      setActiveId(idEvent);setNewEvent(false);setView('overview');setNotice('Akce byla vytvořena a uložena do telefonu.');
    })
  }
  async function saveRoster(e){
    e.preventDefault();if(!active)return;
    const f=new FormData(e.currentTarget),next=f.getAll('riders');
    await run(async()=>{
      await putOne('events',applyRosterChange(active,next,new Date().toISOString(),String(f.get('rosterReason')||'').trim()));
      setNotice('Soupiska byla aktualizována; odjezdy a návraty jsou uložené v historii.');
    });
  }
  async function renameRider(e){
    e.preventDefault();
    if(!editingRider)return;
    const form=e.currentTarget,name=String(new FormData(form).get('riderName')||'').trim();
    if(!name){setError('Jméno jezdce nesmí být prázdné.');return}
    if(db.riders.some(r=>r.id!==editingRider.id&&r.name.toLowerCase()===name.toLowerCase())){setError('Jezdec s tímto jménem už je uložený.');return}
    await run(async()=>{await putOne('riders',{...editingRider,name});setEditingRider(null);setNotice('Jméno jezdce upraveno ve všech soustředěních a závodech.');});
  }
  async function toggleRiderActive(rider){
    await run(async()=>{
      await putOne('riders',{...rider,inactive:!rider.inactive});
      setNotice(rider.inactive?'Jezdec je opět aktivní.':'Jezdec byl archivován – jeho stará vyúčtování zůstávají zachovaná.');
    });
  }
  async function saveEventChanges(e){
    e.preventDefault();if(!active)return;
    const f=new FormData(e.currentTarget);
    if(f.get('start')&&f.get('end')&&f.get('end')<f.get('start')){setError('Datum konce je před začátkem.');return}
    await run(async()=>{
      await putOne('events',{
        ...active,name:String(f.get('name')||'').trim()||active.name,kind:f.get('kind')||active.kind,
        trainerId:f.get('trainer')||active.trainerId,startsOn:f.get('start')||'',endsOn:f.get('end')||'',
        startPlace:String(f.get('startPlace')||''),startTime:String(f.get('startTime')||''),
        endPlace:String(f.get('endPlace')||''),endTime:String(f.get('endTime')||''),
        location:String(f.get('location')||''),country:String(f.get('country')||''),purpose:String(f.get('purpose')||''),
        defaultFuelSection:'zsl_car',
        vehicleDetails:String(f.get('vehicleDetails')||'').trim(),
        advanceNumber:String(f.get('advanceNumber')||''),reportText:String(f.get('reportText')||'')
      });
      setEditingEvent(false);setNotice('Údaje cesty byly aktualizované.');
    });
  }
  async function addMovement(e){
    e.preventDefault();const form=e.currentTarget,fd=new FormData(form),val=decimal(fd.get('amount'));
    if(!Number.isFinite(val)||val<=0){setError('Částka musí být kladné číslo.');return}
    await run(async()=>{await putOne('funding',{id:uid(),eventId:active.id,kind:fd.get('kind'),amount:val,occurredOn:fd.get('date')||today(),note:String(fd.get('note')||''),createdAt:new Date().toISOString()});form.reset();setNotice('Pohyb zálohy uložen.')});
  }
  async function uploadReceipts(inputFiles){
    if(!active||!inputFiles?.length)return;
    const files=Array.from(inputFiles);
    await run(async()=>{
      const uploaded=[];
      for(const file of files)uploaded.push({file,expense:await addReceipt(active.id,file)});
      await refresh();
      let scanned=0,failed=0,pendingFX=0,scanner=null;
      try{
        for(let i=0;i<uploaded.length;i++){
          const {file,expense}=uploaded[i];
          if(!canRecognize(file)&&!isPdf(file)){failed++;continue}
          try{
            setOcrProgress('Čtu doklad '+(i+1)+'/'+uploaded.length+': '+file.name);
            const found=isPdf(file)?
              await recognizePdf(file,{onProgress:setOcrProgress,mode:ocrMode}):
              await (async()=>{if(!scanner)scanner=await createOCRSession(setOcrProgress);return scanner.scan(file,{mode:ocrMode})})();
            const candidate=mergeRecognizedExpense(expense,found,active.currency);
            await saveExpense(candidate);
            if(isCurrencyConversionPending(candidate,active.currency))pendingFX++;
            if(!found.sourceAmount&&!Number(found.amount))failed++;
            else scanned++;
          }catch(error){failed++;setOcrProgress('Nepodařilo se přečíst '+file.name+': '+(error?.message||error))}
        }
      }finally{if(scanner)await scanner.close().catch(()=>{});setOcrProgress('')}
      setView('documents');
      setNotice('Uloženo '+uploaded.length+' dokladů; rozpoznáno '+scanned+
        (failed?' · '+failed+' vyžaduje kontrolu.':'')+
        (pendingFX?' · '+pendingFX+' dokladů v cizí měně vyžaduje přepočet do EUR.':'')+
        ' PDF čteme ze všech stran; originály zůstávají v telefonu.');
    });
  }
  async function rescanExpense(expense){
    await run(async()=>{
      const doc=await getOne('documents',expense.receipt_path);
      if(!doc?.blob)throw new Error('Soubor dokladu není dostupný.');
      let scanner=null;
      try{
        setOcrProgress('Znovu čtu uložený doklad…');
        let found;
        if(isPdf(doc.blob)||isPdf({name:doc.name})){
          found=await recognizePdf(doc.blob,{onProgress:setOcrProgress,mode:ocrMode});
        }else{
          if(!canRecognize(doc.blob)&&!canRecognize({name:doc.name}))
            throw new Error('Tento typ dokladu nelze automaticky přečíst.');
          scanner=await createOCRSession(setOcrProgress);
          found=await scanner.scan(doc.blob,{mode:ocrMode});
        }
        const candidate=mergeRecognizedExpense(expense,found,active.currency,{rescan:true});
        await saveExpense(candidate);
        setNotice(isCurrencyConversionPending(candidate,active.currency)?
          'PDF přečteno: '+candidate.sourceAmount+' '+candidate.sourceCurrency+
          '. Do ZSL zadej správnou částku v EUR podle bankovního výpisu.':
          'Doklad přečten znovu. Částka, dodavatel a datum byly doplněny.');
      }finally{if(scanner)await scanner.close().catch(()=>{});setOcrProgress('')}
    });
  }
  async function updateExpense(e){
    e.preventDefault();const f=new FormData(e.currentTarget),val=decimal(f.get('amount'));
    if(!Number.isFinite(val)||val<0){setError('Neplatná částka výdaje.');return}
    await run(async()=>{
      await saveExpense({...editing,merchant:String(f.get('merchant')||'').trim(),spent_on:f.get('spentOn')||'',amount:val,category:f.get('category'),payment_method:f.get('method'),zsl_section:f.get('zslSection')==='auto'?'':String(f.get('zslSection')||''),
      conversionConfirmed:requiresCurrencyConversion(editing,active?.currency||'EUR')?(val>0):editing.conversionConfirmed,
      vehicleDetails:String(f.get('vehicleDetails')||'').trim(),itemLabel:String(f.get('itemLabel')||'').trim().slice(0,70),note:String(f.get('note')||''),ocr:editing.ocr?{...editing.ocr,reviewed:true}:undefined});
      setEditing(null);setNotice('Údaje účtenky uložené.');
    })
  }
  async function attachBank(expense,file){
    if(!file)return;
    await run(async()=>{await setBankConfirmation(expense,file);setNotice('Potvrzení bylo přiloženo ke kartové platbě.')});
  }
  function viewDocument(id){setViewingDoc(id)}
  async function removeExpense(row){
    if(!window.confirm('Opravdu odstranit tento výdaj včetně účtenky a potvrzení?'))return;
    await run(async()=>{await deleteExpense(row);setNotice('Výdaj a související přílohy byly odstraněny.')})
  }
  async function doBackup(){
    await run(async()=>{const result=await exportBackup();setNotice('Kompletní záloha vytvořena: '+result.events+' akcí, '+result.documents+' příloh. Ulož ZIP mimo aplikaci (např. Soubory / iCloud Drive).')});
  }
  async function doRestore(file){
    if(!file)return;
    if(!window.confirm('Obnovení NAHRADÍ všechna dosavadní data tohoto telefonu daty ze zálohy. Doporučujeme nejdřív vytvořit vlastní ZIP zálohu. Pokračovat?'))return;
    await run(async()=>{const r=await importBackup(file);setActiveId(null);setView('overview');setNotice('Obnoveno '+r.events+' akcí, '+r.expenses+' výdajů a '+r.documents+' příloh.')})
  }
  async function doExport(){await run(async()=>{await exportEvent(active,expenses,funding);setNotice('Vyúčtování ZIP připravené ke stažení.')})}
  async function loadDefaultTemplate(){
    await run(async()=>{
      const info=await ensureBundledZslTemplate();
      if(!info)throw new Error('Výchozí ZSL šablonu se nepodařilo načíst.');
      setNotice('Oficiální šablona ZSL je uložená přímo v telefonu a připravená k exportu.');
    });
  }
  async function importXlsxTemplate(file){
    if(!file)return;
    await run(async()=>{
      const info=await storeOriginalTemplate(file);
      setExportAudit(null);
      setNotice('Originální ZSL XLSX byl uložen pouze do tohoto telefonu: '+info.filename+'. Původní data ani vzorce nepřepisujeme.');
    });
  }
  async function selectExpenseSection(expense,section){
    await run(async()=>{
      await saveExpense({...expense,zsl_section:section});
      setExportAudit(null);
      setNotice('Účtenka '+(expense.merchant||expense.receipt_name||'')+' byla zařazena do formuláře ZSL. Zápis zkontroluj v Náhledu.');
    });
  }
  async function downloadOriginalWorkbook(allowExisting=false){
    if(!active||busy)return;
    await run(async()=>{
      const result=await downloadFilledOriginal({event:active,trainer,riders:reportRiders,expenses,funding},{allowExisting});
      const {blob,...audit}=result;setExportAudit(audit);
      setNotice('Vyplněný původní XLSX stažen: '+result.financialReceiptCount+' z '+result.expectedReceiptCount+' výdajů ('+currency(result.financialAmount,active.currency)+'). Zachováno '+result.integrity.preservedFormulas+' vzorců. Otevři v Microsoft Excelu pro úplný přepočet.');
    });
  }
  async function downloadProofsPdf(){
    if(!active||busy)return;
    await run(async()=>{
      const result=await downloadAttachmentsPdf({event:active,expenses});
      const {blob,...audit}=result;setAttachmentAudit(audit);
      setNotice('Staženo samostatné PDF s účtenkami a bankovními potvrzeními: '+result.pages+' stran, '+result.warnings.length+' upozornění.');
    });
  }

  function Dashboard(){
    const groups=CATEGORIES.map(c=>({...c,value:expenses.filter(x=>x.category===c.id).reduce((s,x)=>s+Number(x.amount),0)}));
    let angle=0;
    const parts=groups.filter(x=>x.value>0&&summary.spent>0).map(g=>{const end=angle+100*g.value/summary.spent;const part=g.color+' '+angle+'% '+end+'%';angle=end;return part});
    const dough=parts.length?'conic-gradient('+parts.join(',')+')':'conic-gradient(#374760 0% 100%)';
    return <div className="stack">
      <div className="stats">
        <div className="metric"><span>Prijaté zálohy (evidované)</span><strong>{currency(summary.deposit,active.currency)}</strong></div>
        <div className="metric"><span>Výdavok celkom (evidované)</span><strong>{currency(summary.spent,active.currency)}</strong></div>
        <div className={'metric main '+(summary.remaining<0?'negative':'')}><span>Doplatok / Preplatok (orientačne)</span><strong>{currency(summary.remaining,active.currency)}</strong></div>
      </div>
      <div className="panel"><div className="heading"><h3>Čerpání zálohy</h3><Wallet size={20}/></div>
        <div className="track"><div style={{width:(summary.deposit>summary.returned?Math.min(100,Math.max(0,summary.spent/(summary.deposit-summary.returned)*100)):0)+'%'}}/></div>
        <div className="between muted smalltext"><span>Vráceno: {currency(summary.returned,active.currency)}</span><span>{summary.deposit>summary.returned?Math.round(summary.spent/(summary.deposit-summary.returned)*100):0} % využito</span></div>
      </div>
      <div className="panel zsl-overview">
        <div className="heading"><h3><FileSpreadsheet size={19}/> Zúčtovanie oprávnených výdavkov – orientačný súhrn</h3></div>
        <p className="muted smalltext">Položky přesně podle listu <strong>s.1 - pokyn</strong>. Zadané doklady jsou zatím orientační; stravné, další náhrady a konečné schválení nejsou vypočítané.</p>
        <div className="zsl-accounting-rows">
          {zslReport?.settlement.map(row=><div key={row.id} className={'zsl-accounting-row '+(row.amount==null?'not-computed':'')}>
            <span>{row.label}</span><strong>{row.amount==null?NOT_COMPUTED:currency(row.amount,active.currency)}</strong>
          </div>)}
        </div>
        {zslReport?.sections.find(x=>x.id==='unassigned')?.expenses.length>0&&
          <p className="zsl-warning">Nezařazené výdaje: {zslReport.sections.find(x=>x.id==='unassigned').expenses.length} účtenek vyžaduje zvolit sekci ZSL (palivo/strava).</p>}
        {expenses.length>0&&<p className="zsl-warning">
          Do původního XLSX je nyní připraveno {expenses.filter(e=>exportExpenseReadiness(e,active).canExport).length} z {expenses.length} výdajů.
          {expenses.some(e=>!exportExpenseReadiness(e,active).canExport)&&' Otevři Náhled, kde lze chybějící zařazení opravit u každé účtenky.'}
        </p>}
        <div className="report-actions">
          <Button disabled={busy||!templateInfo||templateInfo.hasExistingTrip} onClick={()=>downloadOriginalWorkbook(false)}><FileSpreadsheet size={17}/> Stáhnout vyplněný původní XLSX</Button>
          <Button disabled={busy||expenses.length===0} secondary onClick={downloadProofsPdf}><Download size={17}/> Stáhnout přílohy PDF</Button>
          <Button secondary onClick={()=>setView('preview')}>Nastavení originální šablony</Button>
        </div>
        <p className="muted smalltext">{templateInfo?'Originál uložený v telefonu: '+templateInfo.name:'Nejdříve v záložce Náhled vyber původní ZSL Excel.'} PDF obsahuje účtenky a bankovní potvrzení zvlášť od XLSX. Soubory nejsou šifrované.</p>
      </div>
      <div className="panel"><div className="heading"><h3>Výdaje podle kategorií</h3><Receipt size={20}/></div>
        <div className="chart-layout">
          <div className="donut" style={{background:dough}}><div className="donut-middle"><b>{currency(summary.spent,active.currency)}</b><small>celkem</small></div></div>
          <div className="legend">{groups.map(g=><div key={g.id}><i style={{background:g.color}}/><span>{g.label}</span><strong>{currency(g.value,active.currency)}</strong></div>)}</div>
        </div>
      </div>
      <div className="panel"><div className="heading"><h3>Stav dokumentů</h3><FileText size={20}/></div>
        <div className="counts"><div><strong>{summary.count}</strong><span>Účtenek</span></div><div><strong>{summary.incomplete}</strong><span>Ke kontrole</span></div><div><strong>{summary.missingBank}</strong><span>Chybí potvrzení</span></div></div>
        <Button secondary onClick={()=>setView('documents')}>Zobrazit doklady <ChevronRight size={16}/></Button>
      </div>
      <div className="panel"><div className="heading"><h3>Zálohy a vrácené peníze</h3><Plus size={20}/></div>
        <form onSubmit={addMovement} className="form-row">
          <Select label="Typ pohybu" name="kind"><option value="advance">Nová záloha / vklad</option><option value="return">Vrácení peněz</option></Select>
          <Input label="Částka" name="amount" placeholder="0,00" inputMode="decimal" required/>
          <Input label="Datum" name="date" type="date" defaultValue={today()}/>
          <Input label="Poznámka" name="note" placeholder="Volitelná"/>
          <Button type="submit" disabled={busy}>Uložit pohyb</Button>
        </form>
        {funding.length>0&&<div className="funding-list">{funding.map(x=><div key={x.id}><span>{x.kind==='advance'?'+ Záloha':'− Vráceno'} · {showDate(x.occurredOn)} {x.note&&'· '+x.note}</span><strong>{currency(x.amount,active.currency)}</strong></div>)}</div>}
      </div>
      <div className="panel"><div className="heading"><h3>Účastníci akce</h3><Users size={20}/></div><p className="muted">{trainer?.name||'Trenér není vybraný'} · {participants.join(', ')||'Bez zvolených jezdců'}</p></div>
    </div>;
  }

  function Documents(){
    return <div className="stack">
      <div className="panel"><div className="heading"><h3>1. Nahraj účtenky</h3><Camera size={20}/></div>
        <p className="muted">Aplikace se pokusí přečíst částku, dodavatele, datum a stručnou položku (Diesel, AdBlue, Skipas, Startovné…). <strong>Důkladný režim</strong> čte účtenku několikrát a zvlášť analyzuje její horní část. Je pomalejší, ale může zlepšit rozpoznání špatně vytištěných dokladů. Výsledky vždy zkontroluj.</p>
        <div className="ocr-mode-picker">
          <label htmlFor="ocr-mode">Způsob rozpoznávání</label>
          <select id="ocr-mode" value={ocrMode} disabled={busy} onChange={e=>setOcrMode(e.target.value)}>
            <option value="precise">Důkladné – více průchodů (doporučeno)</option>
            <option value="fast">Rychlé – základ + hlavička</option>
          </select>
          <small>OCR běží přímo na telefonu. První použití potřebuje internet k načtení jazykových dat. PDF s textem se čte automaticky ze všech stran. U naskenovaného PDF se použije OCR. Vše zůstává v telefonu.</small>
        </div>
        <div className="upload-row">
          <label className="btn filebtn"><Upload size={17}/> Více účtenek<input type="file" accept="image/*,application/pdf" multiple disabled={busy} onChange={e=>{uploadReceipts(e.target.files);e.target.value=''}}/></label>
          <label className="btn secondary filebtn"><Camera size={17}/> Vyfotit<input type="file" accept="image/*" capture="environment" disabled={busy} onChange={e=>{uploadReceipts(e.target.files);e.target.value=''}}/></label>
        </div>
      </div>
      <div className="panel"><div className="heading"><h3>2. Později přidej bankovní potvrzení</h3><FileText size={20}/></div>
        <p className="muted">Ke každé platbě kartou patří samostatné bankovní potvrzení. Přiložíš ho níže u správného výdaje. Hotovost ho nepotřebuje.</p>
        <div className="counts"><div><strong>{summary.count}</strong><span>Výdajů</span></div><div><strong>{summary.missingBank}</strong><span>Chybí potvrzení</span></div><div><strong>{summary.count-summary.incomplete}</strong><span>Kompletních</span></div></div>
      </div>
      <div className="heading"><h3>Účtenky</h3><span className="muted">{expenses.length} dokladů</span></div>
      {expenses.length===0&&<Placeholder title="Zatím žádné účtenky" text="Nahraj první doklady, které se pak objeví v tomto seznamu."/>}
      {expenses.map(e=><div className="expense" key={e.id}>
        <div className="expense-top"><div><strong>{receiptItemLabel(e)}</strong><small>{e.merchant||e.receipt_name||'Doklad'} · {showDate(e.spent_on)}</small></div><b>{isCurrencyConversionPending(e,active.currency)?currency(e.sourceAmount,e.sourceCurrency):currency(e.amount,active.currency)}</b></div>
        {isCurrencyConversionPending(e,active.currency)&&<p className="zsl-fx-warning">Rozpoznáno {currency(e.sourceAmount,e.sourceCurrency)}. Před zápisem do ZSL doplň částku v EUR podle skutečného přepočtu. Do eurových součtů se zatím nezapočítává.</p>}
        <div className="expense-bottom"><Status item={e}/>{e.ocr&&<Pill warn={!e.ocr.reviewed&&!e.ocr.autoReady} ok={!!e.ocr.reviewed||!!e.ocr.autoReady}>{e.ocr.reviewed?'Ručně upraveno':e.ocr.autoReady?'Automaticky načteno':'Zkontrolovat OCR ('+e.ocr.confidence+')'}</Pill>}<span className="muted smalltext">{e.payment_method==='card'?'Karta':e.payment_method==='cash'?'Hotovost':'Neurčeno'}</span></div>
        <div className="expense-actions">
          <Button small secondary onClick={()=>setEditing(e)}>Upravit</Button>
          {e.receipt_path&&<Button small secondary onClick={()=>viewDocument(e.receipt_path)}>Náhled účtenky</Button>}
          {e.receipt_path&&<Button small secondary disabled={busy} onClick={()=>rescanExpense(e)}><ScanLine size={14}/> Přečíst znovu</Button>}
          {e.bank_path?<Button small secondary onClick={()=>viewDocument(e.bank_path)}>Potvrzení</Button>:e.payment_method==='card'&&<label className="btn small filebtn"><Plus size={14}/> Připojit potvrzení<input type="file" accept="application/pdf,image/*" disabled={busy} onChange={ev=>{attachBank(e,ev.target.files[0]);ev.target.value=''}}/></label>}
          <Button small secondary danger onClick={()=>removeExpense(e)}><Trash2 size={14}/></Button>
        </div>
      </div>)}
      <Button onClick={doExport} disabled={busy||expenses.length===0}><FolderArchive size={17}/> ZIP tohoto vyúčtování</Button>
      <p className="muted smalltext">ZIP zůstává jako záloha souborů. Hlavní výstupy najdeš v záložce <strong>Náhled</strong>: originální vyplněný XLSX a samostatné PDF s doklady.</p>
    </div>;
  }

  function People(){
    return <div className="stack">
      <div className="panel"><div className="heading"><h3>Profily trenérů – podle formuláře ZSL</h3><Users size={20}/></div>
        <p className="muted">Vyplň jednou údaje z listu <strong>s.1 – pokyn</strong>. Zůstanou v telefonu a použijí se do náhledu každého vyúčtování.</p>
        <form onSubmit={addTrainer} key={editingTrainer?.id||'new-trainer'} className="grid-form">
          <div className="two-col"><Input label="Jméno a příjmení *" name="name" defaultValue={editingTrainer?.name||''} required/><Input label="Titul" name="title" defaultValue={editingTrainer?.title||''} placeholder="Mgr., Bc., Ing."/></div>
          <div className="two-col"><Input label="Funkcia / pozice" name="role" defaultValue={editingTrainer?.role||'Tréner'}/><Input label="Oddelenie ZSL" name="department" defaultValue={editingTrainer?.department||'Sekcia moderných disciplín'}/></div>
          <Input label="Trvalé bydlisko – adresa" name="address" defaultValue={editingTrainer?.address||''}/>
          <div className="two-col"><Input label="Telefónny kontakt" name="contact" type="tel" defaultValue={editingTrainer?.contact||''}/><Input label="E-mail (volitelné)" name="email" type="email" defaultValue={editingTrainer?.email||''}/></div>
          <Input label="IBAN vyúčtovateľa" name="iban" defaultValue={editingTrainer?.iban||''} placeholder="SK..."/>
          <div className="two-col"><Input label="BIC / SWIFT (navíc)" name="bic" defaultValue={editingTrainer?.bic||''}/><Input label="Název banky (navíc)" name="bankName" defaultValue={editingTrainer?.bankName||''}/></div>
          <Input label="Klub / organizace" name="club" defaultValue={editingTrainer?.club||'ZSL'}/>
          <Input label="Poznámky" name="notes" defaultValue={editingTrainer?.notes||''}/>
          <Button disabled={busy} type="submit">{editingTrainer?'Uložit upravený profil':'Přidat trenéra'}</Button>
          {editingTrainer&&<Button secondary onClick={()=>setEditingTrainer(null)}>Zrušit úpravy</Button>}
        </form>
        {db.trainers.length>0&&<div className="rider-list">{db.trainers.map(t=><button key={t.id} className="trainer-chip" onClick={()=>setEditingTrainer(t)}>{t.name} · {t.club} <Settings2 size={14}/></button>)}</div>}
        <p className="muted smalltext">IBAN zůstává uložený pouze v tomto zařízení a objeví se v kompletní záloze ZIP. Zálohu předávej bezpečně.</p>
      </div>
      <div className="panel"><div className="heading"><h3>Jezdci a stav v databázi</h3><Users size={20}/></div>
        <p className="muted">Archivace jen skryje jezdce z výběru do nových akcí. Nevymaže jeho historii ani účast ve starších vyúčtováních.</p>
        <form onSubmit={addRider} className="form-row"><Input name="rider" label="Jméno jezdce" placeholder="Jméno a příjmení" required/><Button type="submit" disabled={busy}><Plus size={16}/> Přidat</Button></form>
        {db.riders.length===0?<p className="muted">Zatím nemáš uložené žádné jezdce.</p>:<div className="rider-manager">
          {[...db.riders].sort((a,b)=>Number(!!a.inactive)-Number(!!b.inactive)||a.name.localeCompare(b.name)).map(r=><div className="rider-row" key={r.id}>
            <div><strong>{r.name}</strong><span>{r.inactive?'Archivovaný':'Aktivní'}</span></div>
            <div className="rider-actions"><Button small secondary onClick={()=>setEditingRider(r)}>Upravit</Button><Button small secondary onClick={()=>toggleRiderActive(r)}>{r.inactive?<><UserCheck size={15}/> Vrátit</>:<><UserX size={15}/> Archivovat</>}</Button></div>
          </div>)}
        </div>}
        {editingRider&&<form className="form-row" key={editingRider.id} onSubmit={renameRider}><Input label="Upravit jméno jezdce" name="riderName" defaultValue={editingRider.name} required/><Button type="submit" disabled={busy}>Uložit jméno</Button><Button secondary onClick={()=>setEditingRider(null)}>Zrušit</Button></form>}
      </div>
      {active&&<div className="panel"><div className="heading"><h3>Účastníci aktuální akce</h3><Users size={20}/></div>
        <p className="muted">Změň soupisku i po zahájení akce. Když někdo odjede nebo nepřijede, odškrtni ho a ulož. Jeho profil ani starší doklady nezmizí.</p>
        <form key={active.id+':'+(active.riderIds||[]).join(',')} onSubmit={saveRoster} className="grid-form">
          <div className="checks">{db.riders.filter(r=>!r.inactive||(active.riderIds||[]).includes(r.id)).map(r=>
            <label key={r.id}><input type="checkbox" name="riders" value={r.id} defaultChecked={(active.riderIds||[]).includes(r.id)}/>{r.name}{r.inactive&&' (archivovaný)'}</label>)}
            {db.riders.length===0&&<p className="muted">Nejdřív přidej jezdce.</p>}
          </div>
          <Input label="Důvod změny soupisky (volitelné)" name="rosterReason" placeholder="Nemoc, odjezd, změna nominace…"/><Button type="submit" disabled={busy}>Uložit aktuální soupisku</Button>
        </form>
        {(active.rosterChanges||[]).length>0&&<details className="roster-history"><summary>Historie změn soupisky ({active.rosterChanges.length})</summary>
          <div>{[...active.rosterChanges].reverse().map((x,i)=><p key={i}><strong>{db.riders.find(r=>r.id===x.riderId)?.name||'Jezdec'}</strong> · {x.action==='joined'?'přidán':'vyřazen'} · {new Date(x.at).toLocaleString('cs-CZ')}{x.reason&&' · '+x.reason}</p>)}</div>
        </details>}
      </div>}
    </div>;
  }
  function Backup(){
    const used=storage?.usage||0,quota=storage?.quota||0;
    return <div className="stack">
      <div className="panel"><div className="heading"><h3>Lokální ukládání</h3><HardDrive size={20}/></div>
        <p className="muted">Všechna data i soubory jsou uložené v tomto iPhonu nebo počítači. Nemusíš se přihlašovat a po prvním načtení můžeš pracovat i offline.</p>
        <p className="muted smalltext">Obsazeno úložiště: {used?(used/1024/1024).toFixed(1)+' MB':'neznámé'} {quota?' z dostupných přibližně '+(quota/1024/1024).toFixed(0)+' MB':''}. Trvalé úložiště {isPersistent===true?'povoleno':'nemusí být garantováno'}.</p>
        <div className="alert error"><AlertTriangle size={18}/><span>Odstranění aplikace, vymazání dat Safari nebo porucha telefonu může zničit místní záznamy. Pravidelně vytvářej kompletní ZIP zálohu a ukládej ji do Souborů nebo iCloud Drive.</span></div>
      </div>
      <div className="panel"><div className="heading"><h3>Kompletní záloha</h3><FolderArchive size={20}/></div>
        <p className="muted">Zahrnuje všechny trenéry, jezdce, soustředění i závody, finanční pohyby a originální fotografie a PDF doklady.</p>
        <Button onClick={doBackup} disabled={busy}><Download size={17}/> Stáhnout kompletní zálohu ZIP</Button>
      </div>
      <div className="panel"><div className="heading"><h3>Obnova ze zálohy</h3><Upload size={20}/></div>
        <p className="muted">Zálohu můžeš otevřít i na jiném telefonu. Obnovením přepíšeš všechna současná lokální data, proto si předem ulož vlastní zálohu.</p>
        <label className="btn secondary filebtn"><Upload size={17}/> Vybrat zálohu ZIP<input type="file" accept=".zip,application/zip" disabled={busy} onChange={e=>{doRestore(e.target.files[0]);e.target.value=''}}/></label>
      </div>
      <div className="panel"><div className="heading"><h3>Ochrana dat</h3><ShieldCheck size={20}/></div>
        <p className="muted">Doklady zůstanou v telefonu, ale lokální úložiště není v aplikaci zvlášť šifrované. ZIP záloha také není chráněná heslem. Neodesílej ji veřejně a při sdílení používej bezpečnou cestu.</p>
      </div>
    </div>;
  }
  if(!ready)return <div className="setup"><MountainSnow size={36}/><h1>ZSL Expenses</h1><p>Načítám místní data…</p></div>;
  return <div className="app">
    <header className="topbar"><div className="brand"><span className="brand-icon"><MountainSnow size={25}/></span><div><strong>ZSL Expenses</strong><small>Lokální aplikace · bez účtu</small></div></div><div className="top-actions">{!online&&<Pill warn>Offline</Pill>}<button aria-label="Zálohování" title="Zálohování" onClick={()=>setView('backup')}><HardDrive size={19}/></button><button aria-label="Obnovit přehled" title="Obnovit" onClick={()=>refresh().catch(e=>setError(e.message))}><RefreshCw size={19}/></button></div></header>
    <main className="main">
      {error&&<div className="alert error"><AlertTriangle size={18}/><span>{error}</span><button aria-label="Zavřít" onClick={()=>setError('')}><X size={17}/></button></div>}
      {notice&&<div className="alert success"><CheckCircle2 size={18}/><span>{notice}</span><button aria-label="Zavřít" onClick={()=>setNotice('')}><X size={17}/></button></div>}
      <div className="welcome"><div><p className="eyebrow">Moje vyúčtování</p><h1>ZSL Expenses</h1></div><Button onClick={()=>db.trainers.length?setNewEvent(true):setView('people')}><Plus size={17}/> Nová akce</Button></div>
      {events.length===0?<div className="panel start"><MountainSnow size={40}/><h2>Připrav první akci</h2><p>Nejdřív přidej trenéra, pak vytvoř soustředění nebo závody a začni ukládat účtenky.</p><Button onClick={()=>db.trainers.length?setNewEvent(true):setView('people')}>{db.trainers.length?'Vytvořit akci':'Přidat trenéra'}</Button></div>:<div className="event-select">
        <Select label="Aktuální akce" value={active?.id||''} onChange={e=>{setActiveId(e.target.value);setView('overview')}}>{events.map(ev=><option key={ev.id} value={ev.id}>{ev.kind==='Preteky'?'🏁':'🏔️'} {ev.name} – {db.trainers.find(t=>t.id===ev.trainerId)?.name||'Trenér'}</option>)}</Select>
        <span>{active?.kind} · {showDate(active?.startsOn)}{active?.endsOn&&' – '+showDate(active.endsOn)}</span></div>}
      <div className="tab-nav">{[[ 'overview',Wallet,'Přehled'],['documents',Receipt,'Doklady'],['preview',FileSpreadsheet,'Náhled'],['people',Users,'Lidé'],['backup',HardDrive,'Záloha']].map(([name,Icon,label])=><button key={name} className={view===name?'active':''} onClick={()=>setView(name)}><Icon size={18}/>{label}</button>)}</div>
      {view==='people'?<People/>:view==='backup'?<Backup/>:active?(view==='overview'?<Dashboard/>:view==='preview'?<SettlementPreview
        event={active} trainer={trainer} riders={reportRiders} expenses={expenses} funding={funding}
        onEditEvent={()=>setEditingEvent(true)} onImportTemplate={importXlsxTemplate}
        onDownloadXlsx={downloadOriginalWorkbook} onDownloadAttachments={downloadProofsPdf}
        templateInfo={templateInfo} exportAudit={exportAudit} attachmentAudit={attachmentAudit} busy={busy} onLoadBuiltIn={loadDefaultTemplate}
        onSetExpenseSection={selectExpenseSection} onEditExpense={expense=>setEditing(expense)}
      />:<Documents/>):<Placeholder title="Nejprve vytvoř akci" text="Potom se tu zobrazí její výdaje a přehled zálohy." icon={CalendarDays}/>}
      <footer>ZSL Expenses · lokální aplikace trenéra · soubory zůstávají v telefonu · pravidelně zálohuj ZIP</footer>
    </main>
    {newEvent&&<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setNewEvent(false)}}>
      <div className="modal"><div className="heading"><h2>Nové vyúčtování</h2><button aria-label="Zavřít" onClick={()=>setNewEvent(false)}><X size={20}/></button></div>
        <form onSubmit={createEvent} className="grid-form">
          <Select label="Typ" name="kind"><option value="Sústredenie">Sústredenie (soustředění)</option><option value="Preteky">Preteky (závody)</option></Select>
          <Input label="Název" name="name" placeholder="Pitztal SBX" required/>
          <Select label="Trenér" name="trainer">{db.trainers.map(t=><option value={t.id} key={t.id}>{t.name}{t.club?' – '+t.club:''}</option>)}</Select>
          <div className="two-col"><Input label="Začátek" name="start" type="date"/><Input label="Konec" name="end" type="date"/></div>
          <div className="two-col"><Input label="Miesto konania" name="location" placeholder="Pitztal"/><Input label="Štát" name="country" placeholder="Rakúsko"/></div>
          <Input label="Účel cesty" name="purpose" placeholder="Tréning SBX / preteky"/>
          <div className="two-col"><Input label="Miesto odchodu" name="startPlace"/><Input label="Čas odchodu" name="startTime" type="time"/></div>
          <div className="two-col"><Input label="Miesto návratu" name="endPlace"/><Input label="Čas návratu" name="endTime" type="time"/></div>
          <p className="muted smalltext">Benzín, diesel a AdBlue se automaticky zapisují jako <strong>Motorové vozidlo ZSL</strong>.</p>
          <Input label="Značka vozidla a EČV (volitelné)" name="vehicleDetails" placeholder="Renault Trafic · AA-619RJ"/>
          <Input label="Číslo zálohy (volitelné)" name="advanceNumber"/>
          <label className="input-label"><span>SPRÁVA Z PRACOVNEJ CESTY (volitelné)</span><textarea name="reportText" rows="4" placeholder="Shrnutí průběhu soustředění nebo závodů…"/></label>
          <div className="two-col"><Input label="Počáteční záloha" name="advance" defaultValue="0" inputMode="decimal" required/><Select label="Měna" name="currency"><option>EUR</option><option>CZK</option><option>CHF</option></Select></div>
          <div className="input-label"><span>Jezdci</span><div className="checks">{db.riders.length===0&&<p className="muted">Jezdce přidej v záložce Lidé.</p>}{db.riders.map(r=><label key={r.id}><input type="checkbox" name="riders" value={r.id}/>{r.name}</label>)}</div></div>
          <Button type="submit" disabled={busy}>Vytvořit soustředění / závody</Button>
        </form>
      </div>
    </div>}
    {editingEvent&&active&&<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEditingEvent(false)}}>
      <div className="modal"><div className="heading"><h2>Údaje cesty – ZSL</h2><button aria-label="Zavřít" onClick={()=>setEditingEvent(false)}><X size={20}/></button></div>
        <form key={active.id} onSubmit={saveEventChanges} className="grid-form">
          <Select label="Typ akce" name="kind" defaultValue={active.kind}><option value="Sústredenie">Sústredenie</option><option value="Preteky">Preteky</option></Select>
          <Input name="name" label="Název akce" defaultValue={active.name} required/>
          <Select label="Vyúčtovatel – trenér" name="trainer" defaultValue={active.trainerId}>{db.trainers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          <div className="two-col"><Input name="start" type="date" label="Začátek" defaultValue={active.startsOn||''}/><Input name="end" type="date" label="Konec" defaultValue={active.endsOn||''}/></div>
          <div className="two-col"><Input name="location" label="Miesto konania" defaultValue={active.location||''}/><Input name="country" label="Štát" defaultValue={active.country||''}/></div>
          <Input name="purpose" label="Účel cesty" defaultValue={active.purpose||''}/>
          <div className="two-col"><Input name="startPlace" label="Miesto odchodu" defaultValue={active.startPlace||''}/><Input name="startTime" type="time" label="Čas odchodu" defaultValue={active.startTime||''}/></div>
          <div className="two-col"><Input name="endPlace" label="Miesto návratu" defaultValue={active.endPlace||''}/><Input name="endTime" type="time" label="Čas návratu" defaultValue={active.endTime||''}/></div>
          <p className="muted smalltext">Veškeré tankování a AdBlue patří automaticky do <strong>Motorové vozidlo ZSL</strong>.</p>
          <Input name="vehicleDetails" label="Značka vozidla a EČV" defaultValue={active.vehicleDetails||''}/>
          <Input name="advanceNumber" label="Číslo zálohy" defaultValue={active.advanceNumber||''}/>
          <label className="input-label"><span>SPRÁVA Z PRACOVNEJ CESTY (s.6 - správa)</span><textarea name="reportText" rows="5" defaultValue={active.reportText||''} placeholder="Průběh, trénink, závody, výsledky a zhodnocení cesty…"/></label>
          <Button disabled={busy} type="submit"><Check size={17}/> Uložit cestovní údaje</Button>
        </form>
      </div>
    </div>}
    {editing&&<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(null)}}>
      <div className="modal"><div className="heading"><h2>Upravit doklad</h2><button aria-label="Zavřít" onClick={()=>setEditing(null)}><X size={20}/></button></div>
        <form key={editing.id} onSubmit={updateExpense} className="grid-form">
          <div className="receipt-edit-image">
            <span className="muted">Porovnej rozpoznaný text s původní účtenkou:</span>
            <Button small secondary onClick={()=>setViewingDoc(editing.receipt_path)}><Receipt size={15}/> Zobrazit originální účtenku</Button>
          </div>
          <Input label="Obchodník / dodavatel" name="merchant" defaultValue={editing.merchant} placeholder="Např. Slovnaft"/>
          <div className="two-col"><Input label="Datum platby" name="spentOn" type="date" defaultValue={editing.spent_on||today()}/><Input label={requiresCurrencyConversion(editing,active?.currency||'EUR')?'Přepočtená částka pro ZSL (EUR)':'Částka ('+(active?.currency||'EUR')+')'} name="amount" defaultValue={Number(editing.amount)>0?String(editing.amount):''} inputMode="decimal" placeholder={requiresCurrencyConversion(editing,active?.currency||'EUR')?'Přepočtená suma v EUR':'0,00'} required/></div>
          {Number(editing.sourceAmount)>0&&<div className="zsl-fx-warning">
            <strong>Původní cena z PDF: {currency(editing.sourceAmount,editing.sourceCurrency||'EUR')}</strong>
            {requiresCurrencyConversion(editing,active?.currency||'EUR')&&<p>PDF je v jiné měně. Nezadávej tuto původní částku do eurového vyúčtování. Doplň reálně přepočtenou částku podle banky či účetního podkladu. Eurové ceny uvedené informativně na jízdence nejsou potvrzením bankovního kurzu.</p>}
          </div>}
          <Select label="Kategorie" name="category" defaultValue={editing.category}>{CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</Select>
          <Select label="Způsob platby" name="method" defaultValue={editing.payment_method}><option value="unknown">Neurčeno</option><option value="card">Karta – vyžaduje potvrzení</option><option value="cash">Hotovost</option></Select>
          <Select label="Zařazení do originálu ZSL (palivo vždy vozidlo ZSL)" name="zslSection"
            defaultValue={editing.category==='fuel'?'auto':(editing.zsl_section||'auto')}>
            <option value="auto">Automaticky podle druhu účtenky</option>
            {ZSL_EXPENSE_SECTIONS.filter(section=>!['unassigned','private_car','company_car','zsl_car'].includes(section.id)).map(section=><option key={section.id} value={section.id}>{section.label}</option>)}
            <option value="unassigned">Zatím nezařazeno</option>
          </Select>
          <Input label="Továrenská značka vozidla, EČV vozidla (pokud se týká paliva)" name="vehicleDetails" defaultValue={editing.vehicleDetails||''} placeholder="Např. Renault Trafic / AA-619RJ"/>
          <Input label="Položka pro ZSL Excel (stručně)" name="itemLabel" defaultValue={editing.itemLabel||receiptItemLabel(editing)} placeholder="Např. Diesel, AdBlue, Skipas, Startovné"/>
          <p className="muted smalltext">Do tabulky se zapíše datum, tato položka a částka. Název se navrhne z účtenky, ale můžeš jej přepsat.</p>
          <Input label="Poznámka" name="note" defaultValue={editing.note||''}/>
          {editing.ocr&&<div className="ocr-result"><strong>Automatické čtení · částka: {editing.ocr.confidence||'low'} · dodavatel: {editing.ocr.merchantConfidence||'neurčeno'}</strong>{editing.ocr.receiptCropDetected&&<p className="muted smalltext">Úzká účtenka byla před čtením automaticky izolována a zvětšena.</p>}
            <p>Vysoká jistota OCR nevyžaduje další schvalování. Pokud je částka nebo dodavatel nesprávný, oprav údaj zde. Originální doklad zůstává uložený.</p>
            {(editing.ocr.merchantCandidates||[]).length>0&&<div className="ocr-candidates">
              <span>Možní dodavatelé:</span>
              {editing.ocr.merchantCandidates.slice(0,4).map(c=><button key={c.name} type="button" onClick={event=>{const inp=event.currentTarget.closest('form')?.elements.namedItem('merchant');if(inp)inp.value=c.name}}>{c.name}</button>)}
            </div>}
            {(editing.ocr.amountCandidates||[]).length>0&&<div className="ocr-candidates">Rozpoznané částky: {editing.ocr.amountCandidates.map((c,i)=>c.currency&&c.currency!==(active?.currency||'EUR')?
              <span className="muted smalltext" key={i}>{currency(c.amount,c.currency)} (cizí měna – nelze vložit jako EUR)</span>:
              <button key={i} type="button" onClick={event=>{const inp=event.currentTarget.closest('form')?.elements.namedItem('amount');if(inp)inp.value=String(c.amount).replace('.',',')}}>{currency(c.amount,c.currency||active?.currency||'EUR')}</button>)}</div>}
            <details><summary>Zobrazit rozpoznaný text ({(editing.ocr.scannedPasses||[]).length||1} průchody)</summary><pre>{editing.ocr.rawText||'Bez textu'}</pre></details>
          </div>}
          <p className="muted smalltext">Bankovní potvrzení můžeš přiložit později v seznamu dokladů. Změna způsobu platby z karty odstraní původní bankovní přílohu.</p>
          <Button type="submit" disabled={busy}><Check size={17}/> Uložit změny</Button>
        </form>
      </div>
    </div>}
    {viewingDoc&&<ReceiptViewer id={viewingDoc} onClose={()=>setViewingDoc(null)}/>}
    {ocrProgress&&<div className="ocr-toast"><ScanLine size={17}/>{ocrProgress}</div>}
    {busy&&<div className="busy"><RefreshCw className="spin" size={18}/> {ocrProgress?'Čtu účtenky…':'Ukládám…'}</div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
