import {test} from 'node:test';
import assert from 'node:assert/strict';
import {printedReceiptNumber,suspiciousReceiptGroups} from '../src/export-preflight.mjs';
import {buildTemplatePatches,exportExpenseReadiness} from '../src/zsl-template-map.mjs';

const event={currency:'EUR'};
const expense=(id,extra={})=>({
 id,merchant:'Pitztaler Gletscherbahn',spent_on:'2026-11-03',
 amount:650,category:'resort',itemLabel:'Poplatok za trať',
 receipt_path:'receipt-'+id,payment_method:'card',ocr:{reviewed:true},
 ...extra
});
test('the screenshot scenario: two 650-euro Pitztal entries on the same date are flagged',()=>{
 const receipts=[expense('p1'),expense('p2'),expense('g1',{
   merchant:'Gutmann',amount:127.78,category:'fuel',itemLabel:'Diesel'
 })];
 const groups=suspiciousReceiptGroups(receipts);
 assert.equal(groups.length,1);
 assert.deepEqual(groups[0].ids,['p1','p2']);
 assert.equal(groups[0].amount,650);
 assert.equal(groups[0].strong,false);
 // A warning must NOT silently drop potentially legitimate separate invoices.
 const exportPlan=buildTemplatePatches({event,trainer:{},expenses:receipts,variant:'official'});
 assert.equal(exportPlan.skipped.length,0);
 assert.equal(exportPlan.patches.some(x=>x.group==='receipt:p1'&&x.value===650),true);
 assert.equal(exportPlan.patches.some(x=>x.group==='receipt:p2'&&x.value===650),true);
});
test('same printed Verkaufsbeleg Nr is a strong duplicate even if scan filenames differ',()=>{
 const repeated=[
   expense('original',{ocr:{rawText:'Verkaufsbeleg Nr. 27510\nPISTEN GEB 650,00'}}),
   expense('copy',{ocr:{rawText:'Verkaufsbeleg Nr. 27510\nGesamt EUR 650,00'},distinctPurchaseConfirmed:true})
 ];
 assert.equal(printedReceiptNumber(repeated[0]),'27510');
 const groups=suspiciousReceiptGroups(repeated);
 assert.equal(groups.length,1);
 assert.equal(groups[0].strong,true);
 assert.match(groups[0].reason,/27510/);
});
test('two separate numbered receipts with same vendor, day, amount are not automatically duplicates',()=>{
 const rows=[
  expense('a',{ocr:{rawText:'Verkaufsbeleg Nr. 27510'}}),
  expense('b',{ocr:{rawText:'Verkaufsbeleg Nr. 27511'}})
 ];
 assert.deepEqual(suspiciousReceiptGroups(rows),[]);
});
test('confirmed independent purchase suppresses only weak duplicate warning',()=>{
 const rows=[expense('a'),expense('b',{distinctPurchaseConfirmed:true})];
 assert.deepEqual(suspiciousReceiptGroups(rows),[]);
});
test('unconfirmed OCR amounts are included without mandatory approval, with visible OCR warnings',()=>{
 const e=expense('review',{amount:615,ocr:{reviewed:false,amountConflict:true,autoReady:false}});
 const status=exportExpenseReadiness(e,event);
 assert.equal(status.canExport,true);
 assert.match(status.warnings.join(' '),/neověřeného nebo rozporného OCR/);
 const plan=buildTemplatePatches({event,trainer:{},expenses:[e],variant:'official'});
 assert.equal(plan.skipped.length,0);
 assert.ok(plan.patches.some(p=>p.group==='receipt:review'&&p.cell==='H49'&&p.value===615));
 const cleared={...e,ocr:{...e.ocr,reviewed:true}};
 const reviewed=exportExpenseReadiness(cleared,event);
 assert.equal(reviewed.canExport,true);
 assert.ok(reviewed.warnings.some(x=>/bankovní potvrzení/.test(x)));
});
test('food remains unassigned until traveler chooses correct ZSL reimbursement section',()=>{
 const food={...expense('food'),merchant:'INTERSPAR',amount:55.84,
  category:'food',itemLabel:'Potraviny'};
 const r=exportExpenseReadiness(food,event);
 assert.equal(r.canExport,false);
 assert.ok(r.issues.some(x=>/zahraniční stravování/.test(x)));
 assert.equal(exportExpenseReadiness({...food,zsl_section:'foreign_meal'},event).canExport,true);
});
