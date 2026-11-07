const CATEGORIES = [
{id:"fuel",label:"Tankovanie (nafta, benzín, AdBlue)"},
{id:"resort",label:"Skipasy a areál"},
{id:"food",label:"Strava a nákupy"},
{id:"lodging",label:"Ubytovanie"},
{id:"travel",label:"Doprava a poplatky"},
{id:"other",label:"Ostatné výdavky"}
];
function amount(value){const text=String(value??"").trim().replace(/[\s\u00a0]/g,"");const normalized=text.includes(",")?text.replace(/\./g,"").replace(",","."):text;if(!/^\d+(\.\d{1,2})?$/.test(normalized))return NaN;return Math.round(Number(normalized)*100)/100;}
function status(expense){if(!expense.receiptUri)return "Chýba účtenka";if(!Number.isFinite(Number(expense.amount))||Number(expense.amount)<=0)return "Chýba suma";if(!expense.merchant?.trim())return "Chýba obchodník";if(expense.method!=="cash"&&expense.method!=="card")return "Vyber spôsob platby";if(expense.method==="card"&&!expense.bankDocumentId)return "Chýba bankové potvrdenie";return "Kompletné";}
function totals(event,expenses){const list=expenses.filter(x=>x.eventId===event.id);const spent=Math.round(list.reduce((s,x)=>s+Math.round((Number(x.amount)||0)*100),0))/100;const advance=Number(event.advance)||0;return{spent,advance,remaining:Math.round((advance-spent)*100)/100,count:list.length,incomplete:list.filter(x=>status(x)!=="Kompletné").length,missingBank:list.filter(x=>x.method==="card"&&!x.bankDocumentId).length,categories:CATEGORIES.map(c=>({...c,total:list.filter(x=>x.category===c.id).reduce((s,x)=>s+(Number(x.amount)||0),0)}))};}
module.exports={CATEGORIES,amount,status,totals};
