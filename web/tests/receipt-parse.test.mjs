import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseReceiptText} from '../src/receipt-parse.mjs';
import {receiptItemLabel} from '../src/zsl-template-map.mjs';
test('Slovnaft with repeated sum, unit price and VAT',()=>{
 const t='POTVRDENKA PRE ZAKAZNIKA\nSuma: 132.34\nSLOVNAFT, a.s.\n02.11.2026 10:06:32\nEVO Diesel\n65.810 L 2.011 EUR/L 132.34\nSUMA: 132.34 EUR\nZaklad 107.59 DPH 24.75\nSpolu: 132.34 EUR\nPlatba: BANKOVA KARTA';
 const x=parseReceiptText(t);assert.equal(x.amount,132.34);assert.equal(x.merchant,'Slovnaft');assert.equal(x.category,'fuel');assert.equal(x.spent_on,'2026-11-02');assert.equal(x.payment_method,'card');
});
test('VAT is not final price when total is present',()=>{
 const x=parseReceiptText('GUTMANN\nDatum: 03.11.2026\nDiesel 111,78\nMwSt 20,00\nGesamtbetrag 127,78 EUR');
 assert.equal(x.amount,127.78);assert.equal(x.merchant,'Gutmann');assert.equal(x.spent_on,'2026-11-03');
});
test('thousands and euro date',()=>{
 const x=parseReceiptText('PITZTALER GLETSCHERBAHN\nPiste fee\nCELKOM: 1 265,00 EUR\n03.11.2026');
 assert.equal(x.amount,1265);assert.equal(x.category,'resort');
});
test('invalid date and empty OCR',()=>{
 assert.equal(parseReceiptText('Datum 31.02.2026').spent_on,null);
 assert.equal(parseReceiptText('').amount,null);
});

test('vendor with OCR letter separation and one typo is recovered',()=>{
 const a=parseReceiptText('03.11.2026\nPITZTALER GLETSCHER BAHN\nLIFT PASS\nGesamtbetrag 615,00 EUR');
 assert.equal(a.merchant,'Pitztaler Gletscherbahn');
 const b=parseReceiptText('GUTM4NN\nDiesel\nGESAMTBETRAG 127,78 EUR');
 assert.equal(b.merchant,'Gutmann');
});
test('unrecognized supplier yields alternatives instead of pretending certainty',()=>{
 const x=parseReceiptText('KASSENBON\nZAHLUNG\nBERGHAUS SONNE GmbH\n03.11.2026\nSUMME 28,90 EUR');
 assert.ok(x.merchantCandidates.some(z=>/berghaus sonne/i.test(z.name)));
});

test('German SUMME outranks Ihre Ersparnis immediately below it',()=>{
 const x=parseReceiptText('SPAR SUPERMARKT\nSUMME: 87,43 EUR\nIhre Ersparnis: 12,50 EUR\nKartenzahlung');
 assert.equal(x.amount,87.43);
 assert.ok(!x.amountCandidates.some(x=>x.amount===12.5));
});
test('sum and savings may each span two lines',()=>{
 const x=parseReceiptText('KASSENBON\nSumme\n79,90 EUR\nIhre Ersparnis\n25,10 EUR');
 assert.equal(x.amount,79.9);
 assert.ok(!x.amountCandidates.some(x=>x.amount===25.1));
});
test('only savings amount is not silently interpreted as spent',()=>{
 const x=parseReceiptText('Ihre Ersparnis 17,30 EUR');
 assert.equal(x.amount,null);
});

test('IMG_7834 thermal receipt German spaced labels and repeated payment',()=>{
 const x=parseReceiptText('GUTMANN GMBH\nDISK TANKSTELLE\nUNTERDORF 2\n6473 WENNS\n03.11.2026 14:42\nMENGE SUMME FUR\nDIESEL 58,24L 127,78\nSTEUERANTEIL 21,30 EUR\nPREIS/L 2,194 EUR\nG E S A M T BETRAG EUR: 127,78\nEUROCARD 127,78\nMASTERCARD CONTACTLESS\nMWST GESAMT EUR 21,30');
 assert.equal(x.merchant,'Gutmann');
 assert.equal(x.amount,127.78);
 assert.equal(x.category,'fuel');
 assert.equal(x.payment_method,'card');
 assert.equal(x.spent_on,'2026-11-03');
 assert.equal(x.amountCandidates[0].amount,127.78);
 assert.equal(x.amountCandidates.some(c=>c.amount===21.3),false);
});
test('spaced German grand total without visible payment line',()=>{
 const x=parseReceiptText('GUTMANN\nG E S A M T B E T R A G  EUR\n127,78\nSTEUERANTEIL\n21,30 EUR');
 assert.equal(x.amount,127.78);
});

