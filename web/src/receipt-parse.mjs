// Offline receipt text parser. Tesseract OCR is performed separately in the browser.
const totalHints=/(?:^|\b)(?:celkom|spolu|suma|total|amount|k\s*uhrade|na\s*uhradu|zaplaten[ée]|uhradene|uhradené|gesamtbetrag|summe|betrag|paid)(?:\b|:)/i;
const penalized=/(?:dph|vat|tax|zaklad|základ|netto|base|jednotkov|vr[aá]ten[ée]|cash\s*back|rabatt|z[ľl]ava|discount|zostatok)/i;
const amountPattern=/(?:\d{1,3}(?:[ .\u00a0]\d{3})+|\d+)[,.]\d{2}(?!\d)/g;
function numberOf(value){
 const t=value.replace(/[\s\u00a0]/g,'');
 const n=Number(t.includes(',')?t.replace(/\./g,'').replace(',','.'):t);
 return Number.isFinite(n)?Math.round(n*100)/100:NaN;
}
function candidatesOf(lines){
 const items=[];
 lines.forEach((line,index)=>{
  const found=[...line.matchAll(amountPattern)];
  for(const match of found){
   const amount=numberOf(match[0]);if(!Number.isFinite(amount)||amount<=0||amount>100000)continue;
   const total=totalHints.test((lines[index-1]||'')+' '+line);
   const penalty=penalized.test(line)&&!totalHints.test(line);
   const currency=/\b(?:EUR|EURO|CZK|KČ|CHF)\b|€/i.test(line);
   const score=(total?11:0)+(currency?3:0)-(penalty?14:0)+(found.length===1?2:0)+(index>lines.length/3?1:0);
   items.push({amount,score,line,lineNumber:index});
  }
 });
 const count=new Map();for(const c of items)count.set(c.amount,(count.get(c.amount)||0)+1);
 return items.map(c=>({...c,score:c.score+Math.min(count.get(c.amount)||0,4)})).sort((a,b)=>b.score-a.score||b.amount-a.amount);
}
function validDate(y,m,d){const date=new Date(Date.UTC(y,m-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?[y,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-'):null}
function dateOf(text){
 let m=text.match(/\b(20\d{2})[-\/.](0?[1-9]|1[0-2])[-\/.](0?[1-9]|[12]\d|3[01])\b/);
 if(m)return validDate(+m[1],+m[2],+m[3]);
 m=text.match(/\b(0?[1-9]|[12]\d|3[01])\s*[.\/-]\s*(0?[1-9]|1[0-2])\s*[.\/-]\s*(20\d{2}|\d{2})\b/);
 if(m)return validDate(m[3].length===2?2000+(+m[3]):+m[3],+m[2],+m[1]);
 return null;
}
function merchantOf(lines,text){
 const known=[[/\bSLOVNAFT\b/i,'Slovnaft'],[/\bINTERSPAR\b/i,'INTERSPAR'],[/\bSPAR\b/i,'SPAR'],[/\bGUTMANN\b/i,'Gutmann'],[/PITZTALER\s*GLETSCHERBAHN/i,'Pitztaler Gletscherbahn'],[/\bSHELL\b/i,'Shell'],[/\bOMV\b/i,'OMV'],[/\bORLEN\b/i,'Orlen'],[/\bLIDL\b/i,'Lidl'],[/\bBILLA\b/i,'Billa'],[/\bHOFER\b/i,'Hofer']];
 for(const [re,name] of known)if(re.test(text))return name;
 for(const raw of lines.slice(0,16)){
  const line=raw.trim();
  if(line.length<4||line.length>65||/\b(?:datum|date|čas|cas|potvrdenka|terminal|card|cislo|číslo|receipt|pokladn|prevadzk|prevádz|tel|objedn|fakt|euro|iban|platba|doklad|i[cč]o|di[cč])\b/i.test(line)||/^\d/.test(line))continue;
  if(/^[\p{Lu}\d\s.&'-]{5,}$/u.test(line)&&/\p{Lu}/u.test(line))return line.replace(/\s+/g,' ').slice(0,60);
 }
 return null;
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
 if(/\b(?:bankov[aá]\s*karta|platba\s*kart|payment\s*card|kartou|credit\s*card|debit\s*card|visa|mastercard|kontaktlos)\b/i.test(text))return 'card';
 if(/\b(?:hotovos[tť]|cash\s*payment|bar\s*zahlung|barzahlung)\b/i.test(text))return 'cash';
 return 'unknown';
}
export function parseReceiptText(text){
 const s=String(text||''),lines=s.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const c=candidatesOf(lines),best=c[0]||null;
 return {amount:best?.score>=3?best.amount:null,confidence:best?.score>=15?'high':best?.score>=5?'medium':'low',
  amountCandidates:c.filter((v,i,a)=>a.findIndex(z=>z.amount===v.amount)===i).slice(0,8),
  merchant:merchantOf(lines,s),spent_on:dateOf(s),category:categoryOf(s),payment_method:methodOf(s),
  rawText:s.slice(0,8000)};
}
