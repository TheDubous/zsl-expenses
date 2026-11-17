/**
 * Adaptive, bounded OCR quality strategy. Pure functions make the decisions
 * testable without Tesseract or a browser.
 * Budgets stop scheduling NEW passes. A running Tesseract pass cannot be
 * interrupted safely on iOS, so these are soft limits rather than deadlines.
 */
const CONFIG={
 fast:{maxPasses:2,budgetMs:30000},
 precise:{maxPasses:4,budgetMs:60000},
 max:{maxPasses:6,budgetMs:90000}
};
export function ocrConfig(mode='max'){
 return CONFIG[mode]||CONFIG.max;
}
export function isOcrCertain(result){
 if(!result||!result.totalVerified||result.amountConflict||
    !Number(result.amount)||!result.merchant||!result.spent_on)return false;
 if(result.confidence!=='high'||result.merchantConfidence!=='high')return false;
 const winner=result.amountCandidates?.find(v=>v.amount===result.amount);
 // Different image passes must actually contain supporting total/payment
 // labels, not merely repeat an item amount across the same photograph.
 return !!winner?.totalPassNames?.length&&!!winner?.paidPassNames?.length&&
   new Set([...winner.totalPassNames,...winner.paidPassNames]).size>=2;
}

export function chooseOcrPass({mode='max',band=false,passes=[],result=null,elapsedMs=0}={}){
 const done=new Set(passes.map(p=>typeof p==='string'?p:p.kind));
 const conf=ocrConfig(mode);
 if(done.size>=conf.maxPasses||elapsedMs>=conf.budgetMs)return null;
 if(mode==='fast'){
  for(const kind of ['normal','header'])if(!done.has(kind))return kind;
  return null;
 }
 const primary=band?'focused':'normal';
 const secondary=band?'normal':'enhanced';
 if(mode==='max'){
  if(isOcrCertain(result))return null;
  // Full-page, multi-language OCR is expensive on iPhones. Previously the
  // first focused pass followed by two upper-middle crops could consume the
  // entire soft budget before the actual total near the bottom (IMG_8111).
  // Read the full-width gross/payment area FIRST. No paper-band crop or
  // aggressive row-normalization is applied to this pass.
  if(!done.has('totals'))return 'totals';
  if(isOcrCertain(result))return null;
  // Whole image supplies date, merchant and a second independent total read.
  if(!done.has('normal'))return 'normal';
  if(isOcrCertain(result))return null;
  const weakHeader=!result?.merchant||result?.merchantConfidence!=='high'||!result?.spent_on;
  if(weakHeader&&!done.has('header'))return 'header';
  // Different contrast and region can recover a damaged digit at the fold.
  if(!done.has('payment'))return 'payment';
  if(!done.has('bottom'))return 'bottom';
  if(band&&!done.has('focused'))return 'focused';
  if(!done.has('middle'))return 'middle';
  if(!done.has('enhanced'))return 'enhanced';
  if(!done.has('header'))return 'header';
  return null;
 }
 // Keep the original faster/precise schedules unchanged.
 if(!done.has(primary))return primary;
 if(!done.has(secondary))return secondary;
 if(isOcrCertain(result))return null;
 const weakAmount=!Number(result?.amount)||result?.confidence!=='high';
 const weakMerchant=!result?.merchant||result?.merchantConfidence!=='high';
 if(weakAmount&&!done.has('middle'))return 'middle';
 if(weakAmount&&!done.has('bottom')&&done.has('middle'))return 'bottom';
 if(weakMerchant&&!done.has('header'))return 'header';
 if(!done.has('enhanced'))return 'enhanced';
 if(!done.has('bottom'))return 'bottom';
 if(!done.has('header'))return 'header';
 if(!done.has('soft'))return 'soft';
 return null;
}
export function maxOcrPasses(mode='max'){return ocrConfig(mode).maxPasses}
