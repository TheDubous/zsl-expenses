import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeRecognizedExpense,isCurrencyConversionPending} from '../src/receipt-import.mjs';

const reading=(amount,confidence='high')=>({
 amount,confidence,merchant:'Pitztaler Gletscherbahn',
 merchantConfidence:'high',spent_on:'2026-11-03',
 category:'resort',payment_method:'card',
 amountCandidates:[{amount,isTotal:true,score:25}],rawText:'Gesamt EUR '+amount
});
test('re-reading an unreviewed receipt replaces a stale wrong OCR total',()=>{
 const saved={amount:660,merchant:'Pitztaler Gletscherbahn',ocr:{reviewed:false},category:'resort',payment_method:'card'};
 const newer=mergeRecognizedExpense(saved,reading(650),'EUR',{rescan:true});
 assert.equal(newer.amount,650);
 assert.equal(newer.ocr.reviewed,false);
 assert.equal(newer.ocr.autoReady,true);
});
test('re-reading a manually approved receipt does not overwrite the correction',()=>{
 const saved={amount:615,merchant:'My confirmed supplier',spent_on:'2026-11-02',ocr:{reviewed:true},category:'resort',payment_method:'card'};
 const newer=mergeRecognizedExpense(saved,reading(650),'EUR',{rescan:true});
 assert.equal(newer.amount,615);
 assert.equal(newer.merchant,'My confirmed supplier');
 assert.equal(newer.spent_on,'2026-11-02');
 assert.equal(newer.ocr.reviewed,true);
 assert.equal(newer.ocr.autoReady,false);
});
test('uncertain re-read does not erase a previously stored OCR amount',()=>{
 const saved={amount:615,ocr:{reviewed:false},category:'other',payment_method:'unknown'};
 const newer=mergeRecognizedExpense(saved,reading(650,'low'),'EUR',{rescan:true});
 assert.equal(newer.amount,615);
 assert.equal(newer.ocr.confidence,'low');
});
test('unconfirmed foreign currency still cannot be added to EUR accounting total',()=>{
 const saved={amount:0,ocr:{reviewed:false},category:'other',payment_method:'unknown'};
 const found={...reading(1469),sourceAmount:1469,sourceCurrency:'CZK'};
 const out=mergeRecognizedExpense(saved,found,'EUR',{rescan:true});
 assert.equal(out.amount,0);
 assert.equal(isCurrencyConversionPending(out,'EUR'),true);
});

test('photo OCR cannot display green auto approval without independent verification',()=>{
 const saved={amount:613,ocr:{reviewed:false,autoReady:true},category:'resort',payment_method:'card'};
 const newer=mergeRecognizedExpense(saved,{...reading(613),ocrMode:'max',ocrVerified:false},'EUR',{rescan:true});
 assert.equal(newer.amount,613);
 assert.equal(newer.ocr.autoReady,false);
 assert.equal(newer.ocr.ocrVerified,false);
});
test('verified photo OCR can be approved but manual correction stays untouched',()=>{
 const saved={amount:660,ocr:{reviewed:false},category:'resort',payment_method:'card'};
 const newer=mergeRecognizedExpense(saved,{...reading(650),ocrMode:'max',ocrVerified:true},'EUR',{rescan:true});
 assert.equal(newer.amount,650);
 assert.equal(newer.ocr.autoReady,true);
});

test('a VAT-based 96.80 suggestion is saved for review but never auto-approved',()=>{
 const saved={amount:0,merchant:'Steinblock GmbH',category:'other',payment_method:'card',ocr:{reviewed:false}};
 const found={...reading(96.8,'medium'),ocrMode:'max',ocrVerified:false,
  amountConflict:true,arithmeticSuggestion:true};
 const newExpense=mergeRecognizedExpense(saved,found,'EUR',{rescan:true});
 assert.equal(newExpense.amount,96.8);
 assert.equal(newExpense.ocr.amountConflict,true);
 assert.equal(newExpense.ocr.arithmeticSuggestion,true);
 assert.equal(newExpense.ocr.autoReady,false);
 assert.equal(newExpense.ocr.reviewed,false);
});

test('repeated 615 against isolated 619 is suggested but not auto-approved or exported',()=>{
 const saved={amount:0,merchant:'',category:'resort',payment_method:'card',ocr:{reviewed:false}};
 const found={...reading(615,'medium'),ocrMode:'max',ocrVerified:false,
  amountConflict:true,evidenceSuggestion:true,arithmeticSuggestion:false};
 const next=mergeRecognizedExpense(saved,found,'EUR',{rescan:true});
 assert.equal(next.amount,615);
 assert.equal(next.ocr.amountConflict,true);
 assert.equal(next.ocr.evidenceSuggestion,true);
 assert.equal(next.ocr.autoReady,false);
 assert.equal(next.ocr.reviewed,false);
});
