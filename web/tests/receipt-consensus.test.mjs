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
