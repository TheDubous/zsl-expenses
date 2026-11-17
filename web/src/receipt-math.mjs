/** Arithmetic cross-checks from the receipt itself. No vendor-specific prices. */
const moneyPattern=/(?:\d{1,3}(?:[ .\u00a0]\d{3})+|\d+)[,.]\d{2}(?!\d)/g;
const parse=v=>Math.round(Number(v.replace(/[\s\u00a0]/g,'').replace(/\./g,'').replace(',','.'))*100);
const amounts=line=>[...line.matchAll(moneyPattern)].map(m=>parse(m[0]))
  .filter(n=>Number.isFinite(n)&&n>0&&n<=10000000);
const near=(a,b)=>Math.abs(a-b)<=1;

/** Evidence is only a suggested amount until independently verified by user. */
export function receiptMathEvidence(text){
 const lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const out=[];
 const add=(cents,kind,line)=>{
   if(cents>0&&cents<=10000000&&!out.some(x=>x.amount===cents/100&&x.kind===kind))
     out.push({amount:cents/100,kind,line:line.slice(0,180)});
 };
 for(let i=0;i<lines.length;i++){
   const line=lines[i],values=amounts(line);
   const heading=lines.slice(Math.max(0,i-3),i).join(' ');
   // A line after Netto / USt / Brutto contains 3 separate values.
   if(values.length>=3&&
       /netto[\s\S]{0,60}(?:u\s*st|mwst|vat|steuer)[\s\S]{0,60}brutto/i.test(heading)){
     const [net,tax,gross]=values.slice(-3);
     if(near(net+tax,gross))add(gross,'vat-columns',line);
   }
   // Also handle fuel receipts with only "MWST B 20% VON 106,48 21,30";
   // frequent OCR misreadings MUST, MIST and MVST are permitted only when
   // both the VAT base and tax agree with the printed rate.
   if(/\b(?:m[wuvi]st|u\s*st|mehrwertsteuer|steuer|vat|dph)\b/i.test(line)&&
       /\b(?:von|of|z|aus)\b/i.test(line)&&values.length>=2){
     const m=line.match(/(\d{1,2})(?:[,.]00)?\s*%/);
     if(m){
       const rate=Number(m[1]),[base,tax]=values.slice(-2);
       if(rate>0&&rate<=30&&near(Math.round(base*rate/100),tax))
         add(base+tax,'vat-rate',line);
     }
   }
 }
 // Add purchased line totals only within an explicit item-price table.
 // Requires two rows whose quantity x unit price agrees with row price.
 for(let i=0;i<lines.length;i++){
   const header=lines[i];
   if(!/(?:\bstk\b|\bmenge\b|\bqty\b|\bmnozstvo\b)/i.test(header)||
       !/(?:\bpreis\b|\bprice\b|\bep\b|\bgesamt\b)/i.test(header))continue;
   let total=0,count=0;
   for(const line of lines.slice(i+1,i+26)){
     if(/(?:\bgesamt\b|\bbezahlt\b|\bkreditkarte\b|\bmastercard\b|\bvisa\b|\bnetto\b|\bbrutto\b|\bsteuersatz\b|\bmwst\b|\bust\b|\bcash\b|\beft\b|\bsumme\b)/i.test(line))break;
     const prices=amounts(line);
     if(prices.length<2)continue;
     // Column row: "1 SCT PF+ 2,00 2,00", "4 502 12,80 51,20 1"
     const q=line.match(/^\D{0,8}(\d{1,2})\s+(?=\w|\d)/);
     if(!q)continue;
     const unit=prices[prices.length-2],row=prices[prices.length-1];
     if(near(unit*Number(q[1]),row)){total+=row;count++}
   }
   if(count>=2)add(total,'line-items',header);
 }
 return out;
}
