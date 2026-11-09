import {expenseStatus,safeFilename} from './utils.mjs';
import {makeZslReport,ZSL_SHEET_TITLES,NOT_COMPUTED} from './zsl-report.mjs';
import {downloadBlob} from './archive.js';

const NAVY='#173E6B',MUTED='#5E6E81',LIGHT='#E9F1F9',EDGE='#CFD9E5',INK='#15243B';
const money=(value,code='EUR')=>
  value==null?NOT_COMPUTED:new Intl.NumberFormat('sk-SK',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value||0))+' '+code;
const date=v=>v?String(v):'—';
const asText=v=>String(v==null||v===''?'—':v);
const textRow=(label,value)=>[{text:label,style:'fieldLabel'},{text:asText(value),style:'fieldValue'}];

function title(sheet,subtitle,pageBreak=false){
  return [
    {text:sheet.title,style:'sheetTitle',pageBreak:pageBreak?'before':undefined},
    {text:sheet.sheet+' · '+subtitle,style:'sheetMeta'}
  ];
}
function fields(pairs){
  const body=[];
  for(let i=0;i<pairs.length;i+=2){
    const a=pairs[i]||['',''];
    const b=pairs[i+1]||['',''];
    body.push([
      {text:a[0],style:'fieldLabel',fillColor:LIGHT},
      {text:asText(a[1]),style:'fieldValue'},
      {text:b[0],style:'fieldLabel',fillColor:LIGHT},
      {text:asText(b[1]),style:'fieldValue'}
    ]);
  }
  return {table:{widths:[94,'*',94,'*'],body},layout:'lightHorizontalLines',margin:[0,4,0,14]};
}
function p(text){return {text,style:'note',margin:[0,5,0,9]};}
function h(text){return {text,style:'sectionTitle',margin:[0,11,0,6]};}
function table(headers,rows,widths){
  const mapped=rows.length?rows:[[...headers.map((_,i)=>i===0?'Bez evidovaných položiek':'')]];
  return {table:{
      headerRows:1,keepWithHeaderRows:1,widths:widths||Array.from(headers,()=>'*'),
      body:[headers.map(text=>({text,style:'tableHead'})),...mapped.map((row,i)=>row.map((x,j)=>({
        text:asText(x===''?'':x),style:'tableCell',fillColor:i%2?'#F3F7FB':'#FFFFFF',alignment:j===row.length-1?'right':'left'
      })))]
    },layout:{hLineColor:()=>EDGE,vLineColor:()=>EDGE,hLineWidth:()=>.55,vLineWidth:()=>.3,
      paddingLeft:()=>6,paddingRight:()=>6,paddingTop:()=>5,paddingBottom:()=>5},
    margin:[0,3,0,10]};
}
const notCalculated=section=>[
  h(section),
  p('NEVYPOČÍTANÉ. Podklady pro stravné a cestovné náhrady zatiaľ nie sú v aplikácii evidované. Nezamieňajte prázdne hodnoty za 0 EUR.')
];

