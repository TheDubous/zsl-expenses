import React,{useState,useEffect,useMemo,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import JSZip from 'jszip';
import {MountainSnow,Receipt,Users,Wallet,FolderArchive,Plus,Camera,CheckCircle2,AlertTriangle,Download,Upload,LogOut,Settings2,CalendarDays,ChevronRight,FileText,X,Lock,RefreshCw,ArrowLeft,Check,TrendingDown} from 'lucide-react';
import {sb,configured,collect,saveFile,getFile,openFile,assertOk} from './data.js';
import {CATEGORIES,currency,decimal,expenseStatus,summarize,safeFilename,csvCell} from './utils.mjs';
import './style.css';

const today=()=>new Date().toISOString().slice(0,10);
const delay=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
function Button({children,onClick,secondary=false,disabled=false,danger=false,small=false,type='button'}){
  return <button type={type} disabled={disabled} onClick={onClick} className={'btn '+(secondary?'secondary ':'')+(danger?'danger ':'')+(small?'small':'')}>{children}</button>;
}
function Input({label,...props}){return <label className="input-label"><span>{label}</span><input {...props}/></label>}
function Select({label,children,...props}){return <label className="input-label"><span>{label}</span><select {...props}>{children}</select></label>}
function Pill({children,ok=false,warn=false}){return <span className={'pill '+(ok?'ok':warn?'warn':'')}>{children}</span>}
function Placeholder({title,text,icon:Icon=Receipt}){return <div className="empty"><Icon size={31}/><strong>{title}</strong><span>{text}</span></div>}
function Status({item}){const state=expenseStatus(item);return <Pill ok={state==='Doklady kompletní'} warn={state!=='Doklady kompletní'}>{state==='Doklady kompletní'?<CheckCircle2 size={13}/>:<AlertTriangle size={13}/>} {state}</Pill>}
function miniDate(d){if(!d)return '—';const date=new Date(d+'T12:00:00');return Number.isNaN(date.getTime())?d:date.toLocaleDateString('cs-CZ')}
function App(){
  const [session,setSession]=useState(null);
  const [authReady,setAuthReady]=useState(false);
  const [db,setDb]=useState({trainer_profiles:[],riders:[],events:[],event_riders:[],funding_movements:[],expenses:[]});
  const [activeId,setActiveId]=useState(null);
  const [view,setView]=useState('overview');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [showNew,setShowNew]=useState(false);
  const [editing,setEditing]=useState(null);
  const [online,setOnline]=useState(navigator.onLine);
  const user=session?.user;
  const profile=db.trainer_profiles.find(x=>x.id===user?.id);
  const events=[...db.events].sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const active=events.find(x=>x.id===activeId)||events[0]||null;
  const expenses=useMemo(()=>db.expenses.filter(x=>x.event_id===active?.id).sort((a,b)=>b.created_at.localeCompare(a.created_at)),[db.expenses,active?.id]);
  const funding=useMemo(()=>db.funding_movements.filter(x=>x.event_id===active?.id),[db.funding_movements,active?.id]);
  const metrics=useMemo(()=>summarize(expenses,funding),[expenses,funding]);
  const selectedRiders=db.event_riders.filter(x=>x.event_id===active?.id).map(x=>db.riders.find(r=>r.id===x.rider_id)?.full_name).filter(Boolean);

  useEffect(()=>{
    const on=()=>setOnline(true),off=()=>setOnline(false);
    window.addEventListener('online',on);window.addEventListener('offline',off);
    return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)};
  },[]);
  useEffect(()=>{
    if(!sb){setAuthReady(true);return;}
    sb.auth.getSession().then(({data,error})=>{if(error)setError(error.message);setSession(data?.session||null)}).finally(()=>setAuthReady(true));
    const {data:{subscription}}=sb.auth.onAuthStateChange((_ev,s)=>setSession(s));
    return()=>subscription.unsubscribe();
  },[]);
  const refresh=useCallback(async()=>{
    if(!user)return;
    try{const all=await collect();setDb(all);setError('');}
    catch(e){setError('Načtení databáze: '+(e.message||e));}
  },[user?.id]);
  useEffect(()=>{if(user)refresh();else setDb({trainer_profiles:[],riders:[],events:[],event_riders:[],funding_movements:[],expenses:[]})},[user?.id,refresh]);

  async function run(action){
    if(!online){setError('Pro ukládání dat potřebuješ internet. Údaje zůstávají v databázi, ne offline v telefonu.');return;}
    setBusy(true);setError('');setNotice('');
    try{await action();await refresh();}
    catch(e){setError(e.message||String(e))}
    finally{setBusy(false)}
  }

  async function saveProfile(e){
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    const full_name=String(fd.get('full_name')||'').trim();
    const club=String(fd.get('club')||'ZSL').trim();
    await run(async()=>{
      assertOk(await sb.from('trainer_profiles').upsert({id:user.id,full_name,club}));
      setNotice('Profil trenéra byl uložen.');
    });
  }
  async function addRider(e){
    e.preventDefault();const form=e.currentTarget;const fd=new FormData(form);
    const full_name=String(fd.get('rider')||'').trim();if(!full_name)return;
    await run(async()=>{assertOk(await sb.from('riders').insert({full_name}));form.reset();setNotice('Jezdec byl přidán.')});
  }
  async function addEvent(e){
    e.preventDefault();const form=e.currentTarget;const fd=new FormData(form);
    const name=String(fd.get('name')||'').trim();
    const kind=String(fd.get('kind')||'Sústredenie');
    const advance=decimal(fd.get('advance'));
    if(!name||!Number.isFinite(advance)||advance<0) {setError('Zadej název a správnou částku zálohy.');return}
    await run(async()=>{
      const created=assertOk(await sb.from('events').insert({
        name,kind,starts_on:fd.get('start')||null,ends_on:fd.get('end')||null,
        currency:fd.get('currency')||'EUR'
      }).select().single());
      const riders=fd.getAll('riders');
      if(riders.length)assertOk(await sb.from('event_riders').insert(riders.map(rider_id=>({event_id:created.id,rider_id}))));
      if(advance>0)assertOk(await sb.from('funding_movements').insert({event_id:created.id,kind:'advance',amount:advance,occurred_on:today(),note:'Počáteční záloha'}));
      setActiveId(created.id);setShowNew(false);setView('overview');setNotice('Nové vyúčtování bylo založeno.');
    });
  }
  async function addFunding(e){
    e.preventDefault();const form=e.currentTarget;const fd=new FormData(form);
    const amount=decimal(fd.get('amount'));
    if(!active||!Number.isFinite(amount)||amount<=0){setError('Zadej kladnou částku.');return}
    await run(async()=>{
      assertOk(await sb.from('funding_movements').insert({
        event_id:active.id,kind:fd.get('kind'),amount,occurred_on:fd.get('date')||today(),note:String(fd.get('note')||'')
      }));
      form.reset();setNotice('Pohyb peněz byl uložen.');
    });
  }
  async function uploadReceipts(files){
    if(!active||!files?.length)return;
    await run(async()=>{
      let success=0;
      for(const file of Array.from(files)){
        if(file.size>15*1024*1024)throw new Error(file.name+': maximální velikost je 15 MB.');
        const row=assertOk(await sb.from('expenses').insert({
          event_id:active.id,receipt_name:file.name,spent_on:today(),category:'other',
          merchant:'',amount:0,payment_method:'unknown'
        }).select().single());
        const path=await saveFile(user.id,active.id,row.id,file,'receipt');
        assertOk(await sb.from('expenses').update({receipt_path:path}).eq('id',row.id));
        success++;
      }
      setNotice('Nahráno '+success+' účtenek. Teď můžeš doplnit částky a způsob platby.');
      setView('documents');
    });
  }
  async function saveExpense(e){
    e.preventDefault();const fd=new FormData(e.currentTarget);
    const value=decimal(fd.get('amount'));
    if(!Number.isFinite(value)||value<0){setError('Částka musí být platné číslo.');return}
    await run(async()=>{
      assertOk(await sb.from('expenses').update({
        merchant:String(fd.get('merchant')||'').trim(),spent_on:fd.get('date')||null,
        amount:value,category:fd.get('category'),payment_method:fd.get('method'),
        note:String(fd.get('note')||'')
      }).eq('id',editing.id));
      setEditing(null);setNotice('Údaje dokladu byly uložené.');
    });
  }
  async function uploadConfirmation(expense,file){
    if(!file||!expense||expense.payment_method!=='card')return;
    await run(async()=>{
      const path=await saveFile(user.id,expense.event_id,expense.id,file,'bank');
      assertOk(await sb.from('expenses').update({bank_path:path,bank_name:file.name}).eq('id',expense.id));
      setNotice('Bankovní potvrzení bylo připojeno k platbě.');
    });
  }
  async function zipExport(){
    if(!active)return;
    await run(async()=>{
      const zip=new JSZip(),dir=zip.folder('Doklady');
      const csv=[['ID','Datum','Dodavatel','Castka','Mena','Kategorie','Platba','Stav']];
      for(let i=0;i<expenses.length;i++){
        const x=expenses[i];
        const group=dir.folder(String(i+1).padStart(3,'0')+'_'+safeFilename(x.merchant||x.receipt_name));
        csv.push([x.id,x.spent_on,x.merchant,x.amount,active.currency,CATEGORIES.find(c=>c.id===x.category)?.label,
          x.payment_method,expenseStatus(x)]);
        for(const f of [{path:x.receipt_path,name:x.receipt_name,prefix:'Uctenka'},{path:x.bank_path,name:x.bank_name,prefix:'Bankovni_potvrzeni'}]){
          if(!f.path)continue;
          try{const blob=await getFile(f.path);group.file(f.prefix+'_'+safeFilename(f.name),await blob.arrayBuffer())}
          catch(err){group.file(f.prefix+'_NEDOSTUPNY.txt','Soubor se nepodařilo stáhnout. '+err.message)}
        }
      }
      zip.file('Vydaje.csv','\uFEFF'+csv.map(row=>row.map(csvCell).join(';')).join('\r\n'));
      zip.file('Zaloha_a_pohyby.csv','\uFEFF'+[['Typ','Datum','Castka','Mena','Poznamka'],...funding.map(f=>[f.kind,f.occurred_on,f.amount,active.currency,f.note])].map(row=>row.map(csvCell).join(';')).join('\r\n'));
      zip.file('Kontrola.txt','Nekompletní doklady:\n'+(expenses.filter(x=>expenseStatus(x)!=='Doklady kompletní').map(x=>x.merchant+' | '+x.amount+' | '+expenseStatus(x)).join('\n')||'Žádné'));
      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
      const a=document.createElement('a'),url=URL.createObjectURL(blob);
      a.href=url;a.download='ZSL_'+safeFilename(active.name)+'_doklady.zip';document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),10000);
      setNotice('ZIP archiv byl vytvořen. Obsahuje pouze doklady nahrané k této akci.');
    });
  }

  if(!configured)return <div className="setup"><MountainSnow size={46}/><h1>ZSL Expenses</h1><p>Webová aplikace je připravená, ale zatím není připojena k databázi.</p><p>Pro spuštění je potřeba nastavit Supabase a proměnné <code>VITE_SUPABASE_URL</code> a <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>.</p><p>Postup je v souboru <code>web/README.md</code> na GitHubu.</p></div>;
  if(!authReady)return <div className="setup">Načítání ZSL Expenses…</div>;
  if(!user)return <Auth/>;

  function Overview(){
    const groups=CATEGORIES.map(c=>({...c,value:expenses.filter(e=>e.category===c.id).reduce((s,x)=>s+Number(x.amount||0),0)}));
    let angle=0;const parts=[];
    for(const g of groups){if(metrics.spent<=0||g.value<=0)continue;const end=angle+g.value/metrics.spent*100;parts.push(g.color+' '+angle+'% '+end+'%');angle=end}
    const dough=parts.length?'conic-gradient('+parts.join(',')+')':'conic-gradient(#374760 0% 100%)';
    return <div className="stack">
      <div className="stats">
        <div className="metric"><span>Celkem přijato</span><strong>{currency(metrics.deposit,active.currency)}</strong></div>
        <div className="metric"><span>Útrata na dokladech</span><strong>{currency(metrics.spent,active.currency)}</strong></div>
        <div className={'metric main '+(metrics.remaining<0?'negative':'')}><span>Zbývá ze zálohy</span><strong>{currency(metrics.remaining,active.currency)}</strong></div>
      </div>
      <div className="panel"><div className="heading"><h3>Čerpání zálohy</h3><Wallet size={20}/></div>
        <div className="track"><div style={{width:(metrics.deposit>0?Math.min(100,Math.max(0,metrics.spent/(metrics.deposit-metrics.returned||1)*100)):0)+'%'}}/></div>
        <div className="between muted smalltext"><span>Vráceno: {currency(metrics.returned,active.currency)}</span><span>{metrics.deposit>metrics.returned?Math.round(metrics.spent/(metrics.deposit-metrics.returned)*100):0} % využito</span></div>
      </div>
      <div className="panel"><div className="heading"><h3>Výdaje podle kategorií</h3><TrendingDown size={19}/></div>
        <div className="chart-layout"><div className="donut" style={{background:dough}}><div className="donut-middle"><b>{currency(metrics.spent,active.currency)}</b><small>celkem</small></div></div>
          <div className="legend">{groups.map(g=><div key={g.id}><i style={{background:g.color}}/><span>{g.label}</span><strong>{currency(g.value,active.currency)}</strong></div>)}</div>
        </div>
      </div>
      <div className="panel"><div className="heading"><h3>Kontrola dokumentů</h3><Receipt size={20}/></div>
        <div className="counts"><div><strong>{metrics.count}</strong><span>Účtenek</span></div><div><strong>{metrics.incomplete}</strong><span>Ke kontrole</span></div><div><strong>{metrics.missingBank}</strong><span>Chybí potvrzení</span></div></div>
        <Button secondary onClick={()=>setView('documents')}>Otevřít doklady <ChevronRight size={16}/></Button>
      </div>
      <div className="panel"><div className="heading"><h3>Finance akce</h3><Plus size={20}/></div>
        <form onSubmit={addFunding} className="form-row">
          <Select label="Pohyb" name="kind"><option value="advance">Další záloha / vklad</option><option value="return">Vrácení peněz</option></Select>
          <Input label="Částka" name="amount" placeholder="0,00" inputMode="decimal" required/>
          <Input label="Datum" name="date" type="date" defaultValue={today()}/>
          <Input label="Poznámka" name="note" placeholder="Volitelná"/>
          <Button type="submit" disabled={busy}>Uložit pohyb</Button>
        </form>
        {funding.length>0&&<div className="funding-list">{[...funding].reverse().map(f=><div key={f.id}><span>{f.kind==='advance'?'+ Záloha':'− Vráceno'} · {miniDate(f.occurred_on)} {f.note&&('· '+f.note)}</span><strong>{currency(f.amount,active.currency)}</strong></div>)}</div>}
      </div>
    </div>
  }

  function Documents(){
    return <div className="stack">
      <div className="panel"><div className="heading"><h3>1. Nahraj účtenky</h3><Camera size={20}/></div>
        <p className="muted">Více fotografií najednou nebo přímo fotoaparátem. Údaje zatím doplníš ručně; automatické čtení připravíme později.</p>
        <div className="upload-row">
          <label className="btn filebtn"><Upload size={17}/> Vybrat více účtenek<input type="file" accept="image/*,application/pdf" multiple disabled={busy} onChange={e=>{uploadReceipts(e.target.files);e.target.value=''}}/></label>
          <label className="btn secondary filebtn"><Camera size={17}/> Vyfotit účtenku<input type="file" accept="image/*" capture="environment" disabled={busy} onChange={e=>{uploadReceipts(e.target.files);e.target.value=''}}/></label>
        </div>
      </div>
      <div className="panel"><div className="heading"><h3>2. Později doplň potvrzení</h3><FileText size={20}/></div>
        <p className="muted">Každá platba kartou má vlastní bankovní potvrzení. Nahrává se přímo ke konkrétnímu výdaji níže. Hotovost potvrzení nevyžaduje.</p>
        <div className="counts"><div><strong>{metrics.count}</strong><span>Celkem</span></div><div><strong>{metrics.missingBank}</strong><span>Bez výpisu</span></div><div><strong>{metrics.count-metrics.incomplete}</strong><span>Kompletní</span></div></div>
      </div>
      <div className="heading"><h3>Seznam výdajů</h3><span className="muted">{expenses.length} záznamů</span></div>
      {expenses.length===0&&<Placeholder title="Zatím žádné doklady" text="Nahraj fotografie a první výdaje se objeví tady."/>}
      {expenses.map(x=><div className="expense" key={x.id}>
        <div className="expense-top"><div><strong>{x.merchant||x.receipt_name||'Nový doklad'}</strong><small>{miniDate(x.spent_on)} · {CATEGORIES.find(c=>c.id===x.category)?.label||'Ostatní'}</small></div><b>{currency(x.amount,active.currency)}</b></div>
        <div className="expense-bottom"><Status item={x}/>
          <span className="muted smalltext">{x.payment_method==='card'?'Kartou':x.payment_method==='cash'?'Hotovost':'Neurčeno'}</span></div>
        <div className="expense-actions">
          <Button small secondary onClick={()=>setEditing(x)}>Upravit</Button>
          {x.receipt_path&&<Button small secondary onClick={()=>run(()=>openFile(x.receipt_path))}>Účtenka</Button>}
          {x.bank_path?<Button small secondary onClick={()=>run(()=>openFile(x.bank_path))}>Bankovní potvrzení</Button>:x.payment_method==='card'&&
            <label className="btn small filebtn"><Plus size={14}/> Doplnit potvrzení<input type="file" accept="application/pdf,image/*" disabled={busy} onChange={e=>{uploadConfirmation(x,e.target.files[0]);e.target.value=''}}/></label>}
        </div>
      </div>)}
      <Button disabled={busy||!expenses.length} onClick={zipExport}><FolderArchive size={17}/> Stáhnout ZIP dokladů</Button>
      <p className="muted smalltext">Součástí ZIPu jsou účtenky, potvrzení, CSV a kontrolní seznam. Vyplnění oficiálního Excelu ZSL bude v další fázi.</p>
    </div>
  }

  function People(){
    return <div className="stack">
      <div className="panel"><div className="heading"><h3>Profil trenéra</h3><Users size={20}/></div>
        <p className="muted">Každý trenér má vlastní účet, údaje a akce. Vyplníš jednou, potom se načítají automaticky.</p>
        <form key={profile?.full_name||'empty-profile'} onSubmit={saveProfile} className="grid-form">
          <Input label="Jméno a příjmení" name="full_name" defaultValue={profile?.full_name||''} required/>
          <Input label="Klub" name="club" defaultValue={profile?.club||'ZSL'}/>
          <Button type="submit" disabled={busy}>Uložit profil</Button>
        </form>
        <p className="muted smalltext">Přihlášený účet: {user.email}</p>
      </div>
      <div className="panel"><div className="heading"><h3>Databáze jezdců</h3><Users size={20}/></div>
        <form onSubmit={addRider} className="form-row"><Input name="rider" label="Jméno jezdce" placeholder="Jméno a příjmení" required/><Button type="submit" disabled={busy}><Plus size={16}/> Přidat</Button></form>
        {db.riders.length===0?<p className="muted">Zatím nemáš uložené jezdce.</p>:<div className="rider-list">{db.riders.map(r=><div key={r.id}>{r.full_name}</div>)}</div>}
      </div>
      {active&&<div className="panel"><h3>Účastníci: {active.name}</h3><p className="muted">{selectedRiders.join(', ')||'Žádní vybraní jezdci'}</p></div>}
    </div>
  }

  return <div className="app">
    <header className="topbar"><div className="brand"><span className="brand-icon"><MountainSnow size={25}/></span><div><strong>ZSL Expenses</strong><small>Správa vyúčtování</small></div></div>
      <div className="top-actions">{!online&&<Pill warn>Offline</Pill>}<button aria-label="Obnovit" onClick={refresh}><RefreshCw size={19}/></button><button aria-label="Odhlásit" onClick={()=>sb.auth.signOut()}><LogOut size={19}/></button></div></header>
    <main className="main">
      {error&&<div className="alert error"><AlertTriangle size={18}/><span>{error}</span><button aria-label="Zavřít" onClick={()=>setError('')}><X size={17}/></button></div>}
      {notice&&<div className="alert success"><CheckCircle2 size={18}/><span>{notice}</span><button aria-label="Zavřít" onClick={()=>setNotice('')}><X size={17}/></button></div>}
      <div className="welcome"><div><p className="eyebrow">Moje vyúčtování</p><h1>{profile?.full_name?'Ahoj, '+profile.full_name.split(' ')[0]:'Vítej v ZSL Expenses'}</h1></div><Button onClick={()=>setShowNew(true)}><Plus size={17}/> Nová akce</Button></div>
      {events.length===0?<div className="panel start"><MountainSnow size={40}/><h2>Začni novou akcí</h2><p>Vytvoř soustředění nebo závody, přidej účastníky a začni evidovat výdaje.</p><Button onClick={()=>setShowNew(true)}><Plus size={17}/> Založit vyúčtování</Button></div>:<>
        <div className="event-select"><Select label="Aktuální akce" value={active?.id||''} onChange={e=>{setActiveId(e.target.value);setView('overview')}}>
          {events.map(ev=><option key={ev.id} value={ev.id}>{ev.kind==='Preteky'?'🏁':'🏔️'} {ev.name}</option>)}
        </Select><span>{active?.kind} · {miniDate(active?.starts_on)}{active?.ends_on&&' – '+miniDate(active.ends_on)}</span></div>
        <div className="tab-nav">{[['overview',Wallet,'Přehled'],['documents',Receipt,'Doklady'],['people',Users,'Lidé']].map(([id,Icon,label])=><button key={id} className={view===id?'active':''} onClick={()=>setView(id)}><Icon size={18}/>{label}</button>)}</div>
        {view==='overview'?<Overview/>:view==='documents'?<Documents/>:<People/>}
      </>}
      {events.length===0&&<People/>}
      <footer>Testovací verze · údaje jsou oddělené podle přihlášeného trenéra · pro ostré účetnictví ještě ověřit</footer>
    </main>
    {showNew&&<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setShowNew(false)}}>
      <div className="modal"><div className="heading"><h2>Nové vyúčtování</h2><button onClick={()=>setShowNew(false)}><X size={20}/></button></div>
        <form onSubmit={addEvent} className="grid-form">
          <Select label="Typ akce" name="kind"><option value="Sústredenie">Sústredenie – soustředění</option><option value="Preteky">Preteky – závody</option></Select>
          <Input label="Název" name="name" placeholder="Pitztal SBX" required/>
          <div className="two-col"><Input label="Od" name="start" type="date"/><Input label="Do" name="end" type="date"/></div>
          <div className="two-col"><Input label="Počáteční záloha" name="advance" inputMode="decimal" defaultValue="0" required/><Select label="Měna" name="currency"><option>EUR</option><option>CZK</option><option>CHF</option></Select></div>
          <div className="input-label"><span>Trenér</span><div className="muted">{profile?.full_name||user.email} (aktuální účet)</div></div>
          <div className="input-label"><span>Vyber jezdce</span><div className="checks">{db.riders.length===0&&<span className="muted">Jezdce můžeš přidat v sekci Lidé.</span>}{db.riders.map(r=><label key={r.id}><input type="checkbox" name="riders" value={r.id}/>{r.full_name}</label>)}</div></div>
          <Button type="submit" disabled={busy}>{busy?'Ukládám…':'Vytvořit akci'}</Button>
        </form>
      </div>
    </div>}
    {editing&&<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(null)}}>
      <div className="modal"><div className="heading"><h2>Upravit doklad</h2><button onClick={()=>setEditing(null)}><X size={20}/></button></div>
        <form key={editing.id} onSubmit={saveExpense} className="grid-form">
          <Input label="Dodavatel" name="merchant" defaultValue={editing.merchant} placeholder="Např. Slovnaft"/>
          <div className="two-col"><Input label="Datum" name="date" type="date" defaultValue={editing.spent_on||today()}/><Input label="Částka" name="amount" defaultValue={String(editing.amount||'')} inputMode="decimal" required/></div>
          <Select label="Kategorie" name="category" defaultValue={editing.category}>{CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</Select>
          <Select label="Způsob platby" name="method" defaultValue={editing.payment_method}><option value="unknown">Není vybráno</option><option value="card">Kartou – vyžaduje potvrzení</option><option value="cash">Hotově</option></Select>
          <Input label="Poznámka" name="note" defaultValue={editing.note||''}/>
          <div className="muted smalltext">Bankovní potvrzení přiřadíš po uložení v seznamu dokladů.</div>
          <Button disabled={busy} type="submit"><Check size={17}/> Uložit změny</Button>
        </form>
      </div>
    </div>}
    {busy&&<div className="busy"><RefreshCw className="spin" size={18}/> Zpracovávám…</div>}
  </div>
}
function Auth(){
  const [register,setRegister]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  async function submit(e){
    e.preventDefault();setBusy(true);setError('');setMessage('');
    const fd=new FormData(e.currentTarget),email=String(fd.get('email')||''),password=String(fd.get('password')||'');
    const result=register?await sb.auth.signUp({email,password}):await sb.auth.signInWithPassword({email,password});
    if(result.error)setError(result.error.message);
    else if(register)setMessage('Účet vytvořen. Pokud máš zapnuté potvrzení e-mailu, ověř ho v doručené poště.');
    setBusy(false);
  }
  return <div className="auth-page"><div className="auth-card"><span className="brand-icon big"><MountainSnow size={35}/></span><h1>ZSL Expenses</h1><p>Vyúčtování soustředění a závodů</p>
    {error&&<div className="alert error">{error}</div>}{message&&<div className="alert success">{message}</div>}
    <form onSubmit={submit} className="grid-form"><Input label="E-mail" name="email" type="email" autoComplete="email" required/><Input label="Heslo" name="password" type="password" minLength="6" autoComplete={register?'new-password':'current-password'} required/>
      <Button type="submit" disabled={busy}>{register?'Vytvořit účet':'Přihlásit se'}</Button></form>
    <button className="text-link" onClick={()=>{setRegister(!register);setError('');setMessage('')}}>{register?'Mám účet – přihlásit se':'Nemám účet – registrovat se'}</button>
    <p className="privacy"><Lock size={14}/> Data a doklady jednotlivých trenérů jsou oddělené.</p>
  </div></div>
}
createRoot(document.getElementById('root')).render(<App/>);
