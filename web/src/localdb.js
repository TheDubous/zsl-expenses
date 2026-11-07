const DB_NAME = 'zsl-expenses-local-v1';
const STORES = ['trainers', 'riders', 'events', 'funding', 'expenses', 'documents'];
let connection;

function openDatabase() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('Tento prohlížeč nepodporuje místní databázi IndexedDB.')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const name of STORES) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); connection = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('Databázi nelze otevřít.'));
    req.onblocked = () => reject(new Error('Zavři další otevřené karty aplikace a zkus to znovu.'));
  }).catch(e => { connection = null; throw e; });
  return connection;
}

function requestDone(request) {
  return new Promise((resolve,reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Operace databáze selhala.'));
  });
}
function transactionDone(tx) {
  return new Promise((resolve,reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Zápis do databáze se nepodařil.'));
    tx.onerror = () => {};
  });
}
export async function getAll(table) {
  const db = await openDatabase();
  return requestDone(db.transaction(table, 'readonly').objectStore(table).getAll());
}
export async function getOne(table,id) {
  const db = await openDatabase();
  return requestDone(db.transaction(table, 'readonly').objectStore(table).get(id));
}
export async function putOne(table, row) {
  const db = await openDatabase(), tx = db.transaction(table, 'readwrite'), done = transactionDone(tx);
  tx.objectStore(table).put(row);
  await done;
  return row;
}
export async function removeOne(table,id) {
  const db = await openDatabase(), tx=db.transaction(table,'readwrite'), done=transactionDone(tx);
  tx.objectStore(table).delete(id);
  await done;
}
export function uid() { return crypto.randomUUID(); }
export async function loadAll() {
  const results=await Promise.all(STORES.filter(x=>x!=='documents').map(getAll));
  return Object.fromEntries(STORES.filter(x=>x!=='documents').map((n,i)=>[n,results[i]]));
}
export function validateFile(file) {
  if (!file || file.size === 0) throw new Error('Soubor je prázdný.');
  if (file.size > 15*1024*1024) throw new Error('Soubor překračuje limit 15 MB: '+file.name);
  const type = file.type || '';
  if (!/^image\//.test(type) && type !== 'application/pdf' && !/\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(file.name||'')) {
    throw new Error('Podporujeme obrázky a PDF: '+file.name);
  }
}
export async function addReceipt(eventId,file) {
  validateFile(file);
  const db=await openDatabase(),tx=db.transaction(['expenses','documents'],'readwrite'), done=transactionDone(tx);
  const expenseId=uid(),documentId=uid();
  const document={id:documentId,eventId,expenseId,kind:'receipt',name:file.name||'uctenka',type:file.type||'',blob:file,createdAt:new Date().toISOString()};
  const expense={id:expenseId,eventId,receipt_path:documentId,receipt_name:document.name,bank_path:null,bank_name:null,merchant:'',spent_on:new Date().toISOString().slice(0,10),amount:0,category:'other',payment_method:'unknown',note:'',createdAt:new Date().toISOString()};
  tx.objectStore('documents').put(document);
  tx.objectStore('expenses').put(expense);
  await done;
  return expense;
}
export async function setBankConfirmation(expense,file) {
  validateFile(file);
  if (expense.payment_method!=='card') throw new Error('Bankovní potvrzení lze přidat jen k platbě kartou.');
  const db=await openDatabase(),tx=db.transaction(['expenses','documents'],'readwrite'),done=transactionDone(tx);
  const documentId=uid();
  if(expense.bank_path)tx.objectStore('documents').delete(expense.bank_path);
  const document={id:documentId,eventId:expense.eventId,expenseId:expense.id,kind:'bank',name:file.name||'potvrzeni',type:file.type||'',blob:file,createdAt:new Date().toISOString()};
  tx.objectStore('documents').put(document);
  tx.objectStore('expenses').put({...expense,bank_path:documentId,bank_name:document.name});
  await done;
}
export async function saveExpense(row) {
  const db=await openDatabase(),tx=db.transaction(['expenses','documents'],'readwrite'),done=transactionDone(tx);
  if (row.payment_method!=='card' && row.bank_path) {
    tx.objectStore('documents').delete(row.bank_path);
    row={...row,bank_path:null,bank_name:null};
  }
  tx.objectStore('expenses').put(row);
  await done;
}
export async function deleteExpense(row) {
  const db=await openDatabase(),tx=db.transaction(['expenses','documents'],'readwrite'),done=transactionDone(tx);
  tx.objectStore('expenses').delete(row.id);
  if(row.receipt_path)tx.objectStore('documents').delete(row.receipt_path);
  if(row.bank_path)tx.objectStore('documents').delete(row.bank_path);
  await done;
}
export async function snapshot() {
  const names=STORES;
  const entries=await Promise.all(names.map(getAll));
  return Object.fromEntries(names.map((name,i)=>[name,entries[i]]));
}
export async function restoreAll(data) {
  for (const name of STORES) {
    if (!Array.isArray(data[name])) throw new Error('Chybí část zálohy: '+name);
    for (const row of data[name]) if(typeof row?.id!=='string'||!row.id)throw new Error('Neplatné ID v záloze: '+name);
  }
  const db=await openDatabase(),tx=db.transaction(STORES,'readwrite'),done=transactionDone(tx);
  for (const name of STORES) tx.objectStore(name).clear();
  for (const name of STORES) for(const row of data[name]) tx.objectStore(name).put(row);
  await done;
}
export async function requestPersistence() {
  if (navigator.storage?.persist) return navigator.storage.persist();
  return false;
}
export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  return navigator.storage.estimate();
}
