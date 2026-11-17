import {test} from 'node:test';
import assert from 'node:assert/strict';
import {combineReceiptPasses} from '../src/receipt-consensus.mjs';
import {mergeRecognizedExpense} from '../src/receipt-import.mjs';
import {exportExpenseReadiness} from '../src/zsl-template-map.mjs';

// OCR fragments are anonymized transcriptions derived from six submitted photos.
// Original photographs and personal identifiers are deliberately NOT in Git.
const cases=[
 {name:'IMG_8111 Steinblock',total:96.80,passes:[
  {kind:'totals',text:'Gesamt EUR 98,80\nSt Satz Netto USt Brutto\n1 20,00% 80,67 16,13 96,80'},
  {kind:'normal',text:'Steinblock GmbH\n09.11.2026\nGesamt EUR 96,80\nEFT EUR 96,80'}]},
 {name:'IMG_8112 Steinblock',total:111.60,passes:[
  {kind:'normal',text:'Steinblock GmbH\n13.11.2026\nMenge Artikel EP Preis St\n6 502 12,80 76,80 1\n1 501 13,80 13,80 1\n7 360210 3,00 21,00 1\nGesamt EUR 111,60'},
  {kind:'payment',text:'Bezahlt EFT EUR 111,60'}]},
 {name:'IMG_8113 Pitztal SCT Kind',total:615,passes:[
  {kind:'totals',text:'Pitztaler Gletscherbahn\n03.11.2026\nGesamt EUR 613,00'},
  {kind:'items',text:'Stk Typ Einzelpreis Gesamt\n1 SCT Kind 613,00 613,00\n1 SCT PF+ 2,00 2,00\nKrediikarle MasterCard 615,00'},
  {kind:'payment',text:'Kreditkarte MasterCard 615,00'}]},
 {name:'IMG_8114 Gutmann Diesel',total:127.78,passes:[
  {kind:'normal',text:'GUTMANN GmbH\n03.11.2026\nDiesel 58,24L\nGESAMT BETRAG EUR 127,18'},
  {kind:'tax',text:'STB 20% VON 106 , 48 21,30\nMWST GESAMT EUR 21,30'},
  {kind:'payment',text:'EUROCARD EUR 127,18'}]},
 {name:'IMG_8115 Serways vignette',total:12.80,passes:[
  {kind:'normal',text:'Serways\n6 Nov 26\nVignette A10T KFZ bis 3,5 12,80 E\nZw.-Summe 12,80 EUR\nBezahlt 12,80 EUR'},
  {kind:'payment',text:'Bezahlt 12,80 EUR\nBargeld 13,00 EUR\nWechselgeld 0,20 EUR'}]},
 {name:'IMG_8116 Pitztal piste rental',total:650,passes:[
  {kind:'normal',text:'Pitztaler Gletscherbahn\n03.11.2026\n1 PISTEN GEB 650,00 650,00\nGesamt EUR 650,00'},
  {kind:'payment',text:'Kreditkarte MasterCard 650,00'}]}
];
test('six uploaded receipt patterns never select another amount over supported paid totals',()=>{
 for(const sample of cases){
  const result=combineReceiptPasses(sample.passes);
  assert.equal(result.amount,sample.total,sample.name);
  const saved=mergeRecognizedExpense({
    merchant:sample.name,category:'other',amount:0,payment_method:'unknown',ocr:{reviewed:false}
  },{...result,ocrMode:'max',ocrVerified:false},'EUR',{rescan:true});
  assert.equal(saved.amount,sample.total,sample.name+' stored suggestion');
  assert.equal(saved.ocr.autoReady,false,sample.name+' cannot claim auto-approved without independent photo verification');
 }
});
test('IMG_8113 and IMG_8114 disputed arithmetic totals require review before workbook',()=>{
 for(const sample of [cases[2],cases[3]]){
  const result=combineReceiptPasses(sample.passes);
  assert.equal(result.arithmeticSuggestion,true,sample.name);
  assert.equal(result.amountConflict,true,sample.name);
  const expense={
   id:'review',merchant:'Known supplier',category:'resort',amount:result.amount,
   spent_on:'2026-11-03',receipt_path:'photo',payment_method:'card',
   ocr:{reviewed:false,amountConflict:true,arithmeticSuggestion:true,autoReady:false}
  };
  assert.equal(exportExpenseReadiness(expense,{currency:'EUR'}).canExport,false);
  assert.equal(exportExpenseReadiness({...expense,ocr:{...expense.ocr,reviewed:true}},{currency:'EUR'}).canExport,true);
 }
});
