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
      if(!Number.isFinite(key)||key<=0)continue;
      let item=amountMap.get(key);
      if(!item){
        item={...option,score:0,passNames:[],totalPassNames:[],paidPassNames:[]};
        amountMap.set(key,item);
      }
      item.score=Math.max(item.score,option.score);
      item.isTotal=!!(item.isTotal||option.isTotal);
      item.isPaid=!!(item.isPaid||option.isPaid);
      item.explicitTotal=!!(item.explicitTotal||option.explicitTotal);
      if(!item.passNames.includes(entry.kind))item.passNames.push(entry.kind);
      if(option.explicitTotal&&!item.totalPassNames.includes(entry.kind))item.totalPassNames.push(entry.kind);
      if(option.paidLine&&!item.paidPassNames.includes(entry.kind))item.paidPassNames.push(entry.kind);
    }
  }
  const hasPrintedEvidence=x=>!!(x?.totalPassNames?.length||x?.paidPassNames?.length);
  // Repetition of an item price must never outweigh a clearly labelled grand
  // total or card/cash payment. OCR passes are NOT independent receipts.
  const amounts=[...amountMap.values()].map(x=>({
    ...x,score:x.score+3*(x.passNames.length-1)+
      9*x.totalPassNames.length+7*x.paidPassNames.length
  })).sort((a,b)=>
    Number(hasPrintedEvidence(b))-Number(hasPrintedEvidence(a))||
    b.score-a.score||b.amount-a.amount).slice(0,8);
  const best=amounts[0]||null;
  const merchant=merchants[0]||null;
  const merchantConflict=!!(merchant&&merchants[1]&&
    merchants[1].score>=merchant.score-4&&
    compactText(merchants[1].name)!==compactText(merchant.name));
  // Only a competing printed total/payment can create an amount conflict.
  // Item prices, tax, change and partial reads are not other grand totals.
  const amountConflict=!!(best&&amounts.some(x=>x.amount!==best.amount&&
    hasPrintedEvidence(x)&&(
      x.score>=best.score-8 ||
      // A payment different from the printed total is a real contradiction
      // even if the other number appeared in many more OCR passes.
      (x.paidPassNames.length>0&&best.totalPassNames.length>0) ||
      (x.totalPassNames.length>0&&best.paidPassNames.length>0) ||
      (x.totalPassNames.length>0&&best.totalPassNames.length>0&&
       x.score>=best.score-16)
    )));
  const verifiedTotal=!!(best&&best.totalPassNames.length&&best.paidPassNames.length&&
    new Set([...best.totalPassNames,...best.paidPassNames]).size>=2&&!amountConflict);
  const amountConfidence=!best||!hasPrintedEvidence(best)||amountConflict?'low':
    verifiedTotal?'high':'medium';
  const merchantConfidence=!merchant||merchant.score<24?'low':merchantConflict?'low':merchant.score>=47?'high':'medium';
  // If two supplier guesses compete, do not silently select either.
  const topMerchant=merchant&&!merchantConflict&&merchant.score>=24?merchant.name:null;
  function fromWhole(key,fallback){
    return whole.map(x=>x.parsed[key]).find(x=>x&&x!==fallback)||fallback;
  }
  const rawText=whole.map(x=>x.parsed.rawText).filter(Boolean).join('\n\n--- další průchod OCR ---\n\n').slice(0,16000);
  return {
    amount:best?.score>=7&&hasPrintedEvidence(best)&&!amountConflict?best.amount:null,
    totalVerified:verifiedTotal,amountConflict,
    amountCandidates:amounts,
    confidence:amountConfidence,
    merchant:topMerchant,merchantCandidates:merchants,merchantConfidence,
    spent_on:fromWhole('spent_on',null)||reads.filter(x=>x.kind==='header').map(x=>x.parsed.spent_on).find(Boolean)||null,
    category:fromWhole('category','other'),
    payment_method:fromWhole('payment_method','unknown'),
    rawText,
    scannedPasses:reads.map(x=>x.kind),
    needsReview:true
  };
}
