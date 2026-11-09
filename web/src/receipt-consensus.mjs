import {parseReceiptText,compactText} from './receipt-parse.mjs';

/**
 * Combine OCR reads from distinct layouts. Header-only text is used for merchant
 * discovery, never for amount/date guessing.
 */
export function combineReceiptPasses(passes){
  if(!Array.isArray(passes)||passes.length===0)return parseReceiptText('');
  const reads=passes.map(pass=>({...pass,parsed:parseReceiptText(pass.text)}));
  const whole=reads.filter(x=>x.kind!=='header');
  const merchantMap=new Map();
  for(const entry of reads){
    for(const option of entry.parsed.merchantCandidates||[]){
      const key=compactText(option.name);
      if(!key)continue;
      let item=merchantMap.get(key);
      if(!item){item={...option,score:0,passCount:0,passNames:[]};merchantMap.set(key,item)}
      const weighted=option.score+(entry.kind==='header'?5:0);
      item.score=Math.max(item.score,weighted);
      item.passCount++;
      item.passNames.push(entry.kind);
    }
  }
  const merchants=[...merchantMap.values()].map(x=>({...x,score:x.score+Math.min(12,6*(x.passCount-1))}))
    .sort((a,b)=>b.score-a.score).slice(0,6);
  const amountMap=new Map();
  for(const entry of whole){
    for(const option of entry.parsed.amountCandidates||[]){
      const key=Number(option.amount);
      if(!Number.isFinite(key))continue;
      let item=amountMap.get(key);
      if(!item){item={...option,score:0,passNames:[]};amountMap.set(key,item)}
      item.score=Math.max(item.score,option.score);
      item.passNames.push(entry.kind);
    }
  }
  const amounts=[...amountMap.values()].map(x=>({...x,score:x.score+6*(x.passNames.length-1)}))
    .sort((a,b)=>b.score-a.score||b.amount-a.amount).slice(0,8);
  const best=amounts[0]||null;
  const second=amounts[1]||null;
  const merchant=merchants[0]||null;
  const merchantConflict=merchants[1]&&merchants[1].score>=merchant.score-4&&compactText(merchants[1].name)!==compactText(merchant.name);
  const amountConflict=second&&second.score>=best.score-3&&second.amount!==best.amount;
  const amountConfidence=!best||best.score<7?'low':amountConflict?'low':best.passNames.length>1||best.score>=18?'high':'medium';
  const merchantConfidence=!merchant||merchant.score<24?'low':merchantConflict?'low':merchant.score>=47?'high':'medium';
  // If two supplier guesses compete, do not silently select either.
  const topMerchant=merchant&&!merchantConflict&&merchant.score>=24?merchant.name:null;
  function fromWhole(key,fallback){
    return whole.map(x=>x.parsed[key]).find(x=>x&&x!==fallback)||fallback;
  }
  const rawText=whole.map(x=>x.parsed.rawText).filter(Boolean).join('\n\n--- další průchod OCR ---\n\n').slice(0,16000);
  return {
    amount:best?.score>=7&&!amountConflict?best.amount:null,
    amountCandidates:amounts,
    confidence:amountConfidence,
    merchant:topMerchant,merchantCandidates:merchants,merchantConfidence,
    spent_on:fromWhole('spent_on',null),
    category:fromWhole('category','other'),
    payment_method:fromWhole('payment_method','unknown'),
    rawText,
    scannedPasses:reads.map(x=>x.kind),
    needsReview:true
  };
}
