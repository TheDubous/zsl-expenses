import {test} from 'node:test';
import assert from 'node:assert/strict';
import {redactOcrText,buildOcrDiagnostic,OCR_DIAGNOSTIC_FORMAT} from '../src/ocr-diagnostics.mjs';
import {mergeRecognizedExpense} from '../src/receipt-import.mjs';

test('diagnostic reveals per-pass OCR evidence without any attachment bytes or document IDs',()=>{
 const prior={amount:0,merchant:'',category:'resort',payment_method:'unknown',ocr:{reviewed:false}};
 const result=mergeRecognizedExpense(prior,{
   amount:615,merchant:'Pitztaler Gletscherbahn',spent_on:'2026-11-03',
   confidence:'low',merchantConfidence:'high',ocrMode:'max',ocrLanguage:'eng+deu+ces+slk',
   ocrVerified:false,amountConflict:true,arithmeticSuggestion:false,
   amountCandidates:[
     {amount:615,score:46,isTotal:true,totalPassNames:['normal'],paidPassNames:['payment'],mathEvidence:[]},
     {amount:619,score:35,isTotal:true,totalPassNames:['totals'],paidPassNames:[],mathEvidence:[]}
   ],
   merchantCandidates:[{name:'Pitztaler Gletscherbahn',score:53,source:'known-brand'}],
   attemptedPasses:['totals','normal','payment'],scannedPasses:['totals','normal','payment'],
   ocrDurationMs:46000,
   passDiagnostics:[
     {kind:'totals',ocrConfidence:74,durationMs:1000,text:'Gesamt EUR 619,00'},
     {kind:'normal',ocrConfidence:83,durationMs:1100,text:'Gesamt EUR 615,00'},
     {kind:'payment',ocrConfidence:81,durationMs:1150,text:'Kreditkarte MasterCard 615,00'}
   ],
   rawText:'Gesamt EUR 619,00\nGesamt EUR 615,00\nKreditkarte MasterCard 615,00'
 },'EUR',{rescan:true});
 result.receipt_path='private-photo-blob-id';
 const data=buildOcrDiagnostic(result);
 assert.equal(data.format,OCR_DIAGNOSTIC_FORMAT);
 assert.equal(data.receipt.amount,615);
 assert.equal(data.recognition.amountConflict,true);
 assert.equal(data.recognition.passes.length,3);
 assert.equal(data.recognition.passes[0].text,'Gesamt EUR 619,00');
 assert.equal(data.recognition.amountCandidates[1].amount,619);
 assert.equal(data.recognition.amountCandidates[1].totalPassNames[0],'totals');
 const output=JSON.stringify(data);
 assert.ok(!output.includes('private-photo-blob-id'));
 assert.ok(!output.includes('"blob"'));
 assert.ok(!output.includes('"rawText":"Gesamt EUR'));
});
test('redacts email, account and card number without wiping financial totals',()=>{
 const input='office@steinblock.at\nIBAN AT61 1904 3002 3457 3201\nKarte 4111 1111 1111 1111\nGesamt 96,80 EUR\n03.11.2026';
 const output=redactOcrText(input);
 assert.ok(!output.includes('office@steinblock.at'));
 assert.ok(!output.includes('4111 1111 1111 1111'));
 assert.ok(!output.includes('AT61 1904 3002 3457 3201'));
 assert.ok(output.includes('96,80'));
 assert.ok(output.includes('03.11.2026'));
});
test('legacy receipts still export their existing raw OCR text as a fallback',()=>{
 const data=buildOcrDiagnostic({ocr:{rawText:'Gesamt EUR 111,60',scannedPasses:['normal']}});
 assert.deepEqual(data.recognition.passes,[]);
 assert.equal(data.recognition.rawTextFallback,'Gesamt EUR 111,60');
});
