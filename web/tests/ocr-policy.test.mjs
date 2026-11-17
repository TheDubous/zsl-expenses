import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseOcrPass,ocrConfig,maxOcrPasses,isOcrCertain} from '../src/ocr-policy.mjs';
import {combineReceiptPasses} from '../src/receipt-consensus.mjs';

const result=()=>combineReceiptPasses([
 {kind:'focused',text:'GUTMANN GmbH\n03.11.2026\nDIESEL\nGESAMTBETRAG 127,78 EUR'},
 {kind:'normal',text:'GUTMANN GmbH\n03.11.2026\nDIESEL\nZAHLUNG GESAMTBETRAG 127,78 EUR'}
]);
const weak={amount:0,confidence:'low',merchant:null,merchantConfidence:'low',spent_on:null};
test('maximum accuracy is adaptive and limited to six passes with a soft 90s budget',()=>{
 assert.equal(maxOcrPasses('max'),6);
 assert.equal(ocrConfig('max').budgetMs,90000);
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:[]}), 'focused');
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['focused']}),'normal');
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['focused','normal'],result:weak}),'middle');
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['focused','normal','middle'],result:weak}),'bottom');
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['focused','normal','middle','bottom'],result:weak}),'header');
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['focused','normal','middle','bottom','header'],result:weak}),'enhanced');
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['focused','normal','middle','bottom','header','enhanced'],result:weak}),null);
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['focused','normal'],result:weak,elapsedMs:90000}),null);
});
test('two good reads receive an independent footer verification in maximum mode',()=>{
 const read=result();
 assert.equal(read.amount,127.78);
 assert.equal(read.merchant,'Gutmann');
 assert.equal(read.spent_on,'2026-11-03');
 assert.equal(isOcrCertain(read),false);
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['focused','normal'],result:read}),'bottom');
 const verified=combineReceiptPasses([
  {kind:'focused',text:'GUTMANN GmbH\n03.11.2026\nDIESEL\nGESAMTBETRAG 127,78 EUR'},
  {kind:'normal',text:'GUTMANN GmbH\n03.11.2026\nDIESEL\nGESAMTBETRAG 127,78 EUR'},
  {kind:'bottom',text:'GESAMTBETRAG 127,78 EUR'}]);
 assert.equal(isOcrCertain(verified),true);
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['focused','normal','bottom'],result:verified}),null);
});
test('single pass and incomplete data never claim maximum certainty',()=>{
 const once=combineReceiptPasses([{kind:'normal',text:'SLOVNAFT\nDiesel 75,00\nTOTAL 127,78 EUR\n01.11.2026'}]);
 assert.equal(isOcrCertain(once),false);
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['focused','normal'],
   result:{...once,amount:127.78,confidence:'high',merchant:'Slovnaft',merchantConfidence:'high',
     amountCandidates:[{amount:127.78,passNames:['normal']}]} }),'enhanced');
});
test('weak amount prioritizes footer while weak vendor prioritizes header',()=>{
 const amountGood={amount:50,confidence:'high',merchant:null,merchantConfidence:'low',spent_on:'2026-11-03'};
 assert.equal(chooseOcrPass({mode:'max',band:false,passes:['normal','enhanced'],result:amountGood}),'header');
 assert.equal(chooseOcrPass({mode:'max',band:false,passes:['normal','enhanced'],result:weak}),'middle');
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
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['focused','normal'],result:r}),'enhanced');
});

test('repeated OCR digit error is not accepted before independent amount verification',()=>{
 const first=combineReceiptPasses([
  {kind:'focused',text:'Pitztaler Gletscherbahn\n03.11.2026\nGesamt EUR 660,00'},
  {kind:'normal',text:'Pitztaler Gletscherbahn\n03.11.2026\nGesamt EUR 660,00'}]);
 assert.equal(first.amount,660);
 assert.equal(isOcrCertain(first),false);
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['focused','normal'],result:first}),'bottom');
 const checked=combineReceiptPasses([
  {kind:'focused',text:'Pitztaler Gletscherbahn\n03.11.2026\nGesamt EUR 660,00'},
  {kind:'normal',text:'Pitztaler Gletscherbahn\n03.11.2026\nGesamt EUR 660,00'},
  {kind:'bottom',text:'Gesamt EUR 650,00'}]);
 assert.equal(isOcrCertain(checked),false);
 assert.equal(checked.confidence,'low');
});
