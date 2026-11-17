import {receiptItemLabel} from './zsl-template-map.mjs';

const norm=value=>String(value||'').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,' ').trim();
const moneyCents=value=>Math.round(Number(value||0)*100);

// Same printed receipt number with the same vendor/date is a strong indication
// of a repeated scan. Never confuse a card-terminal transaction reference
// with the printed sales receipt number.
export function printedReceiptNumber(expense={}){
 const raw=String(expense.ocr?.rawText||'');
 const patterns=[
  /\bverkaufsbeleg\s*(?:nr\.?|nummer|no\.?)\s*[:.#-]?\s*(\d{4,12})\b/i,
  /\b(?:rechnungs?|kassenbeleg|beleg|bon)\s*[- ]?(?:nr\.?|nummer|no\.?)\s*[:.#-]?\s*(\d{4,12})\b/i,
  /\b(?:porad\.?\s*cislo\s*dokladu|cislo\s*dokladu|číslo\s*dokladu)\s*[:.#-]?\s*(\d{4,12})\b/i
 ];
 for(const re of patterns){
  const match=raw.match(re);
  if(match)return match[1].replace(/^0+(?=\d)/,'');
 }
 return null;
}

/**
 * Identify suspicious duplicate expenses for preflight display.
 * Never silently delete, merge or exclude a receipt: two genuine purchases
 * can share date, vendor, item and price, so a human must compare originals.
 * An explicit "separate purchases" confirmation suppresses only weak
 * lookalike warnings, never a matching original sales-receipt number.
 */
export function suspiciousReceiptGroups(expenses=[]){
 const byKey=new Map();
 for(const e of expenses){
  if(!(Number(e.amount)>0)||!e.spent_on||!norm(e.merchant))continue;
  const label=receiptItemLabel(e);
  const key=[norm(e.merchant),e.spent_on,moneyCents(e.amount),norm(label)].join('|');
  if(!byKey.has(key))byKey.set(key,[]);
  byKey.get(key).push(e);
 }
 const out=[];
 for(const list of byKey.values()){
  if(list.length<2)continue;
  // Avoid flagging clearly different invoices which happen to have the
  // same item, price and date.
  const groups=new Map();
  const numbered=list.map(e=>({e,number:printedReceiptNumber(e)}));
  const duplicatesNumbered=new Set();
  for(const {e,number} of numbered){
   if(!number)continue;
   if(!groups.has(number))groups.set(number,[]);
   groups.get(number).push(e);
  }
  for(const [number,records] of groups){
   if(records.length<2)continue;
   out.push({ids:records.map(e=>e.id),merchant:records[0].merchant,
      date:records[0].spent_on,amount:Number(records[0].amount),
      label:receiptItemLabel(records[0]),strong:true,
      reason:'Shodné číslo pokladního dokladu '+number});
   records.forEach(e=>duplicatesNumbered.add(e.id));
  }
  const others=numbered.filter(({e})=>!duplicatesNumbered.has(e.id));
  // Two *different* printed invoice numbers represent different purchases.
  if(others.length<2)continue;
  const known=[...new Set(others.map(x=>x.number).filter(Boolean))];
  if(known.length===others.length)continue;
  // A user can explicitly verify that matching-looking purchases are separate,
  // while preserving both entries, photos and bank confirmations.
  const unreviewed=others.filter(({e})=>!e.distinctPurchaseConfirmed);
  if(unreviewed.length<2)continue;
  out.push({ids:unreviewed.map(({e})=>e.id),merchant:unreviewed[0].e.merchant,
    date:unreviewed[0].e.spent_on,amount:Number(unreviewed[0].e.amount),
    label:receiptItemLabel(unreviewed[0].e),strong:false,
    reason:'Shodné datum, dodavatel, položka a částka – porovnej původní doklady'});
 }
 return out.sort((a,b)=>a.date.localeCompare(b.date)||a.merchant.localeCompare(b.merchant));
}
