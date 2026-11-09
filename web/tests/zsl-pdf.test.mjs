import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeZslReport} from '../src/zsl-report.mjs';
import {makePdfDefinition,generatePdfBlob} from '../src/zsl-pdf.js';
const event={id:'event_pdf',name:'Pitztal 2026',currency:'EUR',kind:'Preteky',startsOn:'2026-11-02',endsOn:'2026-11-03',location:'Pitztal',country:'Rakúsko',purpose:'SBX'};
const trainer={name:'Testovací Tréner',address:'Banská Bystrica',iban:'SK1234567890123456789012'};
const report=makeZslReport({event,trainer,riders:[{name:'Arlo'}],expenses:[
 {id:'one',category:'resort',merchant:'Pitztaler Gletscherbahn',amount:650,payment_method:'cash',receipt_path:'receipt1',spent_on:'2026-11-03'}
],funding:[{kind:'advance',amount:1000}]});
test('full printable PDF contains all original ZSL sheet names and exact settlement labels',()=>{
 const pdf=makePdfDefinition(report,{createdAt:new Date('2026-11-09T00:00:00Z')});
 const json=JSON.stringify(pdf.content);
 for(const name of ['CESTOVNÝ PRÍKAZ','PREUKÁZANÉ CESTOVNÉ VÝDAVKY','VYÚČTOVANIE CESTOVNÝCH NÁHRAD - TUZEMSKO','VYÚČTOVANIE CESTOVNÝCH NÁHRAD - ZAHRANIČIE','KNIHA JÁZD','SPRÁVA Z PRACOVNEJ CESTY','Doplatok / Preplatok','Stravné zahraničie','Príspevok na stravu tuzemsko','NEVYPOČÍTANÉ','Testovací Tréner','650,00']){
   assert.ok(json.includes(name),'Missing '+name);
 }
 assert.equal(pdf.pageSize,'A4');
 assert.equal(typeof pdf.footer,'function');
});
test('browser-oriented pdfmake actually generates a readable PDF stream',async()=>{
 const blob=await generatePdfBlob(report,{createdAt:new Date('2026-11-09T00:00:00Z')});
 const bytes=new Uint8Array(await blob.arrayBuffer());
 assert.ok(bytes.length>1500,'Generated PDF too small');
 assert.equal(new TextDecoder().decode(bytes.slice(0,5)),'%PDF-');
});
