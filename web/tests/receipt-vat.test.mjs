import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeVatTable} from '../src/receipt-vat.mjs';
import {receiptMathEvidence} from '../src/receipt-math.mjs';
import {parseReceiptText} from '../src/receipt-parse.mjs';

const spar=[
 'INTERSPAR','SUMME : 55,84','ZAHLUNG VISA 55,84','Betrag EUR: 55,84',
 'excl. MWST. Incl.','an 49,90% 3,16 0,16 3,32 K',
 '1 10,00% 33,77 3,38 37,15 A','I 20,00% 12,81 2,56 15,37 B'
].join('\n');
test('INTERSPAR: multi-rate VAT classes sum to 55.84, none is a rival grand total',()=>{
 const a=analyzeVatTable(spar);
 assert.equal(a.multiRate,true);
 assert.equal(a.aggregate,5584);
 assert.equal(a.rows.length,3);
 assert.deepEqual(receiptMathEvidence(spar).map(e=>[e.amount,e.kind]),[[55.84,'vat-aggregate']]);
 const p=parseReceiptText(spar);
 assert.equal(p.amount,55.84);
 for(const v of [3.32,37.15,15.37]){
   assert.ok(!p.amountCandidates.some(c=>c.amount===v&&c.taxRowGross),String(v));
 }
});
test('cropped multi-rate VAT table without its first class cannot invent a 52.52 total',()=>{
 const snippet='SUMME: 55,84\nexcl. MWST Incl.\n10,00% 33,77 3,38 37,15 A\n20,00% 12,81 2,56 15,37 B';
 const vat=analyzeVatTable(snippet);
 assert.equal(vat.multiRate,true);
 assert.equal(vat.aggregate,null);
 assert.ok(!receiptMathEvidence(snippet).some(x=>x.amount===52.52));
});
test('Slovnaft: tax column heading after first printed numeric row still recognizes gross',()=>{
 const source='107.59 24.75 132.34 EUR\nZáklad DPH Spolu\nBanková karta 132.34 EUR\nUHRADENÉ 132.34 EUR';
 const a=analyzeVatTable(source);
 assert.equal(a.multiRate,false);
 assert.equal(a.rows[0].gross,13234);
 assert.ok(receiptMathEvidence(source).some(x=>x.amount===132.34&&x.kind==='vat-columns'));
 const r=parseReceiptText(source);
 assert.equal(r.amount,132.34);
 assert.ok(!r.amountCandidates.some(x=>x.amount===107.59&&x.isTotal));
});
test('OCR-lost decimals in Spolu VAT row cannot turn net base 107.59 into paid total',()=>{
 const source='SLOVNAFT\n107.59 24.75 132.34 EUR\nSpolu 107.59 24 15 : 132 34 ER\nBR cy Ziad DPH Spolu\n23% 107.59 24.75 132.34 EUR\nBanková karta 132.34 EUR';
 const p=parseReceiptText(source);
 assert.equal(p.amount,132.34);
 assert.ok(!p.amountCandidates.some(x=>x.amount===107.59&&x.isTotal));
});
test('Steinblock single VAT class still provides strong gross evidence',()=>{
 const source='Steinblock GmbH\nSt Satz Netto USt Brutto\n1 20,00% 80,67 16,13 96,80\nGesamt 96,80 EUR';
 const a=analyzeVatTable(source);
 assert.equal(a.multiRate,false);
 assert.equal(a.rows.length,1);
 assert.ok(receiptMathEvidence(source).some(x=>x.amount===96.8&&x.kind==='vat-columns'));
});
