import {parseReceiptText,compactText} from './receipt-parse.mjs';
import {receiptMathEvidence} from './receipt-math.mjs';

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
        item={...option,score:0,passNames:[],totalPassNames:[],paidPassNames:[],grossPassNames:[],mathEvidence:[]};
        amountMap.set(key,item);
      }
      item.score=Math.max(item.score,option.score);
      item.isTotal=!!(item.isTotal||option.isTotal);
      item.isPaid=!!(item.isPaid||option.isPaid);
      item.explicitTotal=!!(item.explicitTotal||option.explicitTotal);
      if(!item.passNames.includes(entry.kind))item.passNames.push(entry.kind);
      if(option.explicitTotal&&!item.totalPassNames.includes(entry.kind))item.totalPassNames.push(entry.kind);
      if(option.paidLine&&!item.paidPassNames.includes(entry.kind))item.paidPassNames.push(entry.kind);
      if(option.taxRowGross&&!item.grossPassNames.includes(entry.kind))item.grossPassNames.push(entry.kind);
    }
    // A mathematical amount can be recovered even if OCR lost the word
    // "Gesamt" or misread one of its digits; preserve it as a proposal.
    for(const proof of receiptMathEvidence(entry.text)){
      const key=Number(proof.amount);
      let item=amountMap.get(key);
      if(!item){
        item={amount:key,score:7,passNames:[],totalPassNames:[],
          paidPassNames:[],grossPassNames:[],mathEvidence:[],
          isTotal:false,isPaid:false,explicitTotal:false};
        amountMap.set(key,item);
      }
      if(!item.mathEvidence.some(x=>x.kind===proof.kind&&x.pass===entry.kind))
        item.mathEvidence.push({kind:proof.kind,pass:entry.kind});
    }
  }
  const hasPrintedEvidence=x=>!!(x?.totalPassNames?.length||x?.paidPassNames?.length);
  // Repetition of an item price must never outweigh a clearly labelled grand
  // total or card/cash payment. OCR passes are NOT independent receipts.
  const allAmounts=[...amountMap.values()].map(x=>({
    ...x,score:x.score+3*Math.max(0,x.passNames.length-1)+
      9*x.totalPassNames.length+7*x.paidPassNames.length
  }));
  // If a readable VAT row gives a reconciled gross value, that is stronger
  // evidence than a conflicting OCR digit on a labelled total elsewhere.
  // This is arithmetic on THIS receipt, not a remembered vendor/price.
  // Competing, independently reconciled gross values remain unresolved.
  // Distinct calculations must agree. A second contradictory proof is a
  // real ambiguity; never auto-select the top-scored number in that case.
  // A sum of *visible* line items is not proof that ALL receipt items were
  // recognized. OCR of a folded Steinblock receipt read two rows correctly
  // but omitted the third: 76.80 + 21.00 = 97.80, NOT the paid 111.60.
  // Another scan similarly yielded 69.20 rather than 96.80.
  // VAT reconciliation is a stronger check than a potentially partial table.
  const vatEvidence=x=>x.grossPassNames.length>0||
    x.mathEvidence.some(p=>p.kind==='vat-columns'||p.kind==='vat-rate');
  const strongMath=allAmounts.filter(vatEvidence);
  const itemMath=allAmounts.filter(x=>!vatEvidence(x)&&
    x.mathEvidence.some(p=>p.kind==='line-items'));
  const corroboratedGross=strongMath.length===1&&
    strongMath[0].totalPassNames.length>=2&&
    strongMath[0].passNames.length>=3&&
    itemMath.every(x=>strongMath[0].score>=x.score+20);
  // Without a corroborated gross, disagreeing independent calculations
  // still require human review. Partial item sums must NOT override a
  // better-supported printed total/card payment.
  const strongPrinted=allAmounts.some(x=>
    (x.totalPassNames.length>=2||
      (x.totalPassNames.length>0&&x.paidPassNames.length>0))&&
    itemMath.some(v=>v.amount!==x.amount&&x.score>=v.score+20));
  const reconciled=corroboratedGross?strongMath:
    strongMath.length?[...strongMath,...itemMath]:
    strongPrinted?itemMath.filter(x=>x.totalPassNames.length>0||x.paidPassNames.length>0):
    itemMath;
  const arithmeticWinner=reconciled.length===1?reconciled[0]:null;
  const competingMath=reconciled.length>1;
  const amounts=allAmounts.sort((a,b)=>
    Number(b===arithmeticWinner)-Number(a===arithmeticWinner)||
    Number(hasPrintedEvidence(b))-Number(hasPrintedEvidence(a))||
    b.score-a.score||b.amount-a.amount).slice(0,8);
  const best=amounts[0]||null;
  const merchant=merchants[0]||null;
  const merchantConflict=!!(merchant&&merchants[1]&&
    merchants[1].score>=merchant.score-4&&
    compactText(merchants[1].name)!==compactText(merchant.name));
  // Distinguish genuinely competing totals from a *single* obvious OCR
  // error. Previously every alternative, even a tax value supported in one
  // damaged pass, became a conflict whenever mathEvidence existed. That
  // blocked 96.80 (score 120 vs 32) and 111.60 (109 vs 30).
  const isolatedOutlier=x=>!!(arithmeticWinner===best&&
    (best.mathEvidence.length>0||best.grossPassNames.length>0)&&
    best.score>=x.score+25&&best.passNames.length>=3&&
    x.passNames.length<=2&&x.totalPassNames.length<=1&&
    x.paidPassNames.length===0&&x.mathEvidence.length===0);
  const competingPrinted=amounts.filter(x=>best&&x.amount!==best.amount&&
    hasPrintedEvidence(x)&&!isolatedOutlier(x));
  const amountConflict=!!(competingMath||competingPrinted.some(x=>
    x.score>=best.score-8||
    (x.totalPassNames.length>0&&best.totalPassNames.length>0)||
    (x.paidPassNames.length>0&&best.totalPassNames.length>0)||
    (x.totalPassNames.length>0&&best.paidPassNames.length>0)
  ));
  // If several different crops see the same printed grand total while a
  // single noisy crop reads a conflicting total (e.g. 615 vs 619), prefill
  // the well-supported result for human review, never green auto approval.
  const printedAlternatives=competingPrinted.filter(x=>x.totalPassNames.length>0);
  const evidenceSuggestion=!!(!arithmeticWinner&&!competingMath&&amountConflict&&
    best?.totalPassNames.length>0&&best.passNames.length>=3&&
    printedAlternatives.length>0&&
    printedAlternatives.every(x=>x.passNames.length===1&&best.score>=x.score+8));
  const verifiedTotal=!!(best&&best.totalPassNames.length&&best.paidPassNames.length&&
    new Set([...best.totalPassNames,...best.paidPassNames]).size>=2&&!amountConflict);
  // Calculations remain a proposal if they cannot be independently confirmed
  // by printed payment evidence. Accounting export still requires review.
  const arithmeticSuggestion=!!(arithmeticWinner&&best===arithmeticWinner&&!verifiedTotal);
  const supported=!!(best&&(hasPrintedEvidence(best)||best.mathEvidence.length>0));
  const amountConfidence=!supported||competingMath?'low':
    amountConflict?(arithmeticSuggestion||evidenceSuggestion?'medium':'low'):
    verifiedTotal?'high':'medium';
  const merchantConfidence=!merchant||merchant.score<24?'low':merchantConflict?'low':merchant.score>=47?'high':'medium';
  // If two supplier guesses compete, do not silently select either.
  const topMerchant=merchant&&!merchantConflict&&merchant.score>=24?merchant.name:null;
  function fromWhole(key,fallback){
    return whole.map(x=>x.parsed[key]).find(x=>x&&x!==fallback)||fallback;
  }
  const rawText=whole.map(x=>x.parsed.rawText).filter(Boolean).join('\n\n--- další průchod OCR ---\n\n').slice(0,16000);
  return {
    amount:!competingMath&&best?.score>=7&&supported&&
      (!amountConflict||arithmeticSuggestion||evidenceSuggestion)?best.amount:null,
    arithmeticSuggestion,evidenceSuggestion,totalVerified:verifiedTotal,amountConflict,
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
