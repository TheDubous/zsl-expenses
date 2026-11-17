// PDF invoices may use CZK while the ZSL workbook uses EUR. Never treat
// 1,469 CZK as 1,469 EUR. Store original invoice amount separately and only
// include an explicit EUR conversion in the accounting sum.
export function requiresCurrencyConversion(expense,eventCurrency='EUR'){
 const source=String(expense?.sourceCurrency||'').toUpperCase();
 return !!(Number(expense?.sourceAmount)>0&&(!source||source!==eventCurrency));
}
export function isCurrencyConversionPending(expense,eventCurrency='EUR'){
 return requiresCurrencyConversion(expense,eventCurrency)&&
  (!expense.conversionConfirmed||!(Number(expense.amount)>0));
}
export function originalAmountDisplay(expense){
 const n=Number(expense?.sourceAmount||0);
 const unit=String(expense?.sourceCurrency||'');
 if(!unit)return n.toFixed(2)+' (měna nerozpoznána)';
 try{return new Intl.NumberFormat('cs-CZ',{style:'currency',currency:unit,maximumFractionDigits:2}).format(n)}
 catch{return n.toFixed(2)+' '+unit}
}
export function mergeRecognizedExpense(expense,found,eventCurrency='EUR',{rescan=false}={}){
 const sourceCurrency=found.sourceCurrency||(rescan?expense.sourceCurrency:null)||null;
 const sourceAmount=Number(found.sourceAmount||0)>0?Number(found.sourceAmount):
  rescan&&Number(expense.sourceAmount||0)>0?Number(expense.sourceAmount):null;
 const conversionRequired=!!(sourceAmount&&(!sourceCurrency||sourceCurrency!==eventCurrency));
 const previousAmount=Number(expense.amount||0);
 const recognizedAmount=Number(found.amount||0);
 const manuallyReviewed=!!(rescan&&expense.ocr?.reviewed);
 // Native photo OCR must verify printed total and payment independently.
 // Text-based PDFs keep their existing accounting verification workflow.
 const photoEvidenceRequired=!!found.ocrMode&&!found.pdfPages;
 const safeForAuto=(!photoEvidenceRequired||found.ocrVerified===true)&&!found.amountConflict&&!found.arithmeticSuggestion;
 const priorConfirmed=!!(rescan&&expense.conversionConfirmed&&previousAmount>0);
 // The old rescan code always retained a nonzero amount, including an
 // incorrect automatic reading. Trust a new recognized total unless the user
 // has manually reviewed it; never replace a previous amount with a low-
 // confidence guess or an unresolved conflict.
 const amount=conversionRequired?(priorConfirmed?previousAmount:0):
  manuallyReviewed&&previousAmount>0?previousAmount:
  rescan&&previousAmount>0&&(!recognizedAmount||found.confidence==='low')?previousAmount:
  recognizedAmount;
 const label=found.itemLabel||expense.itemLabel||'';
 return {
  ...expense,
  scanError:null,
  amount,sourceAmount,sourceCurrency,
  conversionConfirmed:conversionRequired?priorConfirmed:!!(sourceAmount&&sourceCurrency===eventCurrency),
  merchant:manuallyReviewed?expense.merchant||found.merchant||'':found.merchant||expense.merchant||'',
  spent_on:manuallyReviewed&&expense.spent_on?expense.spent_on:found.spent_on||expense.spent_on,
  category:rescan&&expense.category!=='other'?expense.category:found.category||expense.category,
  payment_method:rescan&&expense.payment_method!=='unknown'?expense.payment_method:found.payment_method||'unknown',
  itemLabel:rescan&&expense.itemLabel?expense.itemLabel:label,
  ocr:{
   confidence:found.confidence,merchantConfidence:found.merchantConfidence,
   ocrVerified:photoEvidenceRequired?found.ocrVerified===true:null,
   amountConflict:!!found.amountConflict,arithmeticSuggestion:!!found.arithmeticSuggestion,
   evidenceSuggestion:!!found.evidenceSuggestion,
   merchantCandidates:found.merchantCandidates||[],amountCandidates:found.amountCandidates||[],
   scannedPasses:found.scannedPasses||[],attemptedPasses:found.attemptedPasses||[],
   passDiagnostics:found.passDiagnostics||[],failedPasses:found.failedPasses||[],
   ocrDurationMs:found.ocrDurationMs||null,ocrLanguage:found.ocrLanguage,
   ocrMode:found.ocrMode,receiptCropDetected:!!found.receiptCropDetected,
   pdfPages:found.pdfPages||null,pdfTotalPage:found.pdfTotalPage||null,
   rawText:found.rawText||'',reviewed:manuallyReviewed,
   autoReady:!manuallyReviewed&&!conversionRequired&&safeForAuto&&found.confidence==='high'&&found.merchantConfidence==='high'&&
    recognizedAmount>0&&!!found.merchant&&!!found.spent_on,
   scannedAt:new Date().toISOString()
  }
 };
}
