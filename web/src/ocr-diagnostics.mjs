/**
 * On-device OCR diagnostics. An explicit user action exports this JSON.
 * Never uploads anything and never includes photographs or bank attachments.
 *
 * Redaction is best-effort: names and addresses in printed receipts may remain.
 * Users should inspect the file before sharing.
 */
export const OCR_DIAGNOSTIC_FORMAT='zsl-expenses-ocr-diagnostic';
export const OCR_DIAGNOSTIC_VERSION=1;

export function redactOcrText(text){
 return String(text??'')
   .replace(/\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]{3,5}){3,8}\b/gi,'[IBAN]')
   .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[E-MAIL]')
   // Mask long card, invoice and identifier sequences without masking
   // monetary amounts such as 615,00 or receipt dates such as 03.11.2026.
   .replace(/(?:^|[^\d.,])((?:\d[ -]?){12,19})(?=$|[^\d.,])/g,
      (whole,value)=>whole.replace(value,'[DLOUHÉ ČÍSLO]'))
   .replace(/\b(?:tel(?:efon)?|phone|mobil|mobile)\s*[:.]?\s*(?:\+?\d[\d ()-]{7,}\d)/gi,
      '[TELEFON]');
}

export function buildOcrDiagnostic(expense={}){
 const ocr=expense.ocr||{};
 const passes=(Array.isArray(ocr.passDiagnostics)?ocr.passDiagnostics:[]).map(pass=>({
   kind:String(pass.kind||'unknown').slice(0,40),
   ocrConfidence:Number.isFinite(Number(pass.ocrConfidence))?Number(pass.ocrConfidence):null,
   durationMs:Number.isFinite(Number(pass.durationMs))?Number(pass.durationMs):null,
   text:redactOcrText(pass.text).slice(0,12000)
 }));
 const amountCandidates=(Array.isArray(ocr.amountCandidates)?ocr.amountCandidates:[])
    .map(c=>({
      amount:Number(c.amount)||0,
      currency:c.currency||'EUR',
      score:Number.isFinite(Number(c.score))?Number(c.score):null,
      isTotal:!!c.isTotal,explicitTotal:!!c.explicitTotal,
      paidLine:!!c.paidLine,taxRowGross:!!c.taxRowGross,
      passNames:c.passNames||[],totalPassNames:c.totalPassNames||[],
      paidPassNames:c.paidPassNames||[],grossPassNames:c.grossPassNames||[],
      mathEvidence:Array.isArray(c.mathEvidence)?c.mathEvidence:[],
      sourceLine:redactOcrText(c.line).slice(0,220)
    }));
 return {
   format:OCR_DIAGNOSTIC_FORMAT,
   version:OCR_DIAGNOSTIC_VERSION,
   exportedAt:new Date().toISOString(),
   warning:'Soubor neobsahuje fotografii ani bankovní přílohy. Anonymizace není úplná: před sdílením zkontrolujte jména, adresy a další osobní údaje v OCR textu.',
   receipt:{
     merchant:redactOcrText(expense.merchant).slice(0,140),
     spentOn:expense.spent_on||null,
     amount:Number(expense.amount)||null,
     category:expense.category||null,
     paymentMethod:expense.payment_method||null,
     manuallyReviewed:!!ocr.reviewed
   },
   recognition:{
     mode:ocr.ocrMode||null,
     language:ocr.ocrLanguage||null,
     confidence:ocr.confidence||null,
     merchantConfidence:ocr.merchantConfidence||null,
     verified:ocr.ocrVerified===true,
     amountConflict:!!ocr.amountConflict,
     arithmeticSuggestion:!!ocr.arithmeticSuggestion,
     cropDetected:!!ocr.receiptCropDetected,
     durationMs:Number(ocr.ocrDurationMs)||null,
     attemptedPasses:ocr.attemptedPasses||[],
     scannedPasses:ocr.scannedPasses||[],
     failedPasses:(ocr.failedPasses||[]).map(x=>({
       kind:String(x.kind||'unknown'),message:redactOcrText(x.message).slice(0,200)
     })),
     amountCandidates,
     merchantCandidates:(ocr.merchantCandidates||[]).map(x=>({
       name:redactOcrText(x.name).slice(0,160),score:Number(x.score)||null,
       source:x.source||null
     })),
     passes,
     // Fallback for receipts scanned before dedicated per-pass diagnostics.
     rawTextFallback:passes.length?null:redactOcrText(ocr.rawText).slice(0,24000)
   }
 };
}
