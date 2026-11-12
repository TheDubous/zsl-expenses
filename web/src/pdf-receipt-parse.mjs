import {parseReceiptText} from './receipt-parse.mjs';

// PDF tickets and their final tax invoice frequently repeat a price.
// We only select a final total, never add all displayed amounts.
const TOTAL=/\b(celkem|spolu|celkov[aá]\s*cena|k\s*uhrad[eě]|total|gesamtbetrag|endbetrag|summe)\s*[:\-]?\s*(\d{1,3}(?:[ \u00a0]\d{3})+|\d{1,8})(?:[.,](\d{2}))?\s*(K[čc]|CZK|EUR|EURO|€|CHF)?/i;
const PRICE=/\b(?:Cena|Price|Kone[cč]n[aá]\s*cena)\s*[:\-]?\s*(\d{1,3}(?:[ \u00a0]\d{3})+|\d{1,8})(?:[.,](\d{2}))?\s*(K[čc]|CZK|EUR|EURO|€|CHF)\b/gi;
function price(number,decimal){
 const n=Number(String(number||'').replace(/[ \u00a0]/g,'')+'.'+String(decimal||'00'));
 return Number.isFinite(n)&&n>0&&n<1e7?Math.round(n*100)/100:null;
}
function unit(text){
 if(/(?:\bCZK\b|\bK[Čč]\b)/i.test(text||''))return 'CZK';
 if(/(?:\bEUR\b|\bEURO\b|€)/i.test(text||''))return 'EUR';
 if(/\bCHF\b/i.test(text||''))return 'CHF';
 return null;
}
function isoDate(value){
 const m=String(value||'').match(/^(\d{1,2})[./-](\d{1,2})[./-](20\d{2})$/);
 if(!m)return null;
 const iso=[m[3],m[2].padStart(2,'0'),m[1].padStart(2,'0')].join('-');
 const d=new Date(iso+'T00:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:null;
}
function isInvoice(text){
 return /(?:da[nň]ov[yý]\s*doklad|tax\s*invoice|rechnung|fakt[uú]ra|invoice)/i.test(text);
}
function invoiceCurrency(text){
 if(/(?:Cena\s*v[cč]\.?\s*DPH[\s\S]{0,55}\(\s*K[čc]\s*\)|cena[\s\S]{0,50}bez\s*DPH[\s\S]{0,65}K[čc])/i.test(text))return 'CZK';
 if(/(?:\(\s*EUR\s*\)|\bEUR\s+v[cč]\.?\s*DPH\b)/i.test(text))return 'EUR';
 return unit(text);
}
function extractTotals(lines,pageIndex,invoice){
 const values=[];
 for(const line of lines){
  const m=line.match(TOTAL);
  if(m){
   const amount=price(m[2],m[3]);
   if(amount)values.push({amount,currency:unit(m[4]||line),pageIndex,
    kind:'grand-total',score:(invoice?100:40)+(m[4]?8:0),label:line.slice(0,160)});
  }
  for(const p of line.matchAll(PRICE)){
   const amount=price(p[1],p[2]),currency=unit(p[3]);
   if(amount&&currency)values.push({amount,currency,pageIndex,
    kind:'individual-price',score:10,label:line.slice(0,160)});
  }
 }
 return values;
}
function merchantName(full,fallback){
 if(/Česk[eé]\s*dr[aá]hy\s*,?\s*a\.?\s*s\.?/i.test(full))return 'České dráhy, a.s.';
 return fallback?.merchant||null;
}
export function parsePdfReceiptPages(pages){
 const texts=(Array.isArray(pages)?pages:[]).map(p=>String(typeof p==='string'?p:p?.text||'').slice(0,60000));
 const all=texts.join('\n\n--- STRANA PDF ---\n\n');
 const structured=texts.map(t=>t.split(/\r?\n/).map(s=>s.trim()).filter(Boolean));
 const invoices=texts.map(isInvoice);
 const totals=structured.flatMap((lines,i)=>extractTotals(lines,i,invoices[i]));
 const invoicesOnly=totals.filter(x=>x.kind==='grand-total'&&invoices[x.pageIndex]);
 const realTotals=totals.filter(x=>x.kind==='grand-total');
 const pick=invoicesOnly.length?invoicesOnly:realTotals.length?realTotals:totals;
 const selected=[...pick].sort((a,b)=>b.score-a.score||b.pageIndex-a.pageIndex)[0]||null;
 const selectedPage=selected?.pageIndex??-1;
 const fromPage=selectedPage>=0?texts[selectedPage]:'';
 const currency=selected?.currency||
   (selectedPage>=0&&invoices[selectedPage]?invoiceCurrency(fromPage):null)||
   unit(fromPage);
 const fall=parseReceiptText(all);
 const merchant=merchantName(all,fall);
 // A train ticket's validity or departure date is not the purchase date.
 const paid=all.match(/(?:Datum\s+vystaven[ií]\s*\/\s*datum\s+platby|datum\s+platby|datum\s+vystaven[ií]\s*\/\s*DUZP|date\s+of\s+payment|paid\s+on)\s*:\s*(\d{1,2}[./-]\d{1,2}[./-]20\d{2})/i);
 const spent_on=isoDate(paid?.[1])||fall.spent_on;
 const railway=/(?:j[ií]zdenka|fahr[sc]hein|rezervace|reservierung|vlak|train\s*ticket|railway\s*ticket)/i.test(all);
 const itemLabel=railway?(/rezervace|reservierung/i.test(all)?'Vlaková jízdenka + rezervace':'Vlaková jízdenka'):null;
 const payment_method=/(?:KARTOU\s*\/\s*CC|\bkartou\b|platba\s*kartou|mastercard|visa|card\s*payment)/i.test(all)?'card':fall.payment_method;
 const amount=selected?.amount??null;
 const conflicting=invoicesOnly.some(x=>x.currency===currency&&x.amount!==amount);
 const trustworthy=!!(amount&&currency&&merchant&&spent_on&&!conflicting);
 return {
  amount,sourceAmount:amount,sourceCurrency:currency,merchant,spent_on,
  category:railway?'travel':fall.category,payment_method,itemLabel,
  confidence:trustworthy?'high':amount?'medium':'low',
  merchantConfidence:merchant?'high':'low',
  amountCandidates:totals.sort((a,b)=>b.score-a.score).slice(0,16),
  merchantCandidates:merchant?[{name:merchant,score:50,source:'pdf-text'}]:fall.merchantCandidates||[],
  rawText:all.slice(0,20000),
  scannedPasses:texts.map((_,i)=>'PDF text strana '+(i+1)),
  pdfPages:texts.length,pdfHasInvoice:invoices.some(Boolean),
  pdfTotalPage:selectedPage>=0?selectedPage+1:null,
  ocrLanguage:'pdf-text',ocrMode:'pdf-text',
  needsReview:!trustworthy
 };
}
