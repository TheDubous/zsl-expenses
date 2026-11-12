// PDF invoices may use CZK while the ZSL workbook uses EUR. Never treat
// 1,469 CZK as 1,469 EUR. Store original invoice amount separately and only
// include an explicit EUR conversion in the accounting sum.
export function requiresCurrencyConversion(expense,eventCurrency='EUR'){
 const source=String(expense?.sourceCurrency||'').toUpperCase();
 return !!(Number(expense?.sourceAmount)>0&&source&&source!==eventCurrency);
}
export function isCurrencyConversionPending(expense,eventCurrency='EUR'){
 return requiresCurrencyConversion(expense,eventCurrency)&&
  (!expense.conversionConfirmed||!(Number(expense.amount)>0));
}
export function mergeRecognizedExpense(expense,found,eventCurrency='EUR',{rescan=false}={}){
 const sourceCurrency=found.sourceCurrency||null;
 const sourceAmount=Number(found.sourceAmount||0)>0?Number(found.sourceAmount):null;
 const conversionRequired=!!(sourceCurrency&&sourceAmount&&sourceCurrency!==eventCurrency);
 const priorConfirmed=rescan&&!!expense.conversionConfirmed&&Number(expense.amount)>0;
 const amount=conversionRequired?(priorConfirmed?Number(expense.amount):0):
  rescan&&Number(expense.amount)>0?Number(expense.amount):Number(found.amount||0);
 const label=found.itemLabel||expense.itemLabel||'';
 return {
  ...expense,
  amount,sourceAmount,sourceCurrency,
  conversionConfirmed:conversionRequired?priorConfirmed:!!(sourceAmount&&sourceCurrency===eventCurrency),
  merchant:rescan&&expense.ocr?.reviewed?expense.merchant||found.merchant||'':found.merchant||expense.merchant||'',
  spent_on:found.spent_on||expense.spent_on,
  category:rescan&&expense.category!=='other'?expense.category:found.category||expense.category,
  payment_method:rescan&&expense.payment_method!=='unknown'?expense.payment_method:found.payment_method||'unknown',
  itemLabel:rescan&&expense.itemLabel?expense.itemLabel:label,
  ocr:{
   confidence:found.confidence,merchantConfidence:found.merchantConfidence,
   merchantCandidates:found.merchantCandidates||[],amountCandidates:found.amountCandidates||[],
   scannedPasses:found.scannedPasses||[],ocrLanguage:found.ocrLanguage,
   ocrMode:found.ocrMode,receiptCropDetected:!!found.receiptCropDetected,
   pdfPages:found.pdfPages||null,pdfTotalPage:found.pdfTotalPage||null,
   rawText:found.rawText||'',reviewed:false,
   autoReady:!conversionRequired&&found.confidence==='high'&&found.merchantConfidence==='high'&&
    Number(found.amount)>0&&!!found.merchant&&!!found.spent_on,
   scannedAt:new Date().toISOString()
  }
 };
}