test('race entry fee, slope rental and AdBlue classify to right broad expense group',()=>{
 assert.equal(parseReceiptText('STARTGELD / Startovne 90,00 EUR').category,'resort');
 assert.equal(parseReceiptText('Streckenmiete 300,00 EUR').category,'resort');
 assert.equal(parseReceiptText('AD BLUE 45,00 EUR').category,'fuel');
 assert.equal(parseReceiptText('Pronájem trati 300,00 EUR').category,'resort');
 assert.equal(parseReceiptText('Skipasy 100,00 EUR').category,'resort');
});

const SAMPLE_THERMAL_RECEIPTS=[
 {id:'IMG_8113.jpeg',name:'Pitztaler Gletscherbahn',
  text:'Pitztaler Gletscherbahn GmbH&Co KG\nMittelberg 103\nDatum: 03.11.2026 08:37\nVerkaufsbeleg Nr. 27511\nSCT Kind 613,00 613,00\nSCT PF+ 2,00 2,00\nKreditkarte MasterCard 615,00\nGesamt EUR 615,00\nNettobetrag 559,09\nEnthaltene MwSt 10% 55,91',
  amount:615,merchant:'Pitztaler Gletscherbahn',category:'resort',method:'card',date:'2026-11-03',label:'SCT Kind'},
 {id:'IMG_8114.jpeg',name:'Gutmann diesel',
  text:'GUTMANN GMBH\nDISK TANKSTELLE\n03.11.2026 14:42\nBESCHREIBUNG MENGE SUMME FÜR\nZP01 DIESEL 58,24L 127,78\nSTEUERANTEIL 21,30 EUR\nPREIS/L 2,194 EUR\nG E S A M T BETRAG EUR: 127,78\nEUROCARD 127,78\nMASTERCARD CONTACTLESS\nMWST GESAMT EUR 21,30',
  amount:127.78,merchant:'Gutmann',category:'fuel',method:'card',date:'2026-11-03',label:'Diesel'},
 {id:'IMG_8115.jpeg',name:'Serways A10 vignette',
  text:'Serways\nRastanlage Inntal West\nITM Handelsgesellschaft mbH\nRech. 10374898\n6 Nov 26 16:30\nAüsser Haus\nVignette A10T KFZ bis 3,5 12,80 E\nZw.-Summe 12,80€\nBezahlt 12,80€\nWechselgeld 0,20€\nSteuerpfl. Summe 0,00% 12,80 E\nSteuer 0,00% 0,00 E\nNetto 0,00% 12,80 E\nBargeld 13,00€',
  amount:12.8,merchant:'Serways',category:'travel',method:'cash',date:'2026-11-06',label:'Diaľničná známka A10'},
 {id:'IMG_8116.jpeg',name:'Pitztaler piste fee',
  text:'Pitztaler Gletscherbahn GmbH&Co KG\nMittelberg 103\nDatum: 03.11.2026 08:36\nVerkaufsbeleg Nr. 27510\n1 PISTEN GEB 650,00 650,00\nKreditkarte MasterCard 650,00\nGesamt EUR 650,00\nNettobetrag 541,67\nEnthaltene MwSt 20% 108,33',
  amount:650,merchant:'Pitztaler Gletscherbahn',category:'resort',method:'card',date:'2026-11-03',label:'Poplatok za trať'}
];
test('four submitted thermal receipt examples use correct paid totals and categories',()=>{
 for(const x of SAMPLE_THERMAL_RECEIPTS){
  const got=parseReceiptText(x.text);
  assert.equal(got.amount,x.amount,x.name+' amount');
  assert.equal(got.merchant,x.merchant,x.name+' supplier');
  assert.equal(got.category,x.category,x.name+' category');
  assert.equal(got.payment_method,x.method,x.name+' payment');
  assert.equal(got.spent_on,x.date,x.name+' date');
  assert.equal(receiptItemLabel({...got,ocr:{rawText:x.text}}),x.label,x.name+' item label');
  assert.ok(got.amountCandidates[0]?.isTotal,x.name+' needs a printed grand total');
 }
});
test('folded paid amount wins over change, tender, VAT and per-line prices',()=>{
 const original=SAMPLE_THERMAL_RECEIPTS[2];
 const got=parseReceiptText(original.text);
 assert.equal(got.amount,12.8);
 assert.ok(!got.amountCandidates.some(x=>x.amount===13), '13 EUR is tendered cash, not price');
 assert.ok(!got.amountCandidates.some(x=>x.amount===0.2),'0.20 EUR is returned change');
 const resort=parseReceiptText(SAMPLE_THERMAL_RECEIPTS[3].text);
 assert.equal(resort.amount,650);
 assert.ok(!resort.amountCandidates.some(x=>x.amount===108.33),'VAT is not grand total');
});
test('recognized Gesamt EUR and Bezahlt are grand-total indicators even when separated from number',()=>{
 const a=parseReceiptText('Pitztaler Gletscherbahn\nSCT Kind 613,00\nSCT PF+ 2,00\nGesamt EUR\n615,00');
 assert.equal(a.amount,615);
 const b=parseReceiptText('Serways\n6 Nov 26\nZw.-Summe\n12,80 EUR\nBezahlt\n12,80 EUR\nBargeld 13,00');
 assert.equal(b.amount,12.8);
});


