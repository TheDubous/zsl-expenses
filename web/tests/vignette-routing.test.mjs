import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isMotorwayVignette,recommendedZslSection,buildTemplatePatches,receiptItemLabel} from '../src/zsl-template-map.mjs';
import {expenseSection,makeZslReport} from '../src/zsl-report.mjs';

const trip={currency:'EUR'};
const vignette={
 id:'vignette-8115',category:'travel',zsl_section:'transport',
 merchant:'Serways',spent_on:'2026-11-06',amount:12.8,
 receipt_path:'original-receipt',payment_method:'cash',
 ocr:{rawText:'Serways\nVignette A10T KFZ bis 3,5 12,80 E\nBezahlt 12,80€'}
};

test('motorway vignette routes to INÉ even when its old saved section is transport',()=>{
 assert.equal(isMotorwayVignette(vignette),true);
 assert.equal(receiptItemLabel(vignette),'Diaľničná známka A10');
 assert.equal(recommendedZslSection(vignette,trip),'other');
 assert.equal(expenseSection(vignette,trip),'other');
 const prepared=buildTemplatePatches({event:trip,expenses:[vignette],variant:'official'});
 assert.equal(prepared.skipped.length,0);
 assert.ok(prepared.patches.some(p=>p.group==='receipt:vignette-8115'&&p.cell==='C49'&&p.value.includes('Diaľničná známka')));
 assert.ok(prepared.patches.some(p=>p.group==='receipt:vignette-8115'&&p.cell==='F49'&&p.value===12.8));
 assert.equal(prepared.patches.some(p=>p.group==='receipt:vignette-8115'&&p.cell==='I6'),false);
});
test('old records with only saved item label still route vignette to other',()=>{
 const old={...vignette,ocr:null,itemLabel:'Dálniční známka A10'};
 assert.equal(isMotorwayVignette(old),true);
 assert.equal(recommendedZslSection(old,trip),'other');
 assert.equal(expenseSection(old,trip),'other');
});
test('financial preview uses same vignette section as Excel',()=>{
 const report=makeZslReport({event:trip,expenses:[vignette]});
 assert.equal(report.sections.find(x=>x.id==='other').total,12.8);
 assert.equal(report.sections.find(x=>x.id==='transport').total,0);
 assert.equal(report.settlement.find(x=>x.id==='travel').amount,0);
 assert.equal(report.settlement.find(x=>x.id==='other').amount,12.8);
});
test('ordinary transport and fuel remain in their previous sections',()=>{
 const taxi={...vignette,id:'taxi',itemLabel:'Taxi',ocr:{rawText:'Taxi service'},zsl_section:''};
 const diesel={...vignette,id:'diesel',category:'fuel',itemLabel:'Diesel',ocr:{rawText:'DIESEL'},zsl_section:'private_car'};
 assert.equal(recommendedZslSection(taxi,trip),'transport');
 assert.equal(expenseSection(taxi,trip),'transport');
 assert.equal(recommendedZslSection(diesel,trip),'zsl_car');
 assert.equal(expenseSection(diesel,trip),'zsl_car');
});
