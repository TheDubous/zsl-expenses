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

test('IMG_8113 item 613 cannot beat paid grand total 615',()=>{
 const r=combineReceiptPasses([
  {kind:'focused',text:'Pitztaler Gletscherbahn\n03.11.2026\nSCT Kind 613,00\nSCT PF+ 2,00'},
  {kind:'middle',text:'Gesamt EUR 615,00\nKreditkarte MasterCard 615,00'},
  {kind:'bottom',text:'Gesamt EUR 615,00'}]);
 assert.equal(r.amount,615);
 assert.equal(r.totalVerified,true);
 assert.equal(r.confidence,'high');
});
test('repeated item price or date cannot masquerade as verified total',()=>{
 const r=combineReceiptPasses([
  {kind:'focused',text:'Pitztaler Gletscherbahn\n03.11.2026\nSCT Kind 613,00'},
  {kind:'middle',text:'03.11.2026\nSCT Kind 613,00'},
  {kind:'bottom',text:'03.11.2026\nSCT Kind 613,00'}]);
 assert.equal(r.amount,null);
 assert.equal(r.confidence,'low');
 assert.equal(r.totalVerified,false);
});
test('IMG_8114 conflicting 127.18 printed vs 127.78 paid is not silently booked',()=>{
 const r=combineReceiptPasses([
  {kind:'focused',text:'GUTMANN\n03.11.2026\nGESAMTBETRAG EUR 127,18'},
  {kind:'middle',text:'GESAMTBETRAG EUR 127,18'},
  {kind:'bottom',text:'EUROCARD 127,78 EUR'}]);
 assert.equal(r.amount,null);
 assert.equal(r.confidence,'low');
 assert.equal(r.amountConflict,true);
});

test('independent Brutto tax table and EFT can verify IMG_8111',()=>{
 const result=combineReceiptPasses([
  {kind:'focused',text:'Steinblock GmbH\n09.11.2026\nSt Satz Netto USt Brutto\n1 20,00% 80,67 16,13 96,80'},
  {kind:'payment',text:'Bezahlt:\nEFT EUR 96,80'}
 ]);
 assert.equal(result.amount,96.8);
 assert.equal(result.confidence,'high');
 assert.equal(result.totalVerified,true);
});
test('tax table alone leaves IMG_8111 visible as unverified candidate',()=>{
 const result=combineReceiptPasses([
  {kind:'middle',text:'Steinblock GmbH\n09.11.2026\nSt Satz Netto USt Brutto\n1 20,00% 80,67 16,13 96,80'}
 ]);
 assert.equal(result.amount,96.8);
 assert.equal(result.totalVerified,false);
 assert.equal(result.confidence,'medium');
});

test('IMG_8111 chooses reconciled 96.80 over isolated OCR 98.80 but requires confirmation',()=>{
 const r=combineReceiptPasses([
  {kind:'totals',text:'Steinblock GmbH\nGesamt: EUR 98,80\nSt Satz Netto USt Brutto\n1 20,00% 80,67 16,13 96,80'},
  {kind:'normal',text:'Steinblock GmbH\n09.11.2026\nGesamt EUR 98,80\nBezahlt: EFT EUR 96,80'},
  {kind:'payment',text:'Gesamt: EUR 96,80\nSt Satz Netto USt Brutto\n1 20,00% 80,67 16,13 96,80'}
 ]);
 assert.equal(r.amount,96.8);
 assert.equal(r.amountConflict,true);
 assert.equal(r.arithmeticSuggestion,true);
 assert.equal(r.totalVerified,false);
 assert.equal(r.confidence,'medium');
 assert.equal(r.amountCandidates[0].amount,96.8);
 assert.ok(r.amountCandidates.some(x=>x.amount===98.8));
});
test('competing reconciled gross totals remain unresolved instead of guessing',()=>{
 const r=combineReceiptPasses([
  {kind:'totals',text:'Steinblock\nSt Satz Netto USt Brutto\n1 20,00% 80,67 16,13 96,80'},
  {kind:'payment',text:'Steinblock\nSt Satz Netto USt Brutto\n1 20,00% 82,67 16,13 98,80'}
 ]);
 assert.equal(r.amount,null);
 assert.equal(r.amountConflict,true);
 assert.equal(r.arithmeticSuggestion,false);
});

