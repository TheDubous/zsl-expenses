import {test} from 'node:test';
import assert from 'node:assert/strict';
import {receiptMathEvidence} from '../src/receipt-math.mjs';

const amounts=text=>receiptMathEvidence(text).map(x=>x.amount);

test('IMG8113 product 613 plus service 2 proposes 615 even when Gesamt is blurred',()=>{
 const source='Stk Typ Einzelpreis Gesamt\n1 SCT Kind 613,00 613,00\n1 SCT PF+ 2,00 2,00\nKrediikarle MasterCard 615,00';
 assert.deepEqual(amounts(source),[615]);
});
test('IMG8114 VAT base 106.48 and 20% VAT 21.30 propose 127.78, not 127.18',()=>{
 const source='G E S A M T BETRAG EUR 127,18\nMUST B 20% VON 106,48 21,30\nMWST GESAMT EUR 21,30';
 assert.deepEqual(amounts(source),[127.78]);
});
test('IMG8111 Steinblock gross follows VAT math despite text OCR corruption elsewhere',()=>{
 const source='St Satz Netto USt Brutto\n1 20,00% 80,67 16,13 96,80\nGesamt EUR 98,80';
 assert.deepEqual(amounts(source),[96.8]);
});
test('IMG8112 total from item table 76.80 + 13.80 + 21 = 111.60',()=>{
 const source='Menge Artikel EP Preis St\n6 502 12,80 76,80 1\n1 501 13,80 13,80 1\n7 360210 3,00 21,00 1\nGesamt EUR 111,60';
 assert.deepEqual(amounts(source),[111.6]);
});
test('mathematical evidence is rejected if row multiplication or VAT percent fails',()=>{
 assert.deepEqual(amounts('Stk Typ Einzelpreis Gesamt\n1 SCT Kind 613,00 612,00\n1 SCT PF+ 2,00 2,00'),[]);
 assert.deepEqual(amounts('MUST B 20% VON 106,48 19,30'),[]);
 assert.deepEqual(amounts('St Satz Netto USt Brutto\n1 20,00% 80,67 16,13 98,80'),[]);
});
test('unrelated prices, payment records and date fragments are never summed',()=>{
 assert.deepEqual(amounts('Gesamt 98,80 EUR\nEFT 96,80 EUR\n09.11.2026\nMwSt Gesamt 16,13'),[]);
});

test('actual thermal OCR may insert space before decimal comma in VAT base',()=>{
 assert.deepEqual(amounts('MUST B 20% VON 106 ,48 21,30'),[127.78]);
});

test('dot-decimal receipt amounts also reconcile without x100 mistakes',()=>{
 assert.deepEqual(amounts('St Satz Netto USt Brutto\n1 20% 80.67 16.13 96.80'),[96.8]);
 assert.deepEqual(amounts('VAT 20% OF 106.48 21.30'),[127.78]);
});

test('Slovak tax columns Základ + DPH = Spolu support paid diesel total',()=>{
 assert.deepEqual(amounts([
   'Sadzby Základ DPH Spolu',
   '23% 107.59 24.75 132.34 EUR',
   'Spolu: 107.59 24.75 132.34 EUR'
 ].join('\n')),[132.34]);
});
test('corrupted Slovak DPH components must not invent a valid gross',()=>{
 assert.deepEqual(amounts('Sadzby Zaklad DPH Spolu\n23% 107.59 24.15 132.34 EUR'),[]);
});
