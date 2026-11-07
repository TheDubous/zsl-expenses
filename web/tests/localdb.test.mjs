import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
const m=await import('../src/localdb.js');

test('lokalni uloziste uchovava uctenku a pozdeji platebni potvrzeni',async()=>{
  const image=new Blob(['test-obrazek'],{type:'image/jpeg'});
  image.name='uctenka.jpg';
  const e=await m.addReceipt('event-100',image);
  assert.ok(e.receipt_path);
  const receipt=await m.getOne('documents',e.receipt_path);
  assert.equal(receipt.kind,'receipt');
  assert.equal(await receipt.blob.text(),'test-obrazek');
  await m.saveExpense({...e,merchant:'Slovnaft',amount:132.34,payment_method:'card',category:'fuel'});
  const after=await m.getOne('expenses',e.id);
  assert.equal(after.category,'fuel');
  const bank=new Blob(['bankovni-potvrzeni'],{type:'application/pdf'});
  bank.name='banka.pdf';
  await m.setBankConfirmation(after,bank);
  const linked=await m.getOne('expenses',e.id);
  assert.ok(linked.bank_path);
  const doc=await m.getOne('documents',linked.bank_path);
  assert.equal(await doc.blob.text(),'bankovni-potvrzeni');
  const backup=await m.snapshot();
  assert.equal(backup.expenses.length,1);
  assert.equal(backup.documents.length,2);
  await m.restoreAll(backup);
  assert.equal((await m.getOne('expenses',e.id)).bank_path,linked.bank_path);
  const out=await m.getOne('documents',linked.bank_path);
  assert.equal(await out.blob.text(),'bankovni-potvrzeni');
  await m.deleteExpense(linked);
  assert.equal(await m.getOne('documents',linked.bank_path),undefined);
});