test('IMG_8112 Steinblock: gross 111,60 beats VAT net and item totals',()=>{
 const t=[
  'Steinblock GmbH','Bundesstrasse 1a','6460 Imst','13.11.2026 15:12:25',
  '6 IM Gruppen Ermäßigte 12,80 76,80','1 IM Gruppen Erwachsene 13,80 13,80',
  '7 IM Leihschuhe Gruppe 3,00 21,00','Gesamt: EUR 111,60',
  'St Satz Netto USt Brutto','1 20,00% 93,00 18,60 111,60',
  'Gesamt: 93,00 18,60 111,60','Bezahlt:','EFT EUR 111,60'
].join('\n');
 const got=parseReceiptText(t);
 assert.equal(got.amount,111.60);
 assert.equal(got.merchant,'Steinblock GmbH');
 assert.equal(got.spent_on,'2026-11-13');
 assert.ok(!got.amountCandidates.some(v=>v.amount===93&&v.isTotal),'net amount is not a gross total');
 assert.ok(!got.amountCandidates.some(v=>v.amount===18.6&&v.isTotal),'VAT is not a gross total');
});
test('IMG_8111 Steinblock: rightmost gross value wins even when primary total is unreadable',()=>{
 const t=[
  'Steinblock GmbH','09.11.2026 14:58:39','4 502 12,80 51,20',
  '2 501 13,80 27,60','6 360210 3,00 18,00','St Satz Netto USt Brutto',
  '1 20,00% 80,67 16,13 96,80','Gesamt: 80,67 16,13 96,80',
  'Bezahlt:','EFT EUR 96,80'
].join('\n');
 const got=parseReceiptText(t);
 assert.equal(got.amount,96.8);
 assert.equal(got.spent_on,'2026-11-09');
 assert.ok(!got.amountCandidates.some(v=>v.amount===80.67&&v.isTotal));
});
test('OCR fractional O and broken spaced total label still read payment not tax',()=>{
 const got=parseReceiptText([
  'GUTMANN GMBH','03.11.2026','G E S A M T BETRAG EUR: 127,7O',
  'STEUERANTEIL 21,30 EUR','EUROCARD 127,78'
].join('\n'));
 assert.equal(got.amount,127.78);
 assert.ok(got.amountCandidates[0].isTotal);
});

