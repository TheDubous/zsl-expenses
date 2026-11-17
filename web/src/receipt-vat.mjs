/**
 * Tax-table classification shared by OCR parsing and arithmetic checking.
 * A per-rate VAT row is NOT the entire receipt total when multiple VAT
 * classes exist (e.g. 3.32 + 37.15 + 15.37 on a €55.84 supermarket bill).
 */
const moneyPattern=/(?:\d{1,3}(?:[ .\u00a0]\d{3})+|\d+)[,.]\d{2}(?!\d)/g;
function cents(raw){
 const compact=String(raw).replace(/[\s\u00a0]/g,'');
 const normalized=compact.includes(',')?compact.replace(/\./g,'').replace(',','.'):compact;
 const n=Number(normalized);
 return Number.isFinite(n)?Math.round(n*100):NaN;
}
export function vatAmounts(line){
 const normalized=String(line||'').replace(/(\d)\s+([,.])\s*(\d{2})(?!\d)/g,'$1$2$3');
 return [...normalized.matchAll(moneyPattern)].map(m=>cents(m[0]))
   .filter(n=>Number.isFinite(n)&&n>=0&&n<=10000000);
}
const headerPattern=/(?:netto[\s\S]{0,65}(?:u\s*st|mwst|vat|steuer)[\s\S]{0,65}brutto|z[aá]klad[\s\S]{0,65}dph[\s\S]{0,65}(?:spolu|suma|celkom)|excl\.?[\s\S]{0,65}(?:mwst|vat|dph)[\s\S]{0,65}incl\.?)/i;
function rateOf(line){
 const match=String(line).match(/(\d{1,2}(?:[,.]\d{1,2})?)\s*%/);
 if(!match)return null;
 const rate=Number(match[1].replace(',','.'));
 return rate>0&&rate<=30?rate:null;
}
export function analyzeVatTable(input){
 const lines=Array.isArray(input)?input:String(input||'').split(/\r?\n/);
 const rows=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i]||'';
  const values=vatAmounts(line);
  if(values.length<3)continue;
  const [net,tax,gross]=values.slice(-3);
  if(Math.abs(net+tax-gross)>1||!gross)continue;
  // Thermal receipts sometimes print the heading *below* the first row.
  const nearby=lines.slice(Math.max(0,i-5),Math.min(lines.length,i+5)).join(' ');
  if(!headerPattern.test(nearby))continue;
  rows.push({index:i,net,tax,gross,rate:rateOf(line),hasRateMarker:/%/.test(line)});
 }
 const distinctRates=new Set(rows.map(r=>r.rate).filter(v=>v!==null));
 const multiRate=distinctRates.size>=2;
 // Multi-rate receipts may have missing classes in an OCR crop. Sum only if
 // the calculated total matches a separately PRINTED grand total or payment
 // in this SAME OCR pass. An incomplete table cannot invent a grand total.
 const totalCents=rows.filter(r=>r.hasRateMarker).reduce((sum,r)=>sum+r.gross,0);
 const matchingPrinted=multiRate&&totalCents>0&&lines.some((line,i)=>{
   if(rows.some(r=>r.index===i))return false;
   return /(?:^|\b)(?:summe|suma|celkom|spolu|gesamt|total|paid|bezahlt|uhradene|zahlung\s+visa|kreditkarte|betrag\s+eur)\b/i.test(line)&&
     vatAmounts(line).some(v=>Math.abs(v-totalCents)<=1);
 });
 return {rows,multiRate,aggregate:matchingPrinted?totalCents:null};
}
