import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {buildAttachmentsPdf} from '../src/attachments-pdf.js';
test('one separate PDF joins one receipt PDF with its individual bank proof',async()=>{
 const receipt=await PDFDocument.create();receipt.addPage([595,842]);
 const proof=await PDFDocument.create();proof.addPage([595,842]);proof.addPage([595,842]);
 const docs=new Map([
  ['receipt1',{id:'receipt1',type:'application/pdf',name:'receipt1.pdf',blob:new Blob([await receipt.save()],{type:'application/pdf'})}],
  ['proof1',{id:'proof1',type:'application/pdf',name:'proof1.pdf',blob:new Blob([await proof.save()],{type:'application/pdf'})}]
 ]);
 const event={name:'Pitztal',currency:'EUR'};
 const expenses=[{id:'1',merchant:'Shop',amount:26.9,payment_method:'card',receipt_path:'receipt1',receipt_name:'receipt1.pdf',bank_path:'proof1',bank_name:'proof1.pdf'}];
 const out=await buildAttachmentsPdf({event,expenses,documents:async id=>docs.get(id)});
 assert.equal(out.warnings.length,0);
 assert.equal(out.attachmentCount,2);
 const result=await PDFDocument.load(await out.blob.arrayBuffer());
 assert.equal(result.getPageCount(),5); // index, expense cover, receipt, two bank pages
 assert.ok(out.filename.endsWith('.pdf'));
});
test('missing proof is listed explicitly, not silently omitted',async()=>{
 const receipt=await PDFDocument.create();receipt.addPage();
 const docs=new Map([['receipt1',{name:'receipt1.pdf',type:'application/pdf',blob:new Blob([await receipt.save()])}]]);
 const out=await buildAttachmentsPdf({event:{name:'Race'},expenses:[{id:'1',merchant:'Fuel',amount:90,payment_method:'card',receipt_path:'receipt1',bank_path:null}],documents:async id=>docs.get(id)});
 assert.equal(out.warnings.length,1);
 assert.match(out.warnings[0],/chybí BANKOVNI POTVRZENI/);
});