test('Steinblock payment-only EFT still supplies total and card method',()=>{
 const r=parseReceiptText('Steinblock GmbH\n13.11.2026 15:12:25\nNetto 93,00\nUSt 18,60\nBezahlt:\nEFT EUR 111,60');
 assert.equal(r.amount,111.6);
 assert.equal(r.merchant,'Steinblock GmbH');
 assert.equal(r.payment_method,'card');
});
test('gross is rightmost of Gesamt even if VAT column headings are missing',()=>{
 const r=parseReceiptText('Steinblock GmbH\n09.11.2026\nGesamt: 80,67 16,13 96,80');
 assert.equal(r.amount,96.8);
 assert.equal(r.amountCandidates.some(x=>x.amount===80.67&&x.isTotal),false);
 assert.equal(r.amountCandidates.some(x=>x.amount===16.13&&x.isTotal),false);
});

test('a repeated paid amount retains both explicit total and card payment evidence',()=>{
 const r=parseReceiptText('Pitztaler Gletscherbahn\n03.11.2026\nGesamt EUR 615,00\nKreditkarte MasterCard 615,00');
 const c=r.amountCandidates.find(x=>x.amount===615);
 assert.equal(c.explicitTotal,true);
 assert.equal(c.paidLine,true);
});
test('receipt date tokens never become monetary candidates, including spaced dates',()=>{
 const r=parseReceiptText('Pitztaler Gletscherbahn\nDatum: 03.11. 2026 08:36\nVerkaufsbeleg Nr. 27510\nPISTEN GEB');
 assert.equal(r.amountCandidates.some(x=>x.amount===3.11),false);
});

test('Steinblock IMG_8111 recovers tax gross 96.80 when Gesamt caption is missing',()=>{
 const t='Steinblock GmbH\n09.11.2026\nMenge Artikel EP Preis St\nSt Satz Netto USt Brutto\n1 20,00% 80,67 16,13 96,80';
 const result=parseReceiptText(t);
 assert.equal(result.amount,96.8);
 assert.equal(result.merchant,'Steinblock GmbH');
 assert.equal(result.amountCandidates[0].taxRowGross,true);
 assert.equal(result.amountCandidates.some(c=>c.amount===80.67&&c.explicitTotal),false);
});
test('Steinblock IMG_8112 recovers 111.60 from reconciled gross tax table',()=>{
 const r=parseReceiptText('Steinblock GmbH\n13.11.2026\nSt Satz Netto USt Brutto\n1 20,00% 93,00 18,60 111,60');
 assert.equal(r.amount,111.6);
 assert.equal(r.amountCandidates[0].taxRowGross,true);
});
test('unreconciled tax table must not promote rightmost price to printed total',()=>{
 const r=parseReceiptText('Steinblock GmbH\n09.11.2026\nSt Satz Netto USt Brutto\n1 20,00% 80,67 16,13 96,30');
 assert.equal(r.amountCandidates.some(c=>c.amount===96.3&&c.explicitTotal),false);
});

test('new Slovnaft photo uses Základ DPH Spolu, paid card 132.34 (not tax/base)',()=>{
 const r=parseReceiptText([
  'SLOVNAFT, a.s.',
  'Dátum vyhotovenia: 02.11.2026 10:06:32',
  'EVO Diesel 65.810 L 2.011 EUR/L 132.34',
  'SUMA: 132.34 EUR',
  'Sadzby Základ DPH Spolu',
  '23% 107.59 24.75 132.34 EUR',
  'Spolu: 107.59 24.75 132.34 EUR',
  'PLATBY',
  'Banková karta 132.34 EUR',
  'UHRADENE 132.34 EUR',
  'Platba: BANKOVA KARTA'
 ].join('\n'));
 assert.equal(r.amount,132.34);
 assert.equal(r.merchant,'Slovnaft');
 assert.equal(r.spent_on,'2026-11-02');
 assert.equal(r.category,'fuel');
 assert.equal(r.payment_method,'card');
 assert.equal(r.amountCandidates[0].amount,132.34);
 assert.ok(!r.amountCandidates.some(x=>(x.amount===107.59||x.amount===24.75)&&x.isTotal));
});
test('unreconciled Slovak VAT row is not a source of false grand totals',()=>{
 const r=parseReceiptText(['SLOVNAFT','Sadzby Základ DPH Spolu','23% 107.59 24.15 132.34 EUR'].join('\n'));
 assert.ok(!r.amountCandidates.some(x=>x.isTotal&&[107.59,24.15].includes(x.amount)));
});
