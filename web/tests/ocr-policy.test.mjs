import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseOcrPass,ocrConfig,maxOcrPasses,isOcrCertain} from '../src/ocr-policy.mjs';
import {combineReceiptPasses} from '../src/receipt-consensus.mjs';

const result=()=>combineReceiptPasses([
 {kind:'focused',text:'GUTMANN GmbH\n03.11.2026\nDIESEL\nGESAMTBETRAG 127,78 EUR'},
 {kind:'normal',text:'GUTMANN GmbH\n03.11.2026\nDIESEL\nZAHLUNG GESAMTBETRAG 127,78 EUR'}
]);
const weak={amount:0,confidence:'low',merchant:null,merchantConfidence:'low',spent_on:null};
test('maximum mode reads short price crops before the potentially slow full overview',()=>{
 assert.equal(maxOcrPasses('max'),8);
 assert.equal(ocrConfig('max').budgetMs,90000);
 const order=['totals','middle','focused','payment','items','tax','normal','header'];
 for(let i=0;i<order.length;i++){
  assert.equal(chooseOcrPass({mode:'max',band:true,passes:order.slice(0,i),result:weak}),order[i]);
 }
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:order,result:weak}),null);
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['totals'],result:weak,elapsedMs:90000}),null);
});
test('IMG8116 must reach price-bearing middle crop even if first totals read misses 650',()=>{
 const missed={...weak,merchant:'Pitztaler Gletscherbahn',merchantConfidence:'high',
   spent_on:'2026-11-03'};
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['totals'],result:missed}),'middle');
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['totals','middle'],result:missed}),'focused');
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['totals','middle','focused'],result:missed}),'payment');
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
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['focused','normal','bottom'],result:verified}),'totals');
});
test('single pass and incomplete data never claim maximum certainty',()=>{
 const once=combineReceiptPasses([{kind:'normal',text:'SLOVNAFT\nDiesel 75,00\nTOTAL 127,78 EUR\n01.11.2026'}]);
 assert.equal(isOcrCertain(once),false);
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['focused','normal'],
   result:{...once,amount:127.78,confidence:'high',merchant:'Slovnaft',merchantConfidence:'high',
     amountCandidates:[{amount:127.78,passNames:['normal']}]} }),'totals');
});
test('missing supplier still gets a header pass if targeted reads do not find it',()=>{
 const amountGood={amount:50,confidence:'medium',merchant:null,merchantConfidence:'low',spent_on:'2026-11-03'};
 const done=['totals','middle','payment','items','tax','normal'];
 assert.equal(chooseOcrPass({mode:'max',band:false,passes:done,result:amountGood}),'header');
 assert.equal(chooseOcrPass({mode:'max',band:false,passes:done.concat('header'),result:amountGood}),'bottom');
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

test('Steinblock VAT and payment can finish after all short targeted scans',()=>{
 const both=combineReceiptPasses([
  {kind:'totals',text:'Steinblock GmbH\n09.11.2026\nGesamt EUR 96,80\nSt Satz Netto USt Brutto\n1 20,00% 80,67 16,13 96,80'},
  {kind:'middle',text:'Gesamt EUR 96,80\nEFT EUR 96,80'}
 ]);
 assert.equal(both.amount,96.8);
 assert.equal(both.totalVerified,true);
 assert.equal(isOcrCertain(both),true);
 assert.equal(chooseOcrPass({mode:'max',band:true,passes:['totals'],result:both}),'middle');
 assert.equal(chooseOcrPass({mode:'max',band:true,
   passes:['totals','middle','focused','payment','items','tax'],result:both}),null);
});
