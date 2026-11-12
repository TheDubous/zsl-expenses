import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePdfReceiptPages} from '../src/pdf-receipt-parse.mjs';
import {mergeRecognizedExpense,isCurrencyConversionPending} from '../src/receipt-import.mjs';
import {exportExpenseReadiness,receiptItemLabel} from '../src/zsl-template-map.mjs';
import {expenseStatus,summarize} from '../src/utils.mjs';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {recognizePdf} from '../src/pdf-reader.js';

const pages=[
  [
   'JÍZDENKA / FAHRSCHEIN','Platí/Gültig: 01.11.2026-02.11.2026',
   'PRAHA -> POPRAD-TATRY','Cena     971 Kč',
   'Price 39 EUR','Jízdenka 971 Kč','Celkem 971 Kč',
   'Datum vystavení/datum platby: 31.10.2026 21:46 Platba: KARTOU/CC',
   'Prodejce: České dráhy, a.s.'
  ].join('\n'),
  [
   'REZERVACE / RESERVIERUNG','EuroNight',
   'Praha hl.n. Poprad-Tatry','Cena 498 Kč','Price 20 EUR',
   'Rezervace 498 Kč','Celkem 498 Kč',
   'Datum vystavení/datum platby: 31.10.2026 21:46 Platba: KARTOU/CC',
   'Prodejce: České dráhy, a.s.'
  ].join('\n'),
  [
   'ZJEDNODUŠENÝ DAŇOVÝ DOKLAD','Dodavatel: České dráhy, a.s.',
   'Předmět Počet Sazba DPH Cena bez DPH DPH Cena vč. DPH',
   '(Kč) (Kč) (Kč)',
   'Mezinárodní jízdenka 1 971 0 971',
   'Mezinárodní rezervace 1 498 0 498',
   'Celkem                                  1469',
   'Datum vystavení/DUZP: 31.10.2026'
  ].join('\n')
];
test('PDF multi-page rail invoice uses 1469 CZK final tax total, not 971+498+39+20',()=>{
 const r=parsePdfReceiptPages(pages);
 assert.equal(r.sourceAmount,1469);
 assert.equal(r.sourceCurrency,'CZK');
 assert.equal(r.merchant,'České dráhy, a.s.');
 assert.equal(r.spent_on,'2026-10-31');
 assert.equal(r.payment_method,'card');
 assert.equal(r.category,'travel');
 assert.equal(r.itemLabel,'Vlaková jízdenka + rezervace');
 assert.equal(r.pdfTotalPage,3);
 assert.equal(r.pdfPages,3);
 assert.equal(r.confidence,'high');
 assert.ok(r.amountCandidates.some(x=>x.amount===971&&x.currency==='CZK'));
 assert.ok(r.amountCandidates.some(x=>x.amount===498&&x.currency==='CZK'));
});
test('converted EUR must be provided before a 1469 CZK ticket can appear in ZSL costs',()=>{
 const found=parsePdfReceiptPages(pages);
 const base={id:'1',receipt_path:'file1',receipt_name:'T204248431.pdf',spent_on:'2026-11-01',amount:0,category:'other',payment_method:'unknown'};
 const expense=mergeRecognizedExpense(base,found,'EUR');
 assert.equal(expense.sourceAmount,1469);
 assert.equal(expense.sourceCurrency,'CZK');
 assert.equal(expense.amount,0);
 assert.equal(receiptItemLabel(expense),'Vlaková jízdenka + rezervace');
 assert.equal(isCurrencyConversionPending(expense,'EUR'),true);
 assert.equal(expenseStatus(expense),'Doplnit přepočet EUR');
 assert.equal(summarize([expense],[]).spent,0);
 const readiness=exportExpenseReadiness(expense,{currency:'EUR'});
 assert.equal(readiness.canExport,false);
 assert.ok(readiness.issues.some(x=>x.includes('CZK')));
 const converted={...expense,amount:59.12,conversionConfirmed:true};
 assert.equal(isCurrencyConversionPending(converted,'EUR'),false);
 assert.equal(summarize([converted],[]).spent,59.12);
 assert.equal(exportExpenseReadiness(converted,{currency:'EUR'}).canExport,true);
 const rescanned=mergeRecognizedExpense(converted,found,'EUR',{rescan:true});
 assert.equal(rescanned.amount,59.12);
 assert.equal(rescanned.conversionConfirmed,true);
});
test('PDF with only page prices must not invent an additional summed total',()=>{
 const result=parsePdfReceiptPages(pages.slice(0,2));
 assert.equal(result.sourceAmount,null); // no aggregate tax receipt: avoid inventing a final amount
 assert.equal(result.sourceCurrency,null);
 assert.equal(result.pdfPages,2);
 assert.equal(result.pdfHasInvoice,false);
 assert.equal(result.needsReview,true);
});
test('empty text PDF is not fabricated as a zero price',()=>{
 const r=parsePdfReceiptPages(['','']);
 assert.equal(r.sourceAmount,null);
 assert.equal(r.sourceCurrency,null);
 assert.equal(r.needsReview,true);
});
test('pdf.js extracts text across real synthesized PDF pages, including distant invoice total',async()=>{
 const doc=await PDFDocument.create();
 const font=await doc.embedFont(StandardFonts.Helvetica);
 const drawPage=lines=>{
  const page=doc.addPage([595,842]);
  lines.forEach((line,i)=>page.drawText(line,{font,size:11,x:40,y:790-i*25}));
  return page;
 };
 drawPage(['JIZDENKA','Cena 971 Kc','Price 39 EUR','Celkem 971 Kc','Datum vystaveni/datum platby: 31.10.2026 21:46 Platba: KARTOU/CC']);
 drawPage(['REZERVACE','Cena 498 Kc','Price 20 EUR','Celkem 498 Kc','Prodejce: Ceske drahy, a.s.']);
 const invoice=drawPage(['ZJEDNODUSENY DANOVY DOKLAD','Ceske drahy, a.s.','Cena vc. DPH (Kc)','Celkem','Datum vystaveni/DUZP: 31.10.2026']);
 invoice.drawText('1469',{font,size:11,x:480,y:790-3*25});
 const bytes=await doc.save();
 const engine=await import('pdfjs-dist/legacy/build/pdf.mjs');
 engine.GlobalWorkerOptions.workerSrc=new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',import.meta.url).href;
 const result=await recognizePdf(new Blob([bytes],{type:'application/pdf'}),{
  pdfEngine:engine,ocrSessionFactory:()=>{throw Error('text-based PDF should never require OCR')}
 });
 assert.equal(result.pdfPages,3);
 assert.equal(result.sourceAmount,1469);
 assert.equal(result.sourceCurrency,'CZK');
 assert.equal(result.spent_on,'2026-10-31');
 assert.equal(result.merchant,'České dráhy, a.s.');
});
