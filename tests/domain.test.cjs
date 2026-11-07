const test=require("node:test");const assert=require("node:assert/strict");const d=require("../src/domain.cjs");
test("European decimal amounts",()=>{assert.equal(d.amount("1 234,56"),1234.56);assert.equal(d.amount("26,90"),26.9);});
test("card requires confirmation, cash does not",()=>{let e={receiptUri:"file:///receipt.jpg",merchant:"Slovnaft",amount:26.9,method:"cash"};assert.equal(d.status(e),"Kompletné");assert.equal(d.status({...e,method:"card"}),"Chýba bankové potvrdenie");});
test("advance and grouped fuel",()=>{const e={id:"e",advance:100};const xs=[{eventId:"e",category:"fuel",amount:26.9},{eventId:"e",category:"fuel",amount:50}];const r=d.totals(e,xs);assert.equal(r.spent,76.9);assert.equal(r.remaining,23.1);assert.equal(r.categories[0].total,76.9);});
