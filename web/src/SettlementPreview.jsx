import React,{useState} from 'react';
import {currency,expenseStatus} from './utils.mjs';
import {makeZslReport,ZSL_SHEET_TITLES,NOT_COMPUTED} from './zsl-report.mjs';
import {FileSpreadsheet,AlertCircle,CheckCircle2,ReceiptText,Download,Users} from 'lucide-react';

function Field({label,value,missing=false}){
  return <div className="sheet-field"><span>{label}</span><strong className={missing?'field-missing':''}>{value===null||value===undefined||value===''?'—':value}</strong></div>;
}
const money=(value,ccy)=>value==null?NOT_COMPUTED:currency(value,ccy);
const dateTime=(day,time)=>[day,time].filter(Boolean).join(' / ');
const titles=ZSL_SHEET_TITLES;

export default function SettlementPreview({event,trainer,riders=[],expenses=[],funding=[],onEditEvent,onDownloadPdf,busy=false}){
  const [sheet,setSheet]=useState('pokyn');
  const report=makeZslReport({event,trainer,riders,expenses,funding});
  const {financial,settlement,sections,missing}=report;
  return <div className="stack">
    <div className="panel">
      <div className="heading"><h3><FileSpreadsheet size={19}/> Náhľad výkazu podľa ZSL</h3></div>
      <p className="muted">Náhled používá <strong>přesné názvy listů a oddílů z původní tabulky ZSL</strong>. Jde o kontrolní zobrazení zaznamenaných údajů, ne o hotový schválený formulář. Částky stravného a výpočty cestovních náhrad zatím nejsou implementované.</p>
      <button className="btn" disabled={busy} onClick={onDownloadPdf}><Download size={17}/> Stáhnout PDF celého výkazu</button>
      <p className="muted smalltext">PDF obsahuje všechny části s.1, s.3, s.4, s.5 a s.6, seznam dokladů a upozornění. Originální fotografie a potvrzení se dál exportují v samostatném ZIPu.</p>
      <div className="sheet-tabs">
        {[...titles,{id:'kontrola',sheet:'Kontrola',title:'Kontrola dokladov'}].map(item=><button key={item.id} className={sheet===item.id?'selected':''} onClick={()=>setSheet(item.id)}>{item.sheet}</button>)}
      </div>
    </div>

    {sheet==='pokyn'&&<div className="sheet-preview">
      <div className="sheet-bar">ZSL · CESTOVNÝ PRÍKAZ <span>strana 1</span></div>
      <h3>CESTOVNÝ PRÍKAZ</h3>
      <div className="sheet-section"><h4>Údaje vyúčtovateľa</h4><div className="sheet-grid">
        <Field label="Priezvisko, meno, titul" value={[trainer?.title,trainer?.name].filter(Boolean).join(' ')} missing={!trainer?.name}/>
        <Field label="Funkcia" value={trainer?.role} missing={!trainer?.role}/>
        <Field label="Trvalé bydlisko" value={trainer?.address} missing={!trainer?.address}/>
        <Field label="Oddelenie ZSL" value={trainer?.department} missing={!trainer?.department}/>
        <Field label="Telefónny kontakt na vyúčtovateľa" value={trainer?.contact} missing={!trainer?.contact}/>
        <Field label="IBAN vyúčtovateľa" value={trainer?.iban} missing={!trainer?.iban}/>
      </div></div>
      <div className="sheet-section"><h4>Pracovná cesta</h4><div className="sheet-grid">
        <Field label="Začiatok pracovnej cesty" value={dateTime(event?.startsOn,event?.startTime)}/>
        <Field label="Miesto odchodu" value={event?.startPlace}/>
        <Field label="Miesto konania/Štát" value={[event?.location,event?.country].filter(Boolean).join(' / ')}/>
        <Field label="Účel cesty" value={event?.purpose||event?.kind}/>
        <Field label="Koniec pracovnej cesty" value={dateTime(event?.endsOn,event?.endTime)}/>
        <Field label="Miesto návratu" value={event?.endPlace}/>
      </div></div>
      <div className="sheet-section"><h4>CESTUJÚCI:</h4>
        <div className="sheet-people"><span>Vedúci výpravy</span><strong>{trainer?.name||'—'}</strong>
        <span>Športovec</span><strong>{riders.length?riders.map(r=>r.name).join(', '):'—'}</strong></div>
      </div>
      <div className="sheet-section"><h4>Zúčtovanie oprávnených výdavkov</h4>
        <div className="sheet-table-scroll">
          <table className="sheet-table zsl-summary"><thead><tr><th>Položka podľa s.1 – pokyn</th><th>Kontrolná suma</th></tr></thead>
          <tbody>{settlement.map(row=><tr key={row.id}><td>{row.label}</td><td className={row.amount==null?'sheet-empty':''}>{money(row.amount,event.currency)}</td></tr>)}</tbody></table>
        </div>
        <div className="sheet-grid">
          <Field label="Číslo zálohy" value={event?.advanceNumber}/>
          <Field label="Suma zálohy v EUR" value={event?.currency==='EUR'?money(financial.deposit,event.currency):'Prepočet na EUR nevypočítaný'}/>
        </div>
      </div>
      <p className="sheet-footnote">Názvy položek jsou podle originálu. Hodnoty jsou jen předběžná evidence dokladů, nikoli výše uznaných náhrad. „Doplatok / Preplatok“ čeká na kontrolu Sekretariátu ZSL.</p>
    </div>}

    {sheet==='vydavky'&&<div className="sheet-preview">
      <div className="sheet-bar">ZSL · PREUKÁZANÉ CESTOVNÉ VÝDAVKY <span>strana 3</span></div>
      <h3>PREUKÁZANÉ CESTOVNÉ VÝDAVKY</h3>
      <p className="sheet-footnote">Členění oddílů odpovídá originálu. Každý výdaj je zobrazen podle aktuálního zařazení; palivo bez zvoleného typu vozidla zůstává nezařazené.</p>
      {sections.map(section=><div className="sheet-section" key={section.id}>
        <h4>{section.label}</h4>
        {section.id==='unassigned'&&section.expenses.length>0&&<p className="sheet-footnote">Doplň druh vozidla v detailu účtenky, jinak se nedá správně umístit do výkazu ZSL.</p>}
        <div className="sheet-table-scroll"><table className="sheet-table">
          <thead><tr><th>Poradové číslo dokladu</th><th>Dodávateľ / názov výdavku</th><th>Dátum</th><th>Doklady</th><th>Suma dokladu</th></tr></thead>
          <tbody>{section.expenses.length===0?<tr><td colSpan="5" className="sheet-empty">Bez evidovaných položiek</td></tr>:
            section.expenses.map((expense,i)=><tr key={expense.id}><td>{i+1}.</td><td>{expense.merchant||expense.receipt_name||'Neurčené'}{expense.vehicleDetails&&<small> {expense.vehicleDetails}</small>}</td><td>{expense.spent_on||'—'}</td><td>{expenseStatus(expense)}</td><td>{money(expense.amount,event.currency)}</td></tr>)}
          </tbody><tfoot><tr><td colSpan="4">CELKOM:</td><td>{money(section.total,event.currency)}</td></tr></tfoot></table></div>
      </div>)}
      <div className="sheet-section"><h4>CELKOVÁ SUMA DOKLADOV</h4><strong>{money(financial.spent,event.currency)}</strong></div>
    </div>}

    {(sheet==='tuzemsko'||sheet==='zahranicie')&&<div className="sheet-preview">
      <div className="sheet-bar">ZSL · {sheet==='tuzemsko'?'TUZEMSKO':'ZAHRANIČIE'}</div>
      <h3>{sheet==='tuzemsko'?titles[2].title:titles[3].title}</h3>
      <div className="sheet-section"><h4>Nevyplnené nárokové položky</h4><div className="sheet-grid">
        <Field label="Meno a priezvisko" value={trainer?.name}/>
        <Field label="Typ vzťahu ku ZSL" value={NOT_COMPUTED}/>
        <Field label="Typ náhrady" value={NOT_COMPUTED}/>
        <Field label="Stravné" value={NOT_COMPUTED}/>
        {sheet==='zahranicie'&&<><Field label="Krajina" value={event.country}/><Field label="Sadzba základného stravného" value={NOT_COMPUTED}/></>}
      </div></div>
      <p className="sheet-footnote">Nezadané stravné ani diety nejsou nula. Originální formulář vyžaduje údaje o jídle, času a právně správné sazby, které aplikace ještě nepočítá.</p>
    </div>}

    {sheet==='jazdy'&&<div className="sheet-preview">
      <div className="sheet-bar">ZSL · KNIHA JÁZD</div><h3>KNIHA JÁZD</h3>
      <div className="sheet-section"><h4>Údaje vozidla</h4><div className="sheet-grid">
        <Field label="Obdobie" value={[event?.startsOn,event?.endsOn].filter(Boolean).join(' – ')}/>
        <Field label="Vozidlo" value={NOT_COMPUTED}/>
        <Field label="EČV" value={NOT_COMPUTED}/>
        <Field label="Priemerná spotreba (l/100 km)" value={NOT_COMPUTED}/>
        <Field label="Stav tachometra na začiatku (km)" value={NOT_COMPUTED}/>
        <Field label="Majiteľ MV" value={NOT_COMPUTED}/>
      </div></div><p className="sheet-footnote">Kniha jázd se v současné aplikaci ještě nevyplňuje. Žádné kilometry ani amortizaci automaticky nedopočítáváme.</p>
    </div>}

    {sheet==='sprava'&&<div className="sheet-preview">
      <div className="sheet-bar">ZSL · SPRÁVA Z PRACOVNEJ CESTY</div><h3>SPRÁVA Z PRACOVNEJ CESTY</h3>
      <div className="sheet-section"><h4>Vypracoval</h4><div className="sheet-grid">
        <Field label="Vypracoval" value={trainer?.name}/><Field label="dňa" value={event?.endsOn}/>
      </div><div className="report-text-preview">{event?.reportText||'Správa z pracovnej cesty dosud nebyla doplněna.'}</div></div>
      <div className="sheet-section"><h4>Prezenčná listina zúčastnených</h4>
        <div className="sheet-table-scroll"><table className="sheet-table"><thead><tr><th>P.č.</th><th>Meno a priezvisko</th><th>Funkcia</th><th>Poznámka</th></tr></thead>
        <tbody>{[[trainer?.name,trainer?.role||'Vedúci výpravy'],...riders.map(r=>[r.name,'Športovec'])].map(([name,role],i)=><tr key={i}><td>{i+1}</td><td>{name||'—'}</td><td>{role}</td><td>—</td></tr>)}</tbody></table></div>
      </div>
    </div>}

    {sheet==='kontrola'&&<div className="panel">
      <div className="heading"><h3><ReceiptText size={19}/> Připravenost podkladů</h3></div>
      <div className="counts"><div><strong>{financial.count}</strong><span>Výdajů</span></div><div><strong>{financial.incomplete}</strong><span>Neúplných</span></div><div><strong>{missing.length}</strong><span>Co doplnit</span></div></div>
      {missing.length===0?<div className="check-row"><CheckCircle2 color="#78e2bb" size={18}/> Běžné údaje jsou vyplněné, formulář ale potřebuje konečnou kontrolu.</div>:
        <div className="checklist">{missing.map((value,i)=><div key={i} className="check-row"><AlertCircle size={17}/>{value}</div>)}</div>}
      <p className="muted">Kontrola není účetní schválení. V náhledu PDF budou nevyplněné nárokové položky viditelně označené.</p>
    </div>}

    <div className="preview-actions">
      <button className="btn secondary" onClick={onEditEvent}>Upravit údaje cesty a akce</button>
      <button className="btn" disabled={busy} onClick={onDownloadPdf}><Download size={17}/> Stáhnout celý výkaz PDF</button>
    </div>
  </div>;
}
