import {analyzeVatTable} from './receipt-vat.mjs';
// Deterministic, offline OCR interpretation. We retain alternative readings for human review.
const totalHints=/(?:^|\b)(?:celkom(?:\s*-\s*eft)?|spolu|suma|total|amount|k\s*uhrade|na\s*uhradu|zaplaten[ée]|uhradene|uhradené|gesamt\s*betrag|gesamtsumme|gesamt|(?:zw\.?\s*-?\s*)?summe|betrag|bezahlt|zahlung|eurocard|gesamtbetrag|paid|endbetrag)(?:\b|:)/i;
const penalized=/(?:dph|vat|tax|zaklad|základ|netto|base|jednotkov|vr[aá]ten[ée]|cash\s*back|wechselgeld|rueckgeld|rückgeld|bargeld|gegeben|rueckgabe|rabatt|z[ľl]ava|discount|zostatok|m[wvv]st|ust\.?|ersparnis|ersparniss|ersparn|gespart|sie\s+sparen|sparen\s+sie|nachlass|gutschein|savings?|your\s+savings?|vorteil|steueranteil|preis\s*\/\s*l|pro\s*liter|ak.tionsrabatt)/i;
const amountPattern=/(?:\d{1,3}(?:[ .\u00a0]\d{3})+|\d+)[,.]\d{2}(?!\d)/g;
const BRANDS=[
  ['Steinblock GmbH','steinblock'],
  ['Pitztaler Gletscherbahn','pitztalergletscherbahn'],
  ['Serways','serways'],
  ['INTERSPAR','interspar'],
  ['Slovnaft','slovnaft'],
  ['Gutmann','gutmann'],
  ['Orlen','orlen'],
  ['Shell','shell'],
  ['Hofer','hofer'],
  ['Lidl','lidl'],
  ['Billa','billa'],
  ['OMV','omv'],
  ['SPAR','spar']
];
export function compactText(value){
  return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/0/g,'o').replace(/1/g,'i').replace(/[^a-z\d]/g,'');
}
function editDistance(a,b,max=5){
  if(Math.abs(a.length-b.length)>max)return max+1;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const next=[i];
    let rowMin=next[0];
    for(let j=1;j<=b.length;j++){
      const v=Math.min(prev[j]+1,next[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
      next[j]=v;rowMin=Math.min(rowMin,v);
    }
    if(rowMin>max)return max+1;
    prev=next;
  }
  return prev[b.length];
}
function fuzzyContains(text,term){
  const max=term.length<6?0:term.length<10?1:term.length<16?2:3;
  if(text.includes(term))return 0;
  if(max===0||text.length<term.length-2)return null;
  // A small error allowance recovers split brand names and common OCR substitutions.
  let best=max+1;
  const start=Math.max(3,term.length-max),end=term.length+max;
  for(let i=0;i<text.length-start+1;i++){
    for(let len=start;len<=end&&i+len<=text.length;len++){
      const dist=editDistance(text.slice(i,i+len),term,max);
      if(dist<best)best=dist;
      if(best===0)return 0;
    }
  }
  return best<=max?best:null;
}
function parseNumber(value){
  const trimmed=value.replace(/[\s\u00a0]/g,'');
  const n=Number(trimmed.includes(',')?trimmed.replace(/\./g,'').replace(',','.'):trimmed);
  return Number.isFinite(n)?Math.round(n*100)/100:NaN;
}
function moneyCandidates(lines){
  const values=[];
  const vat=analyzeVatTable(lines);
  const vatRows=new Set(vat.rows.map(row=>row.index));
  const totalLabel=line=>{
    const compact=line.replace(/[\s:._-]+/g,'');
    // Dot-matrix printers space individual characters: G E S A M T BETRAG.
    return totalHints.test(line.normalize('NFKD').replace(/[\u0300-\u036f]/g,''))||
      /(?:gesamtbetrag|gesamtsumme|gesamt|zw\.?-?summe|summe|bezahlt|endbetrag|eurocard|total)(?:eur|euro|€|\d)/i.test(compact);
  };
  lines.forEach((original,index)=>{
    // OCR can mistake the last decimal zero for O or insert a space after the
    // decimal separator. Correct ONLY a two-character fractional part.
    let guessedFraction=false;
    const line=original.replace(/(\d[,.])\s*([0-9OoIl]{2})(?![\dA-Za-z])/g,
      (_,prefix,fraction)=>{
        if(/[OoIl]/.test(fraction))guessedFraction=true;
        return prefix+fraction.replace(/[Oo]/g,'0').replace(/[Il]/g,'1');
      });
    // Date fragments like "03.11.2026" must not become the price "3,11".
    // A folded/low-contrast print may put spaces around the separators.
    const withoutDates=line
      .replace(/\b\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*(?:20)?\d{2}\b/g,' ')
      .replace(/\b20\d{2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{1,2}\b/g,' ');
    if(!totalLabel(line)&&/^(?:datum|date|uhrzeit|transaktion|transaction|beleg\s*(?:nr)?|rechnungs\s*nr)\b/i.test(line))return;
    const matches=[...withoutDates.matchAll(amountPattern)];
    if(/\b\d{1,2}\.\d{1,2}\.20\d{2}\b/.test(line)&&!totalLabel(line))return;
    const prev=lines[index-1]||'';
    const explicitTotal=totalLabel(line);
    // "Kreditkarle MasterCard" is common on folded receipts: card network
    // and printed paid totals are evidence even if Kreditkarte is misspelled.
    const paymentLabel=/\b(?:eft|kreditkart\w*|kreditkarl\w*|eurocard|mastercard|visa|card\s*payment|kartenzahlung|bezahlt|zaplaten[eé]?|paid|uhradene|bankova\s+karta|zahlung\s+visa)\b/i;
    const cleanLabel=value=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
    const continuedPayment=/^(?:(?:EUR|EURO|€)\s*)?\d[\d\s.,]*(?:\s*(?:EUR|EURO|€))?\s*$/i.test(line)&&matches.length===1;
    const paidLine=paymentLabel.test(cleanLabel(line))||(continuedPayment&&paymentLabel.test(cleanLabel(prev)));
    const inheritedTotal=totalLabel(prev);
    // A tax breakdown often prints 'Gesamt: NETTO  USt  BRUTTO' with three
    // numbers on the next line. Only the rightmost BRUTTO is the paid total.
    const taxHeader=lines.slice(Math.max(0,index-3),index).join(' ');
    // Slovak VAT receipts print "Sadzby | Základ | DPH | Spolu" rather
    // than "Netto | USt | Brutto". Without this recognition the tax base
    // and VAT can be mistaken for two rival grand totals.
    const hasTaxColumns=/(?:netto[\s\S]{0,50}(?:u\s*st|mwst|vat|steuer)[\s\S]{0,50}brutto|z[aá]klad[\s\S]{0,50}dph[\s\S]{0,50}(?:spolu|suma|celkom)|excl[\s\S]{0,50}(?:mwst|vat|dph)[\s\S]{0,50}incl)/i.test(taxHeader);
    const taxSummary=matches.length>=3&&explicitTotal&&hasTaxColumns;
    // Some scans lose the "Gesamt" caption but still read the printed
    // Netto / USt / Brutto row. Its last 3 numbers must reconcile to cents;
    // this is stronger evidence than a random rightmost item price.
    const taxValues=matches.slice(-3).map(m=>parseNumber(m[0]));
    const reconcilesTax=taxValues.length===3&&taxValues.every(Number.isFinite)&&
      Math.abs(Math.round(taxValues[0]*100)+Math.round(taxValues[1]*100)-Math.round(taxValues[2]*100))<=1;
    // Only a single-rate VAT row can be the whole gross. Supermarket
    // multi-rate rows are individual tax-class subtotals, never grand totals.
    const taxRowGross=vatRows.has(index)&&!vat.multiRate&&reconcilesTax;
    const summaryColumns=matches.length>=2&&explicitTotal&&/\b(?:gesamt|total|spolu|suma|celkom)\b/i.test(line);
    // "Gesamt: 93,00 18,60 11160" has a damaged gross column with
    // missing decimal separator. 18,60 is VAT, NOT a new grand total.
    const damagedGrossColumn=summaryColumns&&matches.length>=2&&
      /\s\d{4,6}\s*$/.test(line)&&!/[,.]\d{2}\s*$/.test(line);
    // Even a damaged VAT row should not turn the base/tax components
    // into candidate payments merely because the column header says "Spolu".
    const taxColumnsUnreconciled=hasTaxColumns&&matches.length>=3&&!reconcilesTax;
    // In the real Slovnaft scan the line "Spolu 107.59 24 15 : 132 34"
    // lost two decimal separators. Do not promote its surviving base amount
    // to a total just because the line starts with "Spolu".
    const brokenTaxSummary=explicitTotal&&/\b(?:spolu|gesamt)\b/i.test(line)&&
      matches.length<3&&(line.match(/\d+/g)||[]).length>=3;
    const taxClassRow=vat.multiRate&&vatRows.has(index);
    // Even when OCR loses the Základ/DPH/Spolu column headings, an exact
    // NET + VAT = GROSS triple contains only ONE possible paid sum: the
    // rightmost amount. Never promote its tax base using inherited labels.
    const selected=(damagedGrossColumn||taxColumnsUnreconciled||brokenTaxSummary)?[]:
      (taxSummary||summaryColumns||taxRowGross||taxClassRow||reconcilesTax)?[matches[matches.length-1]]:matches;
    for(const m of selected){
      const amount=parseNumber(m[0]);
      if(!Number.isFinite(amount)||amount<=0||amount>100000)continue;
      // The Netto/USt/Brutto header is not a discount or a tax-only row;
      // a reconciled Brutto value on the following line is legitimate.
      const isBad=penalized.test(line)||(penalized.test(prev)&&!explicitTotal&&!paidLine&&!taxRowGross);
      if(isBad)continue;
      const isTotal=explicitTotal||(inheritedTotal&&!taxClassRow)||paidLine||taxRowGross;
      const hasCurrency=/(?:\bEUR\b|\bEURO\b|\bCZK\b|\bKČ\b|\bCHF\b|€)/i.test(line);
      const score=(explicitTotal?16:paidLine?12:taxRowGross?11:inheritedTotal?11:0)+
        (hasCurrency?3:0)+(matches.length===1?2:0)+(index>lines.length/3?1:0)+(taxSummary?3:0)-
        // A guessed OCR digit is weaker than an independently printed payment.
        (guessedFraction?8:0);
      values.push({amount,score,line,lineNumber:index,isTotal,isPaid:explicitTotal||paidLine,
        explicitTotal:explicitTotal||taxRowGross,paidLine,taxSummary,taxRowGross});
    }
  });
  const counts=new Map();
  values.forEach(v=>counts.set(v.amount,(counts.get(v.amount)||0)+1));
  return values.map(v=>({...v,score:v.score+Math.min(counts.get(v.amount)||0,4)}))
    .sort((a,b)=>b.score-a.score||b.amount-a.amount);
}
function validDate(y,m,d){
  const date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?
    [y,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-'):null;
}
function findDate(text){
  let m=text.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
  if(m)return validDate(+m[1],+m[2],+m[3]);
  m=text.match(/\b(0?[1-9]|[12]\d|3[01])\s*[./-]\s*(0?[1-9]|1[0-2])\s*[./-]\s*(20\d{2}|\d{2})\b/);
  if(m)return validDate(m[3].length===2?2000+(+m[3]):+m[3],+m[2],+m[1]);
  // German/English printed month: "6 Nov 26 16:30".
  const months={jan:1,feb:2,mar:3,apr:4,may:5,mai:5,jun:6,jul:7,aug:8,sep:9,oct:10,okt:10,nov:11,dec:12,dez:12};
  m=text.match(/\b(0?[1-9]|[12]\d|3[01])\s+(jan|feb|mar|apr|may|mai|jun|jul|aug|sep|oct|okt|nov|dec|dez)[a-z]*\s+(20\d{2}|\d{2})\b/i);
  if(m)return validDate(m[3].length===2?2000+Number(m[3]):+m[3],months[m[2].slice(0,3).toLowerCase()],+m[1]);
  return null;
}
function merchantSuggestions(lines){
  const header=lines.slice(0,Math.min(20,lines.length)).join(' ');
  const compact=compactText(header).slice(0,2200);
  const suggestions=[];
  for(const [name,term] of BRANDS){
    const distance=fuzzyContains(compact,term);
    if(distance!==null)suggestions.push({name,score:50-distance*7,source:'known-brand'});
  }
  const excluded=/(?:potvrdenka|zákazn[ií]ka|zakaznika|pokladn[ií]|fakt[uú]ra|invoice|receipt|kassenbon|rechnung|beleg|date|datum|čas|zeit|termin[aá]l|summe|suma|total|dph|vat|tax|betrag|spolu|celkom|visa|mastercard|card|karta|iban|telef[oó]n|ecv|d[ií]c|dph|i[cč]o|č[ií]slo|č\.?|www|http|eur|euro|e-mail|registr|polo[zž]ka|kusov|mno[zž]stv|diesel|adblue|nafta|tankovanie|hotovost)/i;
  for(const [i,raw] of lines.slice(0,12).entries()){
    const line=raw.replace(/[|_]+/g,' ').replace(/\s+/g,' ').trim();
    const letters=line.match(/\p{L}/gu)?.length||0;
    if(letters<5||line.length<5||line.length>70||/^\d/.test(line)||excluded.test(line))continue;
    if((line.match(/\d/g)||[]).length>Math.max(2,letters/3))continue;
    if(line.includes('€')||/[0-9][,.][0-9]{2}/.test(line))continue;
    let score=13+Math.max(0,12-i*2);
    if(/^[^a-záäčďéěíĺľňóôřšťúůýž]*[\p{Lu}][\p{Lu}\s&.'-]*$/u.test(line))score+=5;
    if(/\b(?:s\.r\.o\.|a\.s\.|gmbh|e\.u\.|kg|ag|spol)\b/i.test(line))score+=5;
    if(line.split(/\s+/).length>=2)score+=2;
    suggestions.push({name:line,score,source:'header-text'});
  }
  // INTERSPAR contains SPAR; avoid presenting them as two competing shops.
  const specificKnown=suggestions.filter(v=>v.source==='known-brand');
  const filtered=suggestions.filter(v=>!(v.source==='known-brand'&&specificKnown.some(other=>
    other.name!==v.name&&compactText(other.name).includes(compactText(v.name))&&compactText(other.name).length>compactText(v.name).length)));
  const unique=new Map();
  for(const v of filtered){
    const key=compactText(v.name);
    if(!key)continue;
    const prev=unique.get(key);
    if(!prev||prev.score<v.score)unique.set(key,v);
  }
  return [...unique.values()].sort((a,b)=>b.score-a.score).slice(0,6);
}
function categoryOf(text){
  if(/\b(ad\s*blue|adblue|diesel|nafta|benz[ií]n|benzin|kraftstoff|fuel|tankovanie|tankstelle|čerpac[íi]|phm|super\s*95|super\s*98)\b/i.test(text))return 'fuel';
  if(/\b(skipass|ski\s*pass|skipasy|skipassy|skipas|piste|pista|lanovka|gletscherbahn|liftkarte|liftpass|bergbahn|rennstrecke|startovn[eé]|startgeld|nenngeld|streckenmiete|pistenmiete|pisten\s*geb(?:uhr|uehr|uehren)?|pistengeb|(?:pron[aá]jem|pren[aá]jem|pren[aá]jom)\s*trat[iěe])\b/i.test(text))return 'resort';
  if(/\b(hotel|pension|pensi[oó]n|ubytov|zimmer|unterkunft|booking)\b/i.test(text))return 'lodging';
  if(/\b(restaur|restaurant|grocery|market|interspar|spar|lidl|hofer|billa|potravin|supermarket|bistro|strava)\b/i.test(text))return 'food';
  if(/\b(taxi|vlak|train|autobus|bus|ticket|mýto|m[yý]to|parking|parkovn|dálni[cč]ní|vignette|vignett[e]?)\b/i.test(text))return 'travel';
  return 'other';
}
function methodOf(text){
  if(/\b(?:eft|bankov[aá]\s*karta|platba\s*kart|payment\s*card|kartou|credit\s*card|debit\s*card|kreditkarte|eurocard|visa|mastercard|kontaktlos|contactless|kartenzahlung)\b/i.test(text))return 'card';
  if(/\b(?:hotovos[tť]|cash\s*payment|bar\s*zahlung|barzahlung|bargeld|bar\s*bezahlt)\b/i.test(text))return 'cash';
  return 'unknown';
}
export function parseReceiptText(text){
  const source=String(text||'');
  const lines=source.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const amounts=moneyCandidates(lines);
  const merchants=merchantSuggestions(lines);
  // A single OCR pass can contain BOTH "Gesamt 615,00" and
  // "Kreditkarte 615,00". Keep evidence from both lines when collapsing
  // equal monetary values; otherwise payment proof is silently discarded.
  const grouped=new Map();
  for(const candidate of amounts){
    const existing=grouped.get(candidate.amount);
    if(!existing){
      grouped.set(candidate.amount,{...candidate});
    }else{
      existing.isTotal=!!(existing.isTotal||candidate.isTotal);
      existing.isPaid=!!(existing.isPaid||candidate.isPaid);
      existing.explicitTotal=!!(existing.explicitTotal||candidate.explicitTotal);
      existing.paidLine=!!(existing.paidLine||candidate.paidLine);
      existing.taxSummary=!!(existing.taxSummary||candidate.taxSummary);
      existing.taxRowGross=!!(existing.taxRowGross||candidate.taxRowGross);
    }
  }
  const uniqueAmounts=[...grouped.values()].sort((a,b)=>b.score-a.score||b.amount-a.amount);
  const best=uniqueAmounts[0]||null;
  return {
    amount:best?.score>=3?best.amount:null,
    confidence:best?.score>=16?'high':best?.score>=7?'medium':'low',
    amountCandidates:uniqueAmounts.slice(0,8),
    merchant:merchants[0]?.score>=22?merchants[0].name:null,
    merchantCandidates:merchants,
    merchantConfidence:merchants[0]?.score>=40?'high':merchants[0]?.score>=27?'medium':'low',
    spent_on:findDate(source),category:categoryOf(source),payment_method:methodOf(source),rawText:source.slice(0,8000)
  };
}