export function makePdfDefinition(report,{createdAt=new Date()}={}){
  const {event,trainer,riders,expenses,funding,financial,settlement,sections,currency:ccy,missing}=report;
  const content=[];
  const push=(...items)=>content.push(...items);
  const advance=financial.deposit;
  const tripFrom=[event?.startsOn,event?.startTime].filter(Boolean).join(' / ');
  const tripTo=[event?.endsOn,event?.endTime].filter(Boolean).join(' / ');

  // s.1 - pokyn
  push(...title(ZSL_SHEET_TITLES[0],'pracovný náhľad'));
  push({text:'KONTROLNÝ PODKLAD - NIE JE ORIGINÁLNY FORMULÁR ZSL',style:'warning',margin:[0,0,0,11]});
  push(h('Údaje vyúčtovateľa'));
  push(fields([
    ['Priezvisko, meno, titul',[trainer?.title,trainer?.name].filter(Boolean).join(' ')],
    ['Funkcia',trainer?.role],['Trvalé bydlisko',trainer?.address],
    ['Oddelenie ZSL',trainer?.department],
    ['Telefónny kontakt na vyúčtovateľa',trainer?.contact],
    ['IBAN vyúčtovateľa',trainer?.iban]
  ]));
  push(h('Pracovná cesta'));
  push(fields([
    ['Začiatok pracovnej cesty',tripFrom],['Miesto odchodu',event?.startPlace],
    ['Miesto konania/Štát',[event?.location,event?.country].filter(Boolean).join(' / ')],
    ['Účel cesty',event?.purpose||event?.kind],
    ['Koniec pracovnej cesty',tripTo],['Miesto návratu',event?.endPlace]
  ]));
  push(h('CESTUJÚCI:'));
  push(fields([['Vedúci výpravy',trainer?.name],['Športovec',riders.map(x=>x.name).join(', ')]]));
  push(h('Zúčtovanie oprávnených výdavkov'));
  push(table(['Položka podľa s.1 - pokyn','Zatiaľ evidovaná suma'],
    settlement.map(s=>[s.label,money(s.amount,ccy)]),['*',132]));
  push(fields([['Číslo zálohy',event?.advanceNumber],['Suma zálohy v EUR',ccy==='EUR'?money(advance,ccy):'Prepočet na EUR nie je vypočítaný']]));
  push(p('Doplatok / Preplatok je len orientačný rozdiel medzi prijatými zálohami, vratkami a evidovanými výdavkami. ZSL nároky a schválenie sa musia overiť podľa originálu.'));
  push(p('Podpis: —   |   SÚHLAS NADRIADENÉHO S PRACOVNOU CESTOU: —   |   SEKRETARIÁT ZSL: —'));

  // s.3 - výdavky
  push(...title(ZSL_SHEET_TITLES[1],'preukázané doklady evidované v aplikácii',true));
  push({text:'NÁHRADA PREUKÁZANÝCH CESTOVNÝCH VÝDAVKOV',style:'sectionTitle'});
  push(p('Členenie nižšie používa názvy z pôvodnej tabuľky ZSL. Suma znamená evidovaný doklad, nie automaticky schválený nárok. Vozidlo a výdavky treba správne zaradiť.'));
  for(const section of sections){
    push(h(section.label));
    if(['private_car','company_car','zsl_car','unassigned'].includes(section.id))
      push({text:section.id==='unassigned'?'Typ vozidla pri tankovaní ešte nie je určený.':'Továrenská značka vozidla, EČV vozidla a jazdy nie sú v aplikácii úplne vyplnené.',style:'subtle',margin:[0,0,0,4]});
    const basic=section.expenses.map((x,i)=>({
      num:String(i+1)+'.',
      name:x.merchant||x.receipt_name||'Neurčené',
      details:x.vehicleDetails||'NEVYPLNENÉ',
      description:[x.merchant,x.note].filter(Boolean).join(' – ')||x.receipt_name||'—',
      amount:money(x.amount,ccy),
      euro:ccy==='EUR'?money(x.amount,'EUR'):NOT_COMPUTED,
      foreign:ccy==='EUR'?'—':money(x.amount,ccy),
      state:expenseStatus(x)
    }));
    if(section.id==='transport'){
      push(table(['Poradové číslo dokladu','Dodávateľ','Druh prepravy','Suma v cudzej mene','Suma v EUR'],
        basic.map(x=>[x.num,x.name,'NEVYPLNENÉ',x.foreign,x.euro]),[41,'*',100,76,76]));
    }else if(['private_car','company_car','zsl_car'].includes(section.id)){
      push(table(['Poradové číslo dokladu','Továrenská značka vozidla, EČV vozidla','Suma dokladu za tankovanie v cudzej mene','Suma dokladu za tankovanie v EUR','Doklady'],
        basic.map(x=>[x.num,x.details,x.foreign,x.euro,x.state]),[40,'*',96,95,78]));
    }else if(section.id==='lodging'||section.id==='other'){
      const lodgingSection=section.id==='lodging';
      push(table(['Poradové číslo dokladu',lodgingSection?'Popis výdavku a množstvo':'Názov výdavku a množstvo',
        'Suma dokladu v cudzej menej','Suma dokladu v EUR',
        lodgingSection?'Uplatňovaná čiastka za ubytovanie v EUR':'Uplatňovaná čiastka za výdavok v EUR'],
        basic.map(x=>[x.num,x.description,x.foreign,x.euro,NOT_COMPUTED]),[40,'*',80,72,105]));
    }else{
      push(table(['Poradové číslo dokladu','Dodávateľ / názov výdavku','Dátum','Suma dokladu','Doklady'],
        section.expenses.map((x,i)=>[String(i+1)+'.',x.merchant||x.receipt_name||'Neurčené',date(x.spent_on),money(x.amount,ccy),expenseStatus(x)]),
        [36,'*',67,82,90]));
    }
    push({text:'CELKOM: '+money(section.total,ccy),bold:true,alignment:'right',fontSize:9,margin:[0,0,0,6]});
  }
  push(h('CELKOVÁ SUMA DOKLADOV'));
  push({text:money(financial.spent,ccy),style:'totalNumber'});
  push(p('Upozornenie: položky stravy či mimozmluvné náklady môžu vyžadovať posúdenie Sekretariátu ZSL. Neoznačujeme ich automaticky za oprávnené.'));

  // s.4 (domestic)
  push(...title(ZSL_SHEET_TITLES[2],'nevyplnené nárokové položky',true));
  push(...notCalculated('Cestovné náhrady - tuzemsko'));
  push(fields([['Meno a priezvisko',trainer?.name],['Typ vzťahu ku ZSL',NOT_COMPUTED],['Typ náhrady',NOT_COMPUTED],['Stravné',NOT_COMPUTED]]));
  push(table(['Dátum','od','do','Raňajky','Obed','Večera','Stravné'],[],[70,46,46,58,46,48,'*']));

  // s.4 (foreign)
  push(...title(ZSL_SHEET_TITLES[3],'nevyplnené nárokové položky',true));
  push(...notCalculated('Cestovné náhrady - zahraničie'));
  push(fields([['Krajina',event?.country],['Mena',ccy],['Sadzba základného stravného',NOT_COMPUTED],['Stravné',NOT_COMPUTED]]));
  push(table(['Dátum','Krajina','od','do','Poskytnutá strava','Stravné'],[],[58,83,50,50,'*',85]));

  // s.5 (travel log)
  push(...title(ZSL_SHEET_TITLES[4],'doplňujúce podklady',true));
  push(p('Kniha jázd sa zatiaľ v ZSL Expenses nevypĺňa. Nemožno vymyslieť stav tachometra, EČV ani náklady na amortizáciu.'));
  push(fields([
    ['Obdobie',[event?.startsOn,event?.endsOn].filter(Boolean).join(' - ')],
    ['Vozidlo',NOT_COMPUTED],['EČV',NOT_COMPUTED],
    ['Priemerná spotreba (l/100 km)',NOT_COMPUTED],
    ['Stav tachometra na začiatku (km)',NOT_COMPUTED],
    ['Majiteľ MV',NOT_COMPUTED]
  ]));
  push(table(['Dátum','Miesto začiatok - koniec','Hodina od - do','Účel jazdy','Počet prejdených km'],[],[64,'*',84,'*',77]));

  // s.6 (trip report)
  push(...title(ZSL_SHEET_TITLES[5],'prezenčná listina a zhodnotenie',true));
  push(h('SPRÁVA Z PRACOVNEJ CESTY'));
  push({text:event?.reportText||'Správa z pracovnej cesty nebola doposiaľ doplnená.',margin:[0,3,0,15],fontSize:10});
  push(fields([['Vypracoval',trainer?.name],['dňa',date(event?.endsOn)]]));
  push(h('Prezenčná listina zúčastnených'));
  push(table(['P.č.','Meno a priezvisko','Funkcia','Poznámka'],
    [[1,trainer?.name||'—',trainer?.role||'Vedúci výpravy',''],
      ...riders.map((r,i)=>[i+2,r.name,'Športovec',''])],[35,'*',110,'*']));

  // Verification appendix (all original receipts + payments, no images; ZIP holds originals).
  push({text:'KONTROLA DOKLADOV A PRÍLOH',style:'sheetTitle',pageBreak:'before'});
  push({text:'Táto kontrolná príloha nie je samostatným listom pôvodného formulára ZSL.',style:'sheetMeta'});
  push(table(['Č.','Dátum','Dodávateľ','Úhrada','Suma','Stav dokladov'],expenses.map((x,i)=>[
    i+1,x.spent_on||'—',x.merchant||x.receipt_name||'—',
    x.payment_method==='card'?'Karta':x.payment_method==='cash'?'Hotovosť':'Neurčené',
    money(x.amount,ccy),expenseStatus(x)
  ]),[25,64,'*',60,74,96]));
  push(h('Zálohy a vrátené peniaze'));
  push(table(['Dátum','Druh pohybu','Suma','Poznámka'],funding.map(f=>[
    f.occurredOn||'—',f.kind==='advance'?'Záloha':'Vrátenie',money(f.amount,ccy),f.note||'—'
  ]),[78,95,85,'*']));
  push(h('Položky na overenie ('+missing.length+')'));
  if(missing.length)push({ul:missing.map(x=>({text:x,margin:[0,2,0,2]})),style:'listItem'});
  else push(p('Všetky základné polia v aplikácii sú vyplnené. To však neznamená schválenie cestovného príkazu.'));
  push(p('Fotografie účteniek a jednotlivé bankové potvrdenia sa do tohto PDF neprikladajú. Sú uložené v lokálnej aplikácii a možno ich stiahnuť cez ZIP dokladov.'));

  return {
    pageSize:'A4',
    pageMargins:[37,58,37,52],
    info:{title:'ZSL - kontrolný výkaz - '+(event?.name||''),author:'ZSL Expenses (lokálna aplikácia)',subject:'Kontrolný náhľad údajov podľa formulára ZSL'},
    watermark:{text:'KONTROLNÝ NÁHĽAD',color:'#DDE6F2',opacity:0.13,bold:true,angle:-32},
    header:{text:'ZSL Expenses  |  KONTROLNÝ NÁHĽAD • NIE OFICIÁLNY FORMULÁR',margin:[37,22,37,0],fontSize:8,color:MUTED},
    footer:(current,total)=>({columns:[
      {text:'Údaje len z tohto zariadenia  |  '+createdAt.toISOString().slice(0,10),alignment:'left'},
      {text:'Strana '+current+' / '+total,alignment:'right'}
    ],margin:[37,15,37,0],fontSize:8,color:MUTED}),
    content,
    defaultStyle:{font:'Roboto',fontSize:9,color:INK,lineHeight:1.15},
    styles:{
      sheetTitle:{fontSize:17,bold:true,color:NAVY,margin:[0,2,0,3]},
      sheetMeta:{fontSize:8,color:MUTED,margin:[0,0,0,13]},
      sectionTitle:{fontSize:10,bold:true,color:NAVY},
      fieldLabel:{fontSize:7.7,bold:true,color:'#344963'},
      fieldValue:{fontSize:8.8,color:INK},
      tableHead:{fontSize:7.8,bold:true,fillColor:NAVY,color:'#FFFFFF'},
      tableCell:{fontSize:8},
      note:{fontSize:8,color:MUTED},
      subtle:{fontSize:7.6,color:MUTED},
      warning:{fontSize:8.5,color:'#A74630',bold:true},
      totalNumber:{fontSize:14,bold:true,color:NAVY,alignment:'right'},
      listItem:{fontSize:8.5,color:INK}
    }
  };
}

