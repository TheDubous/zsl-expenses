import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseOcrPass,ocrConfig,maxOcrPasses,isOcrCertain} from '../src/ocr-policy.mjs';
import {combineReceiptPasses} from '../src/receipt-consensus.mjs';

const result=()=>combineReceiptPasses([
 {kind:'focused',text:'GUTMANN GmbH\n03.11.2026\nDIESEL\nGESAMTBETRAG 127,78 EUR'},
 {kind:'normal',text:'GUTMANN GmbH\n03.11.2026\nDIESEL\nZAHLUNG GESAMTBETRAG 127,78 EUR'}
]);
const weak={amount:0,confidence:'low',merchant:null,merchantConfidence:'low',spent_on:null};
test('maximum quality prioritizes original full-width totals and stays within the 90s budget',()=>{
 assert.equal(maxOcrPasses('max'),6);
 assert.equal(ocrConfig('max').budgetMs,90000);
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:[]}), 'totals');
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['totals'],result:weak}),'normal');
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['totals','normal'],result:weak}),'header');
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['totals','normal','header'],result:weak}),'payment');
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['totals','normal','header','payment'],result:weak}),'bottom');
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['totals','normal','header','payment','bottom'],result:weak}),'focused');
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['totals','normal','header','payment','bottom','focused'],result:weak}),null);
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['totals'],result:weak,elapsedMs:90000}),null);
});
test('two good reads receive an independent footer verification in maximum mode',()=>{
 const read=result();
 assert.equal(read.amount,127.78);
 assert.equal(read.merchant,'Gutmann');
 assert.equal(read.spent_on,'2026-11-03');
 assert.equal(isOcrCertain(read),false);
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['focused','normal'],result:read}),'totals');
 const verified=combineReceiptPasses([
  {kind:'focused',text:'GUTMANN GmbH\n03.11.2026\nDIESEL\nGESAMTBETRAG 127,78 EUR'},
  {kind:'normal',text:'GUTMANN GmbH\n03.11.2026\nDIESEL\nGESAMTBETRAG 127,78 EUR'},
  {kind:'bottom',text:'EUROCARD 127,78 EUR'}]);
 assert.equal(isOcrCertain(verified),true);
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['focused','normal','bottom'],result:verified}),null);
});
test('single pass and incomplete data never claim maximum certainty',()=>{
 const once=combineReceiptPasses([{kind:'normal',text:'SLOVNAFT\nDiesel 75,00\nTOTAL 127,78 EUR\n01.11.2026'}]);
 assert.equal(isOcrCertain(once),false);
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['focused','normal'],
   result:{...once,amount:127.78,confidence:'high',merchant:'Slovnaft',merchantConfidence:'high',
     amountCandidates:[{amount:127.78,passNames:['normal']}]} }),'totals');
});
test('missing supplier triggers header after total and full-image reads',()=>{
 const amountGood={amount:50,confidence:'medium',merchant:null,merchantConfidence:'low',spent_on:'2026-11-03'};
 assert.equal(chooseOcrPass({mode:'max',band:false,passes:['totals','normal'],result:amountGood}),'header');
 assert.equal(chooseOcrPass({mode:'max',band:false,passes:['totals','normal','header'],result:amountGood}),'payment');
 assert.equal(chooseOcrPass({mode:'max',band:false,passes:['totals','normal'],result:weak}),'header');
 assert.equal(chooseOcrPass({mode:'max',band:false,passes:['totals','normal','header'],result:weak}),'payment');
});
test('fast and precise modes remain available and avoid maximum OCR language overhead',()=>{
 assert.equal(chooseOcrPass({mode:'fast',band:true,passes:[]}), 'normal');
 assert.equal(chooseOcrPass({mode:'fast',band:true,passes:['normal']}),'header');
 assert.equal(chooseOcrPass({mode:'fast',band:true,passes:['normal','header']}),null);
 assert.equal(maxOcrPasses('precise'),4);
 assert.equal(chooseOcrPass({mode:'precise',band:true,passes:['focused','normal','bottom','header'],result:weak}),null);
});

test('two agreeing item prices do not stop OCR without a recognized paid total',()=>{
 const r={amount:613,confidence:'high',merchant:'Pitztaler Gletscherbahn',
 merchantConfidence:'high',spent_on:'2026-11-03',
 amountCandidates:[{amount:613,score:22,isTotal:false,passNames:['focused','normal']}]};
 assert.equal(isOcrCertain(r),false);
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['focused','normal'],result:r}),'totals');
});

test('repeated OCR digit error is not accepted before independent amount verification',()=>{
 const first=combineReceiptPasses([
  {kind:'focused',text:'Pitztaler Gletscherbahn\n03.11.2026\nGesamt EUR 660,00'},
  {kind:'normal',text:'Pitztaler Gletscherbahn\n03.11.2026\nGesamt EUR 660,00'}]);
 assert.equal(first.amount,660);
 assert.equal(isOcrCertain(first),false);
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['focused','normal'],result:first}),'totals');
 const checked=combineReceiptPasses([
  {kind:'focused',text:'Pitztaler Gletscherbahn\n03.11.2026\nGesamt EUR 660,00'},
  {kind:'normal',text:'Pitztaler Gletscherbahn\n03.11.2026\nGesamt EUR 660,00'},
  {kind:'bottom',text:'Gesamt EUR 650,00'}]);
 assert.equal(isOcrCertain(checked),false);
 assert.equal(checked.confidence,'low');
});

test('Steinblock IMG8111 sum region cannot be deferred past first slow full-image pass',()=>{
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:[]}), 'totals');
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['totals'],elapsedMs:45000}), 'normal');
 const one=combineReceiptPasses([{kind:'totals',text:
  'Gesamt EUR 96,80\\nSt Satz Netto USt Brutto\\nGesamt: 80,67 16,13 96,80\\nEFT EUR 96,80'}]);
 assert.equal(one.amount,96.8);
 assert.equal(one.totalVerified,false);
 assert.equal(one.confidence,'medium');
 const both=combineReceiptPasses([
  {kind:'totals',text:'Gesamt EUR 96,80\\nGesamt: 80,67 16,13 96,80\\nEFT EUR 96,80'},
  {kind:'normal',text:'Steinblock GmbH\\n09.11.2026\\nGesamt EUR 96,80\\nBezahlt: EFT EUR 96,80'}
 ]);
 assert.equal(both.amount,96.8);
 assert.equal(both.totalVerified,true);
 assert.equal(both.spent_on,'2026-11-09');
 assert.equal(isOcrCertain(both),true);
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['totals','normal'],result:both}),null);
});
