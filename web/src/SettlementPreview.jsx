import React,{useState} from 'react';
import {currency,expenseStatus,CATEGORIES,summarize} from './utils.mjs';
import {FileSpreadsheet,AlertCircle,CheckCircle2,ReceiptText} from 'lucide-react';

function Field({label,value,missing=false}) {
  return <div className="sheet-field"><span>{label}</span><strong className={missing?'field-missing':''}>{value||'—'}</strong></div>;
}
const money=(val,ccy)=>currency(val,ccy);
const dateTime=(day,time)=>[day,time].filter(Boolean).join(' ');
export default function SettlementPreview({event,trainer,riders=[],expenses=[],funding=[],onEditEvent}){
  const [sheet,setSheet]=useState('pokyn');
  const total=summarize(expenses,funding);
  const missing=[];
  if(!trainer?.name)missing.push('Jméno trenéra');
  if(!trainer?.address)missing.push('Trvalé bydliště trenéra');
  if(!trainer?.contact)missing.push('Telefon trenéra');
  if(!trainer?.iban)missing.push('IBAN trenéra');
  if(!trainer?.role)missing.push('Funkce trenéra');
  if(!trainer?.department)missing.push('Oddělení ZSL');
  if(!event?.startsOn||!event?.endsOn)missing.push('Začátek a konec cesty');
  if(!event?.location)missing.push('Místo konání');
  if(!event?.purpose)missing.push('Účel cesty');
  if(expenses.some(e=>expenseStatus(e)!=='Doklady kompletní'))missing.push('Neúplné doklady / bankovní potvrzení');

  const listed=[...expenses].sort((a,b)=>(a.spent_on||'').localeCompare(b.spent_on||''));
  const transport=listed.filter(e=>e.category==='travel');
  const fuels=listed.filter(e=>e.category==='fuel');
  const other=listed.filter(e=>!['travel','fuel'].includes(e.category));

  return <div className="stack">
    <div className="panel">
      <div className="heading"><h3><FileSpreadsheet size={19}/> Náhled vyúčtování ZSL</h3></div>
      <p className="muted">Zde vidíš data, která aplikace připravuje pro původní soubor <strong>ZSL – Cestovný príkaz</strong>. Jde o pracovní náhled podle originálních listů; <strong>přímý zápis do původního XLSX zatím není zapojený</strong>. Současný export vytváří ZIP a CSV.</p>
      <div className="sheet-tabs">
        <button className={sheet==='pokyn'?'selected':''} onClick={()=>setSheet('pokyn')}>s.1 – Pokyn</button>
        <button className={sheet==='vydavky'?'selected':''} onClick={()=>setSheet('vydavky')}>s.3 – Výdavky</button>
        <button className={sheet==='kontrola'?'selected':''} onClick={()=>setSheet('kontrola')}>Kontrola</button>
      </div>
    </div>
    {sheet==='pokyn'&&<div className="sheet-preview">
      <div className="sheet-bar">ZSL · CESTOVNÝ PRÍKAZ <span>strana 1</span></div>
      <h3>CESTOVNÝ PRÍKAZ</h3>
      <div className="sheet-section"><h4>Údaje vyúčtovateľa</h4>
        <div className="sheet-grid">
          <Field label="Priezvisko, meno, titul" value={[trainer?.title,trainer?.name].filter(Boolean).join(' ')} missing={!trainer?.name}/>
          <Field label="Funkcia" value={trainer?.role} missing={!trainer?.role}/>
          <Field label="Trvalé bydlisko" value={trainer?.address} missing={!trainer?.address}/>
          <Field label="Oddelenie ZSL" value={trainer?.department} missing={!trainer?.department}/>
          <Field label="Telefónny kontakt" value={trainer?.contact} missing={!trainer?.contact}/>
          <Field label="IBAN vyúčtovateľa" value={trainer?.iban} missing={!trainer?.iban}/>
        </div>
      </div>
      <div className="sheet-section"><h4>Pracovná cesta</h4>
        <div className="sheet-grid">
          <Field label="Začiatok (dátum, hodina)" value={dateTime(event?.startsOn,event?.startTime)}/>
          <Field label="Miesto odchodu" value={event?.startPlace}/>
          <Field label="Miesto konania / štát" value={[event?.location,event?.country].filter(Boolean).join(' / ')}/>
          <Field label="Účel cesty" value={event?.purpose||event?.kind}/>
          <Field label="Koniec (dátum, hodina)" value={dateTime(event?.endsOn,event?.endTime)}/>
          <Field label="Miesto návratu" value={event?.endPlace}/>
        </div>
      </div>
      <div className="sheet-section"><h4>CESTUJÚCI – športovci a tréneri</h4>
        <div className="sheet-people"><span>Vedúci výpravy</span><strong>{trainer?.name||'—'}</strong><span>Športovci</span><strong>{riders.length?riders.map(r=>r.name).join(', '):'—'}</strong></div>
      </div>
      <div className="sheet-section"><h4>Zúčtovanie</h4>
        <div className="sheet-grid">
          <Field label="Číslo zálohy" value={event?.advanceNumber}/>
          <Field label="Suma prijatých záloh" value={money(total.deposit,event.currency)}/>
          <Field label="Výdavky evidované" value={money(total.spent,event.currency)}/>
          <Field label="Zostáva / preplatok (orientačne)" value={money(total.remaining,event.currency)}/>
        </div>
      </div>
      <p className="sheet-footnote">Položky stravné, cestovné náhrady a oficiálne schválenie nepočítame. Podpis nadriadeného a kontrola sekretariátu ZSL zůstávají součástí originálního formuláře.</p>
    </div>}
    {sheet==='vydavky'&&<div className="sheet-preview">
      <div className="sheet-bar">ZSL · PREUKÁZANÉ CESTOVNÉ VÝDAVKY <span>strana 3</span></div>
      <h3>PREUKÁZANÉ CESTOVNÉ VÝDAVKY</h3>
      <p className="sheet-footnote">Položky jsou seřazené orientačně podle kategorie. Originální list rozlišuje cestovné, palivo vozidla ZSL, palivo soukromého vozidla a další typy náhrad. Pro přesné zařazení paliva bude potřeba ještě údaj o typu vozidla.</p>
      {[
        ['Cestovné / doprava',transport],
        ['Tankovanie a AdBlue',fuels],
        ['Ostatné doložené výdavky',other]
      ].map(([title,items])=><div className="sheet-section" key={title}>
        <h4>{title}</h4>
        <div className="sheet-table-scroll"><table className="sheet-table"><thead><tr><th>Č.</th><th>Dodávateľ</th><th>Dátum</th><th>Doklady</th><th>Suma</th></tr></thead><tbody>
        {items.length===0?<tr><td colSpan="5" className="sheet-empty">Žádné položky</td></tr>:items.map((e,i)=><tr key={e.id}><td>{i+1}.</td><td>{e.merchant||e.receipt_name||'Neurčeno'}</td><td>{e.spent_on||'—'}</td><td>{expenseStatus(e)}</td><td>{money(e.amount,event.currency)}</td></tr>)}
        </tbody><tfoot><tr><td colSpan="4">CELKOM</td><td>{money(items.reduce((a,b)=>a+Number(b.amount||0),0),event.currency)}</td></tr></tfoot></table></div>
      </div>)}
    </div>}
    {sheet==='kontrola'&&<div className="panel">
      <div className="heading"><h3><ReceiptText size={19}/> Připravenost podkladů</h3></div>
      <div className="counts"><div><strong>{expenses.length}</strong><span>Výdajů</span></div><div><strong>{total.incomplete}</strong><span>Neúplných</span></div><div><strong>{missing.length}</strong><span>Co doplnit</span></div></div>
      {missing.length===0?<div className="check-row"><CheckCircle2 color="#78e2bb" size={18}/> Běžné údaje jsou vyplněné. Formulář ZSL přesto potřebuje konečnou kontrolu.</div>:
      <div className="checklist">{missing.map(value=><div key={value} className="check-row"><AlertCircle size={17}/>{value}</div>)}</div>}
      <p className="muted">Některá pole původního Excelu vyžadují cestovní náhrady nebo dodatečné schválení; tato kontrola není účetní schválení.</p>
    </div>}
    <button className="btn secondary" onClick={onEditEvent}>Upravit údaje cesty a akce</button>
  </div>
}
