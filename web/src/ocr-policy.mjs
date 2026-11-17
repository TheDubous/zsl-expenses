/**
 * Adaptive, bounded OCR quality strategy. Pure functions make the decisions
 * testable without Tesseract or a browser.
 * Budgets stop scheduling NEW passes. A running Tesseract pass cannot be
 * interrupted safely on iOS, so these are soft limits rather than deadlines.
 */
const CONFIG={
 fast:{maxPasses:2,budgetMs:30000},
 precise:{maxPasses:4,budgetMs:60000},
 max:{maxPasses:5,budgetMs:75000}
};
export function ocrConfig(mode='max'){
 return CONFIG[mode]||CONFIG.max;
}
export function isOcrCertain(result){
 if(!result||!Number(result.amount)||Number(result.amount)<=0||!result.merchant||!result.spent_on)return false;
 if(result.confidence!=='high'||result.merchantConfidence!=='high')return false;
 const winner=result.amountCandidates?.find(v=>v.amount===result.amount);
 // A confidently printed single total can still be an OCR typo. Require
 // agreement across genuinely different raster treatments before stopping.
 return !!winner?.isTotal&&new Set(winner?.passNames||[]).size>=2;
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
 if(!done.has(primary))return primary;
 if(!done.has(secondary))return secondary;
 if(isOcrCertain(result))return null;
 // Use targeted regions before extra full-page reads. A bottom scan is much
 // cheaper for "Summe" or "Celkem"; a header scan helps fuzzy vendor names.
 const weakAmount=!Number(result?.amount)||result?.confidence!=='high';
 const weakMerchant=!result?.merchant||result?.merchantConfidence!=='high';
 if(weakAmount&&!done.has('middle'))return 'middle';
 if(weakAmount&&!done.has('bottom')&&done.has('middle'))return 'bottom';
 if(weakMerchant&&!done.has('header'))return 'header';
 // Date missing or disagreement: try a differently contrasted full receipt.
 if(!done.has('enhanced'))return 'enhanced';
 if(mode==='max'&&!done.has('bottom'))return 'bottom';
 if(mode==='max'&&!done.has('header'))return 'header';
 if(mode==='max'&&!done.has('soft'))return 'soft';
 return null;
}
export function maxOcrPasses(mode='max'){return ocrConfig(mode).maxPasses}
