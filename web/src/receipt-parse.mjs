// Deterministic, offline OCR interpretation. We retain alternative readings for human review.
const totalHints=/(?:^|\b)(?:celkom|spolu|suma|total|amount|k\s*uhrade|na\s*uhradu|zaplaten[ée]|uhradene|uhradené|gesamtbetrag|gesamtsumme|summe|betrag|paid|endbetrag)(?:\b|:)/i;
const penalized=/(?:dph|vat|tax|zaklad|základ|netto|base|jednotkov|vr[aá]ten[ée]|cash\s*back|rabatt|z[ľl]ava|discount|zostatok|m[wvv]st|ust\.?)/i;
const amountPattern=/(?:\d{1,3}(?:[ .\u00a0]\d{3})+|\d+)[,.]\d{2}(?!\d)/g;
const BRANDS=[
  ['Pitztaler Gletscherbahn','pitztalergletscherbahn'],
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
  lines.forEach((line,index)=>{
    const matches=[...line.matchAll(amountPattern)];
    if(/\b\d{1,2}\.\d{1,2}\.20\d{2}\b/.test(line)&&!totalHints.test(line))return;
    for(const m of matches){
      const amount=parseNumber(m[0]);
      if(!Number.isFinite(amount)||amount<=0||amount>100000)continue;
      const isTotal=totalHints.test(line)||totalHints.test(lines[index-1]||'');
      const isBad=penalized.test(line)&&!totalHints.test(line);
      const hasCurrency=/(?:\bEUR\b|\bEURO\b|\bCZK\b|\bKČ\b|\bCHF\b|€)/i.test(line);
      const score=(isTotal?12:0)+(hasCurrency?3:0)-(isBad?14:0)+(matches.length===1?2:0)+(index>lines.length/3?1:0);
      values.push({amount,score,line,lineNumber:index});
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
  if(/\b(adblue|diesel|nafta|benz[ií]n|benzin|kraftstoff|fuel|tankovanie|tankstelle|čerpac[íi]|phm)\b/i.test(text))return 'fuel';
  if(/\b(skipass|ski\s*pass|skipas|piste|pista|lanovka|gletscherbahn|liftkarte|liftpass|bergbahn|rennstrecke)\b/i.test(text))return 'resort';
  if(/\b(hotel|pension|pensi[oó]n|ubytov|zimmer|unterkunft|booking)\b/i.test(text))return 'lodging';
  if(/\b(restaur|restaurant|grocery|market|interspar|spar|lidl|hofer|billa|potravin|supermarket|bistro|strava)\b/i.test(text))return 'food';
  if(/\b(taxi|vlak|train|autobus|bus|ticket|mýto|m[yý]to|parking|parkovn|dálni[cč]ní|vignette)\b/i.test(text))return 'travel';
  return 'other';
}
function methodOf(text){
  if(/\b(?:bankov[aá]\s*karta|platba\s*kart|payment\s*card|kartou|credit\s*card|debit\s*card|visa|mastercard|kontaktlos|kartenzahlung)\b/i.test(text))return 'card';
  if(/\b(?:hotovos[tť]|cash\s*payment|bar\s*zahlung|barzahlung)\b/i.test(text))return 'cash';
  return 'unknown';
}
export function parseReceiptText(text){
  const source=String(text||'');
  const lines=source.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const amounts=moneyCandidates(lines);
  const merchants=merchantSuggestions(lines);
  const best=amounts[0]||null;
  return {
    amount:best?.score>=3?best.amount:null,
    confidence:best?.score>=16?'high':best?.score>=7?'medium':'low',
    amountCandidates:amounts.filter((v,i,a)=>a.findIndex(z=>z.amount===v.amount)===i).slice(0,8),
    merchant:merchants[0]?.score>=22?merchants[0].name:null,
    merchantCandidates:merchants,
    merchantConfidence:merchants[0]?.score>=40?'high':merchants[0]?.score>=27?'medium':'low',
    spent_on:findDate(source),category:categoryOf(source),payment_method:methodOf(source),rawText:source.slice(0,8000)
  };
}
