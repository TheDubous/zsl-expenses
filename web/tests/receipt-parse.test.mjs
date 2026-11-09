import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseReceiptText} from '../src/receipt-parse.mjs';
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