test('actual IMG8113 OCR fragments: two line items produce paid 615, not 613',()=>{
 const r=combineReceiptPasses([
  {kind:'totals',text:'Pitztaler Gletscherbahn\nGesamt EUR 613,00'},
  {kind:'normal',text:'Stk Typ Einzelpreis Gesamt\n1 SCT Kind 613,00 613,00\n1 SCT PF+ 2,00 2,00\nKrediikarle MasterCard 615,00'},
  {kind:'payment',text:'Kreditkarte MasterCard 615,00\nGesamt EUR 615,00'}
 ]);
 assert.equal(r.amount,615);
 assert.equal(r.amountConflict,true);
 assert.equal(r.arithmeticSuggestion,true);
 assert.equal(r.totalVerified,false);
 assert.notEqual(r.confidence,'high');
});
test('actual IMG8114 OCR fragments: VAT base/rate corrects misread 127.18 total',()=>{
 const r=combineReceiptPasses([
  {kind:'totals',text:'GUTMANN\n03.11.2026\nGESAMT BETRAG EUR 127,18'},
  {kind:'normal',text:'DIESEL 58,241\nSTEUERANTEIL 21,30 EUR\nGESAMT BETRAG EUR 127,18\nMUST B 20% VON 106,48 21,30'},
  {kind:'payment',text:'CELKOM-EFT EUR 127,18'}
 ]);
 assert.equal(r.amount,127.78);
 assert.equal(r.amountConflict,true);
 assert.equal(r.arithmeticSuggestion,true);
 assert.equal(r.totalVerified,false);
 assert.notEqual(r.confidence,'high');
});
test('a single item calculation without printed total can be suggested, never verified',()=>{
 const r=combineReceiptPasses([
  {kind:'middle',text:'Stk Typ Einzelpreis Gesamt\n1 SCT Kind 613,00 613,00\n1 SCT PF+ 2,00 2,00'}
 ]);
 assert.equal(r.amount,615);
 assert.equal(r.arithmeticSuggestion,true);
 assert.equal(r.totalVerified,false);
 assert.equal(r.confidence,'medium');
});
test('two contradictory arithmetic proofs are not safe to prefill',()=>{
 const r=combineReceiptPasses([
  {kind:'middle',text:'Stk Typ Einzelpreis Gesamt\n1 SCT Kind 613,00 613,00\n1 SCT PF+ 2,00 2,00'},
  {kind:'bottom',text:'St Satz Netto USt Brutto\n1 20,00% 80,67 16,13 96,80'}
 ]);
 assert.equal(r.amount,null);
 assert.equal(r.amountConflict,true);
 assert.equal(r.arithmeticSuggestion,false);
});

