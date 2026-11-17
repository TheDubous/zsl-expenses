import {test} from 'node:test';
import assert from 'node:assert/strict';
import {combineReceiptPasses} from '../src/receipt-consensus.mjs';

test('header pass recovers supplier missing in first read',()=>{
 const result=combineReceiptPasses([
  {kind:'normal',text:'RECHNUNG\nKARTA\nDiesel 75,00\nGesamtbetrag 132,34 EUR\n03.11.2026'},
  {kind:'enhanced',text:'TOTAL EUR 132,34\nKreditkarte\nDiesel'},
  {kind:'header',text:'SLOVNAF T\nSLOVNAFT a.s.\nFUEL STATION'}
 ]);
 assert.equal(result.merchant,'Slovnaft');
 assert.equal(result.amount,132.34);
 assert.equal(result.category,'fuel');
 assert.ok(result.merchantCandidates.length>0);
 assert.equal(result.scannedPasses.length,3);
});
test('amount in header does not override full receipt total',()=>{
 const result=combineReceiptPasses([
  {kind:'normal',text:'OBCHOD\nSPOLU 55,84 EUR'},
  {kind:'enhanced',text:'SUMA: 55,84 EUR'},
  {kind:'header',text:'INTER SPAR\nPROMO 25,00 EUR'}
 ]);
 assert.equal(result.amount,55.84);
 assert.equal(result.merchant,'INTERSPAR');
});
test('multiple passes disagreeing on total offer alternatives rather than false confidence',()=>{
 const result=combineReceiptPasses([
  {kind:'normal',text:'SPOLU 650,00 EUR'},
  {kind:'enhanced',text:'SPOLU 660,00 EUR'},
  {kind:'header',text:'PITZTALER GLETSCHERBAHN'}
 ]);
 assert.equal(result.amount,null);
 assert.equal(result.confidence,'low');
 assert.equal(result.amountCandidates.length,2);
});
test('no readings is safe and does not invent supplier',()=>{
 const result=combineReceiptPasses([]);
 assert.equal(result.merchant,null);
 assert.equal(result.amount,null);
});

test('header-only pass repairs date without allowing header prices to override totals',()=>{
 const r=combineReceiptPasses([
  {kind:'focused',text:['Steinblock GmbH','43.11.2026 15:12','Gesamt EUR 111,60'].join('\n')},
  {kind:'middle',text:['Gesamt: EUR 111,60','St Satz Netto USt Brutto','Gesamt: 93,00 18,60 111,60'].join('\n')},
  {kind:'header',text:['Steinblock GmbH','13.11.2026 15:12','Item 987,00 EUR'].join('\n')}
 ]);
 assert.equal(r.amount,111.6);
 assert.equal(r.spent_on,'2026-11-13');
 assert.equal(r.merchant,'Steinblock GmbH');
 assert.ok(!r.amountCandidates.some(x=>x.amount===987));
});
test('tax break-down is not a conflicting printed total when OCR only sees the gross in one pass',()=>{
 const r=combineReceiptPasses([
  {kind:'focused',text:['Steinblock GmbH','09.11.2026','Gesamt EUR 96,80'].join('\n')},
  {kind:'middle',text:['St Satz Netto USt Brutto','Gesamt: 80,67 16,13 96,80'].join('\n')}
 ]);
 assert.equal(r.amount,96.8);
 assert.notEqual(r.confidence,'low');
});