/**
 * pdfmake is loaded only when the user explicitly requests a PDF.
 * The bundled Roboto virtual filesystem supports Czech and Slovak glyphs.
 */
export async function generatePdfBlob(report,{createdAt=new Date()}={}){
  const [core,fontPackage]=await Promise.all([
    import('pdfmake/build/pdfmake.js'),import('pdfmake/build/vfs_fonts.js')
  ]);
  const pdfMake=core.default||core;
  const fonts=fontPackage.default||fontPackage;
  if(typeof pdfMake.addVirtualFileSystem==='function')pdfMake.addVirtualFileSystem(fonts.pdfMake?.vfs||fonts);
  else pdfMake.vfs=fonts.pdfMake?.vfs||fonts;
  const def=makePdfDefinition(report,{createdAt});
  return new Promise((resolve,reject)=>{
    try{pdfMake.createPdf(def).getBlob(blob=>{
      if(!blob||blob.size<100)reject(new Error('PDF sa nepodarilo vytvoriť.'));
      else resolve(blob);
    });}catch(error){reject(error)}
  });
}
export async function downloadZslPdf(input){
  const report=makeZslReport(input);
  const pdf=await generatePdfBlob(report);
  const name='ZSL_KONTROLNY_VYKAZ_'+safeFilename(report.event?.name||'vyuctovanie')+'.pdf';
  downloadBlob(pdf,name);
  return {filename:name,size:pdf.size,report};
}