test('real diagnostics IMG8111: seven corroborated 96.80 reads beat one 98.80 OCR typo',()=>{
 const r=combineReceiptPasses([
  {kind:'totals',text:'Gesamt EUR 96,80\nSt Satz Netto USt Brutto\n1 20,00% 80,67 16,13 96,80'},
  {kind:'normal',text:'09.11.2026\nGesamt EUR 96,80'},
  {kind:'payment',text:'Gesamt EUR 98,80\nSt Satz Netto USt Brutto\n1 20,00% 80,67 16,13 96,80\nBezahlt:\nEFT EUR 96,80'},
  {kind:'items',text:'Gesamt EUR 96,80\nSt Satz Netto USt Brutto\n1 20,00% 80,67 16,13 96,80\nEFT EUR 96,80'},
  {kind:'focused',text:'St Satz Netto USt Brutto\n1 20,00% 80,67 16,13 96,80\nGesamt EUR 96,80'},
  {kind:'middle',text:'Gesamt EUR 96,80'}
 ]);
 assert.equal(r.amount,96.8);
 assert.equal(r.amountConflict,false);
 assert.equal(r.arithmeticSuggestion,false);
 assert.ok(r.amountCandidates.some(x=>x.amount===98.8));
 assert.equal(r.amountCandidates[0].amount,96.8);
});
test('real diagnostics IMG8112: broken 11160 gross does not make 18.60 a competing total',()=>{
 const r=combineReceiptPasses([
  {kind:'totals',text:'Gesamt EUR 111,60\nSt Satz Netto USt Brutto\n1 20,00% 93,00 18,60 111,60'},
  {kind:'normal',text:'13.11.2026\nGesamt EUR 111,60\nGesamt: 93,00 18,60 11160'},
  {kind:'payment',text:'Gesamt EUR 111,60\nBezahlt:'},
  {kind:'items',text:'Gesamt EUR 111,60'},
  {kind:'focused',text:'Gesamt EUR 111,60'},
  {kind:'middle',text:'Gesamt EUR 111,60'}
 ]);
 assert.equal(r.amount,111.6);
 assert.equal(r.amountConflict,false);
 assert.equal(r.arithmeticSuggestion,true);
 assert.equal(r.confidence,'medium');
});
test('real diagnostics IMG8113: repeated 615 with card proof suggested despite single 619',()=>{
 const r=combineReceiptPasses([
  {kind:'totals',text:'SCT PF+ 2,00 2,00\nGesamt EUR 619.00'},
  {kind:'normal',text:'03.11.2026\n613,00 613,00\nSCT PF+'},
  {kind:'items',text:'Kreditkarle MasterCard 615,00'},
  {kind:'bottom',text:'SCT Kind 613,00\nSCT PF+ 2,00\nKreditkarle MasterCard\n615,00'},
  {kind:'middle',text:'Kreditkarle MasterCard 615,00\nGesamt EUR 615,00'}
 ]);
 assert.equal(r.amount,615);
 assert.equal(r.amountConflict,true);
 assert.equal(r.arithmeticSuggestion,false);
 assert.equal(r.evidenceSuggestion,true);
 assert.equal(r.confidence,'medium');
 assert.ok(r.amountCandidates.some(x=>x.amount===619));
});
test('real diagnostics IMG8114: tax calculation 127.78 still flagged against 127.18 printed',()=>{
 const r=combineReceiptPasses([
  {kind:'totals',text:'CELKOM-EFT EUR 127,13'},
  {kind:'normal',text:'MUST B 20% VON 106,48 21,30'},
  {kind:'items',text:'GESAMT BETRAG EUR 127,18\nCELKOM-EFT EUR 127.78'},
  {kind:'tax',text:'MUST B 20% VON 106,48 21,30'}
 ]);
 assert.equal(r.amount,127.78);
 assert.equal(r.amountConflict,true);
 assert.equal(r.arithmeticSuggestion,true);
 assert.equal(r.confidence,'medium');
});
test('real diagnostics IMG8115 and IMG8116: accepted totals stay conservative in one pass',()=>{
 const vignette=combineReceiptPasses([
   {kind:'middle',text:'Zw.-Summe 12,80€\nBezahlt 12,80€\nWechselgeld 0,20€'}
 ]);
 assert.equal(vignette.amount,12.8);
 assert.equal(vignette.amountConflict,false);
 const piste=combineReceiptPasses([
   {kind:'middle',text:'PISTEN GEB 650,00 650,00\nKreditkarte MasterCard 650,00\nGesamt EUR 650,00'}
 ]);
 assert.equal(piste.amount,650);
 assert.equal(piste.amountConflict,false);
 assert.equal(piste.totalVerified,false);
});
test('two genuinely different paid totals remain unresolved rather than accepted',()=>{
 const r=combineReceiptPasses([
  {kind:'normal',text:'Gesamt EUR 615,00\nMasterCard EUR 615,00'},
  {kind:'payment',text:'Gesamt EUR 619,00\nMasterCard EUR 619,00'}
 ]);
 assert.equal(r.amount,null);
 assert.equal(r.amountConflict,true);
 assert.equal(r.evidenceSuggestion,false);
});
