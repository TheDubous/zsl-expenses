import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decimal, expenseStatus, summarize } from '../src/utils.mjs';

test('AdBlue and diesel share one fuel category without vehicle split', () => {
  const items=[{ amount: 26.9, category: 'fuel' },{ amount: 132.34, category: 'fuel' }];
  assert.equal(items.filter(x=>x.category==='fuel').reduce((s,x)=>s+x.amount,0).toFixed(2),'159.24');
});
test('payment is incomplete until receipt and matching bank document exist', () => {
  const e={merchant:'Pitztaler',amount:650,payment_method:'card',receipt_path:'u/e/r.jpg'};
  assert.equal(expenseStatus(e),'Chybí potvrzení');
  assert.equal(expenseStatus({...e,bank_path:'u/e/b.pdf'}),'Doklady kompletní');
  assert.equal(expenseStatus({...e,payment_method:'cash'}),'Doklady kompletní');
});
test('advances minus returns minus expenses', () => {
  const t=summarize([{amount:132.34},{amount:26.9}], [{kind:'advance',amount:1000},{kind:'advance',amount:100},{kind:'return',amount:50}]);
  assert.equal(t.deposit,1100);
  assert.equal(t.returned,50);
  assert.equal(t.remaining,890.76);
});
test('Czech decimal input',()=>assert.equal(decimal('1 607,86'),1607.86));

test('high-confidence automatic OCR needs no approval, uncertain reads remain flagged',()=>{
 const e={receipt_path:'receipt1',merchant:'Slovnaft',amount:132.34,payment_method:'cash',ocr:{confidence:'high',merchantConfidence:'high',reviewed:false,autoReady:true}};
 assert.equal(expenseStatus(e),'Doklady kompletní');
 assert.equal(expenseStatus({...e,ocr:{confidence:'low',reviewed:false,autoReady:false}}),'OCR potřebuje kontrolu');
 assert.equal(expenseStatus({...e,ocr:{...e.ocr,reviewed:true}}),'Doklady kompletní');
});
