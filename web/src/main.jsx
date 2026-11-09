import React,{useState,useEffect,useMemo,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {MountainSnow,Receipt,Users,Wallet,FolderArchive,Plus,Camera,CheckCircle2,AlertTriangle,Download,Upload,Settings2,CalendarDays,ChevronRight,FileText,X,Lock,RefreshCw,Check,Smartphone,HardDrive,Trash2,ShieldCheck,FileSpreadsheet,ScanLine,UserX,UserCheck} from 'lucide-react';
import {currency,decimal,CATEGORIES,expenseStatus,summarize} from './utils.mjs';
import {loadAll,getOne,putOne,uid,addReceipt,setBankConfirmation,saveExpense,deleteExpense,requestPersistence,storageEstimate} from './localdb.js';
import {exportBackup,importBackup,exportEvent,downloadBlob} from './archive.js';
import SettlementPreview from './SettlementPreview.jsx';
import ReceiptViewer from './ReceiptViewer.jsx';
import {createOCRSession,canRecognize} from './ocr.js';
import './style.css';

const initial={trainers:[],riders:[],events:[],funding:[],expenses:[]};
const today=()=>new Date().toISOString().slice(0,10);
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
  const [editingEvent,setEditingEvent]=useState(false);
  const [viewingDoc,setViewingDoc]=useState(null);
  const [ocrProgress,setOcrProgress]=useState('');
  const [online,setOnline]=useState(navigator.onLine);
  const [storage,setStorage]=useState(null);
  const [isPersistent,setIsPersistent]=useState(null);

  const refresh=useCallback(async()=>{const all=await loadAll();setDb(all);const e=await storageEstimate();setStorage(e)},[]);
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
      await putOne('events',{id:idEvent,name,kind:f.get('kind'),trainerId:f.get('trainer'),riderIds:f.getAll('riders'),rosterChanges:[],location:String(f.get('location')||''),country:String(f.get('country')||''),purpose:String(f.get('purpose')||''),startPlace:String(f.get('startPlace')||''),startTime:String(f.get('startTime')||''),endPlace:String(f.get('endPlace')||''),endTime:String(f.get('endTime')||''),advanceNumber:String(f.get('advanceNumber')||''),startsOn:f.get('start'),endsOn:f.get('end'),currency:f.get('currency'),createdAt:new Date().toISOString()});
      if(advance>0)await putOne('funding',{id:uid(),eventId:idEvent,kind:'advance',amount:advance,occurredOn:today(),note:'Počáteční záloha',createdAt:new Date().toISOString()});
      setActiveId(idEvent);setNewEvent(false);setView('overview');setNotice('Akce byla vytvořena a uložena do telefonu.');
    })
  }
  async function saveRoster(e){
    e.preventDefault();if(!active)return;
    const f=new FormData(e.currentTarget),next=f.getAll('riders');
    const old=active.riderIds||[];
    const delta=[
      ...next.filter(id=>!old.includes(id)).map(riderId=>({riderId,action:'joined',at:new Date().toISOString()})),
      ...old.filter(id=>!next.includes(id)).map(riderId=>({riderId,action:'left',at:new Date().toISOString()}))
    ];
    await run(async()=>{
      await putOne('events',{...active,riderIds:next,rosterChanges:[...(active.rosterChanges||[]),...delta]});
      setNotice('Aktuální soupiska aktualizována. Historie změn zůstává zachovaná.');
    })
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
        advanceNumber:String(f.get('advanceNumber')||'')
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
    // Copy FileList before resetting the HTML input.
    const files=Array.from(inputFiles);
    await run(async()=>{
      const uploaded=[];
      for(const file of files)uploaded.push({file,expense:await addReceipt(active.id,file)});
      await refresh(); // Receipt images are safe even if OCR cannot run.
      let scanned=0,failed=0;
      const photos=uploaded.filter(x=>canRecognize(x.file));
      if(photos.length){
        let scanner=null;
        try{
          setOcrProgress('Připravuji rozpoznávání…');
          scanner=await createOCRSession(setOcrProgress);
          for(let i=0;i<photos.length;i++){
            const {file,expense}=photos[i];
            try{
              setOcrProgress('Čtu účtenku '+(i+1)+'/'+photos.length+'…');
              const found=await scanner.scan(file);
              const candidate={
                ...expense,amount:found.amount||0,merchant:found.merchant||'',
                spent_on:found.spent_on||expense.spent_on,
                category:found.category||expense.category,
                payment_method:found.payment_method||'unknown',
                ocr:{confidence:found.confidence,amountCandidates:found.amountCandidates,rawText:found.rawText,reviewed:false,scannedAt:new Date().toISOString()}
              };
              await saveExpense(candidate);scanned++;
            }catch(ocrError){failed++;}
          }
        }catch(ocrError){failed+=photos.length-scanned;setError('OCR se nepodařilo spustit: '+(ocrError.message||ocrError)+'. Účtenky jsou uložené; částku lze doplnit ručně.')}
        finally{if(scanner)await scanner.close().catch(()=>{});setOcrProgress('');}
      }
      setView('documents');
      setNotice('Uloženo '+uploaded.length+' účtenek. Automaticky předvyplněno '+scanned+'.'+(failed?' U '+failed+' fotografií je potřeba ruční kontrola.':'')+' Navržené údaje otevři přes Upravit a potvrď.');
    });
  }
  async function rescanExpense(expense){
    await run(async()=>{
      const doc=await getOne('documents',expense.receipt_path);
      if(!doc?.blob)throw new Error('Fotografii se nepodařilo načíst.');
      if(!canRecognize(doc.blob))throw new Error('OCR podporuje fotografie, nikoli PDF. Částku z PDF zatím zadej ručně.');
      let scanner=null;
      try{
        setOcrProgress('Čtu existující účtenku…');
        scanner=await createOCRSession(setOcrProgress);
        const found=await scanner.scan(doc.blob);
        await saveExpense({
          ...expense,
          amount:Number(expense.amount)>0?expense.amount:(found.amount||0),
          merchant:expense.merchant||found.merchant||'',
          spent_on:found.spent_on||expense.spent_on,
          category:expense.category==='other'?found.category:expense.category,
          payment_method:expense.payment_method==='unknown'?found.payment_method:expense.payment_method,
          ocr:{confidence:found.confidence,amountCandidates:found.amountCandidates,rawText:found.rawText,reviewed:false,scannedAt:new Date().toISOString()}
        });
        setNotice('OCR dokončeno. Zkontroluj navržené údaje v detailu výdaje.');
      }finally{if(scanner)await scanner.close().catch(()=>{});setOcrProgress('')}
    });
  }
  async function updateExpense(e){
    e.preventDefault();const f=new FormData(e.currentTarget),val=decimal(f.get('amount'));
    if(!Number.isFinite(val)||val<0){setError('Neplatná částka výdaje.');return}
    await run(async()=>{
      await saveExpense({...editing,merchant:String(f.get('merchant')||'').trim(),spent_on:f.get('spentOn')||'',amount:val,category:f.get('category'),payment_method:f.get('method'),note:String(f.get('note')||''),ocr:editing.ocr?{...editing.ocr,reviewed:true}:undefined});
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

  function Dashboard(){
    const groups=CATEGORIES.map(c=>({...c,value:expenses.filter(x=>x.category===c.id).reduce((s,x)=>s+Number(x.amount),0)}));
    let angle=0;
    const parts=groups.filter(x=>x.value>0&&summary.spent>0).map(g=>{const end=angle+100*g.value/summary.spent;const part=g.color+' '+angle+'% '+end+'%';angle=end;return part});
    const dough=parts.length?'conic-gradient('+parts.join(',')+')':'conic-gradient(#374760 0% 100%)';
    return <div className="stack">
      <div className="stats">
        <div className="metric"><span>Celkem přijaté zálohy</span><strong>{currency(summary.deposit,active.currency)}</strong></div>
        <div className="metric"><span>Útrata na dokladech</span><strong>{currency(summary.spent,active.currency)}</strong></div>
        <div className={'metric main '+(summary.remaining<0?'negative':'')}><span>Zbývá ze zálohy</span><strong>{currency(summary.remaining,active.currency)}</strong></div>
      </div>
      <div className="panel"><div className="heading"><h3>Čerpání zálohy</h3><Wallet size={20}/></div>
        <div className="track"><div style={{width:(summary.deposit>summary.returned?Math.min(100,Math.max(0,summary.spent/(summary.deposit-summary.returned)*100)):0)+'%'}}/></div>
        <div className="between muted smalltext"><span>Vráceno: {currency(summary.returned,active.currency)}</span><span>{summary.deposit>summary.returned?Math.round(summary.spent/(summary.deposit-summary.returned)*100):0} % využito</span></div>
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
        <p className="muted">Nahraj více účtenek najednou, nebo je vyfoť. Fotografie se uloží jen do tohoto telefonu. Údaje zatím doplníš ručně.</p>
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
        <div className="expense-top"><div><strong>{e.merchant||e.receipt_name||'Doklad'}</strong><small>{showDate(e.spent_on)} · {CATEGORIES.find(c=>c.id===e.category)?.label||'Ostatní'}</small></div><b>{currency(e.amount,active.currency)}</b></div>
        <div className="expense-bottom"><Status item={e}/><span className="muted smalltext">{e.payment_method==='card'?'Karta':e.payment_method==='cash'?'Hotovost':'Neurčeno'}</span></div>
        <div className="expense-actions">
          <Button small secondary onClick={()=>setEditing(e)}>Upravit</Button>
          {e.receipt_path&&<Button small secondary onClick={()=>viewDocument(e.receipt_path)}>Účtenka</Button>}
          {e.bank_path?<Button small secondary onClick={()=>viewDocument(e.bank_path)}>Potvrzení</Button>:e.payment_method==='card'&&<label className="btn small filebtn"><Plus size={14}/> Připojit potvrzení<input type="file" accept="application/pdf,image/*" disabled={busy} onChange={ev=>{attachBank(e,ev.target.files[0]);ev.target.value=''}}/></label>}
          <Button small secondary danger onClick={()=>removeExpense(e)}><Trash2 size={14}/></Button>
        </div>
      </div>)}
      <Button onClick={doExport} disabled={busy||expenses.length===0}><FolderArchive size={17}/> ZIP tohoto vyúčtování</Button>
      <p className="muted smalltext">Obsahuje přílohy jednotlivých výdajů, CSV a přehled chybějících potvrzení. Oficiální Excel ZSL doplníme v další verzi.</p>
    </div>;
  }

  function People(){
    return <div className="stack">
      <div className="panel"><div className="heading"><h3>Trenéři</h3><Users size={20}/></div>
        <p className="muted">Profily si uložíš jednou. Při založení nového vyúčtování se vybere trenér a jeho údaje se použijí automaticky.</p>
        <form onSubmit={addTrainer} key={editingTrainer?.id||'new-trainer'} className="grid-form">
          <Input label="Jméno a příjmení" name="name" defaultValue={editingTrainer?.name||''} required/>
          <div className="two-col"><Input label="Klub / organizace" name="club" defaultValue={editingTrainer?.club||'ZSL'}/><Input label="Kontakt (volitelné)" name="contact" defaultValue={editingTrainer?.contact||''}/></div>
          <Input label="Adresa (pro budoucí Excel)" name="address" defaultValue={editingTrainer?.address||''}/>
          <Input label="Další poznámky" name="notes" defaultValue={editingTrainer?.notes||''}/>
          <Button disabled={busy} type="submit">{editingTrainer?'Uložit úpravy':'Přidat trenéra'}</Button>
          {editingTrainer&&<Button secondary onClick={()=>setEditingTrainer(null)}>Zrušit úpravy</Button>}
        </form>
        {db.trainers.length>0&&<div className="rider-list">{db.trainers.map(t=><button key={t.id} className="trainer-chip" onClick={()=>{setEditingTrainer(t);setView('people')}}>{t.name} · {t.club} <Settings2 size={14}/></button>)}</div>}
      </div>
      <div className="panel"><div className="heading"><h3>Jezdci</h3><Users size={20}/></div>
        <form onSubmit={addRider} className="form-row"><Input name="rider" label="Jméno jezdce" placeholder="Jméno a příjmení" required/><Button type="submit" disabled={busy}><Plus size={16}/> Přidat</Button></form>
        {db.riders.length===0?<p className="muted">Zatím nemáš uložené žádné jezdce.</p>:<div className="rider-list">{db.riders.map(r=><div key={r.id}>{r.name}</div>)}</div>}
      </div>
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
      <div className="tab-nav">{[[ 'overview',Wallet,'Přehled'],['documents',Receipt,'Doklady'],['people',Users,'Lidé'],['backup',HardDrive,'Záloha']].map(([name,Icon,label])=><button key={name} className={view===name?'active':''} onClick={()=>setView(name)}><Icon size={18}/>{label}</button>)}</div>
      {view==='people'?<People/>:view==='backup'?<Backup/>:active?(view==='overview'?<Dashboard/>:<Documents/>):<Placeholder title="Nejprve vytvoř akci" text="Potom se tu zobrazí její výdaje a přehled zálohy." icon={CalendarDays}/>}
      <footer>Lokální prototyp · ukládej pravidelné ZIP zálohy · bez cloudové synchronizace</footer>
    </main>
    {newEvent&&<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setNewEvent(false)}}>
      <div className="modal"><div className="heading"><h2>Nové vyúčtování</h2><button aria-label="Zavřít" onClick={()=>setNewEvent(false)}><X size={20}/></button></div>
        <form onSubmit={createEvent} className="grid-form">
          <Select label="Typ" name="kind"><option value="Sústredenie">Sústredenie (soustředění)</option><option value="Preteky">Preteky (závody)</option></Select>
          <Input label="Název" name="name" placeholder="Pitztal SBX" required/>
          <Select label="Trenér" name="trainer">{db.trainers.map(t=><option value={t.id} key={t.id}>{t.name}{t.club?' – '+t.club:''}</option>)}</Select>
          <div className="two-col"><Input label="Začátek" name="start" type="date"/><Input label="Konec" name="end" type="date"/></div>
          <div className="two-col"><Input label="Počáteční záloha" name="advance" defaultValue="0" inputMode="decimal" required/><Select label="Měna" name="currency"><option>EUR</option><option>CZK</option><option>CHF</option></Select></div>
          <div className="input-label"><span>Jezdci</span><div className="checks">{db.riders.length===0&&<p className="muted">Jezdce přidej v záložce Lidé.</p>}{db.riders.map(r=><label key={r.id}><input type="checkbox" name="riders" value={r.id}/>{r.name}</label>)}</div></div>
          <Button type="submit" disabled={busy}>Vytvořit soustředění / závody</Button>
        </form>
      </div>
    </div>}
    {editing&&<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(null)}}>
      <div className="modal"><div className="heading"><h2>Upravit doklad</h2><button aria-label="Zavřít" onClick={()=>setEditing(null)}><X size={20}/></button></div>
        <form key={editing.id} onSubmit={updateExpense} className="grid-form">
          <Input label="Obchodník / dodavatel" name="merchant" defaultValue={editing.merchant} placeholder="Např. Slovnaft"/>
          <div className="two-col"><Input label="Datum" name="spentOn" type="date" defaultValue={editing.spent_on||today()}/><Input label="Částka" name="amount" defaultValue={String(editing.amount||'')} inputMode="decimal" required/></div>
          <Select label="Kategorie" name="category" defaultValue={editing.category}>{CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</Select>
          <Select label="Způsob platby" name="method" defaultValue={editing.payment_method}><option value="unknown">Neurčeno</option><option value="card">Karta – vyžaduje potvrzení</option><option value="cash">Hotovost</option></Select>
          <Input label="Poznámka" name="note" defaultValue={editing.note||''}/>
          <p className="muted smalltext">Bankovní potvrzení můžeš přiložit později v seznamu dokladů. Změna způsobu platby z karty odstraní původní bankovní přílohu.</p>
          <Button type="submit" disabled={busy}><Check size={17}/> Uložit změny</Button>
        </form>
      </div>
    </div>}
    {busy&&<div className="busy"><RefreshCw className="spin" size={18}/> Ukládám…</div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
