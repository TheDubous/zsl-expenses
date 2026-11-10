/**
 * Conservative cached-value refresher for ORIGINAL ZSL XLSX formulas.
 * Excel formula elements (<f>) are never replaced. Only numeric <v> caches
 * for formulas supported by this small arithmetic/SUM evaluator are refreshed.
 * Unsupported diet/lookup formulas are left entirely untouched and must be
 * recalculated by Excel/LibreOffice after opening the workbook.
 */
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const own=(n,tag)=>Array.from(n?.childNodes||[]).find(x=>x.nodeType===1&&x.localName===tag&&x.namespaceURI===NS)||null;
const asNumber=x=>{const n=Number(x);return Number.isFinite(n)?n:null};
const key=(sheet,ref)=>sheet+'!'+ref.toUpperCase().replace(/\$/g,'');
function colNumber(label){return [...label].reduce((acc,ch)=>acc*26+ch.charCodeAt(0)-64,0)}
function colLabel(number){let s='';for(let n=number;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s}
const round=n=>Math.round((n+Number.EPSILON)*1e10)/1e10;
function buildCells(xmlBySheet){
 const bySheet=new Map();
 for(const [name,xml] of xmlBySheet){
  const map=new Map();
  for(const c of Array.from(xml.getElementsByTagNameNS(NS,'c')))map.set(c.getAttribute('r'),c);
  bySheet.set(name,map);
 }
 return bySheet;
}
export function refreshFormulaCaches(xmlBySheet,{targets}={}){
 const bySheet=buildCells(xmlBySheet);
 const result={updated:0,unchanged:0,unsupported:0,changed:[],formulaTextsChanged:0};
 const memo=new Map(),stack=new Set();
 function fetch(sheet,ref){
  const node=bySheet.get(sheet)?.get(ref.replace(/\$/g,''));
  if(!node)return 0; // Excel treats blank numeric references as zero
  const formula=own(node,'f');
  if(formula){
   if(!formula.textContent?.trim())return asNumber(own(node,'v')?.textContent||0); // shared formula follower with old cache
   const k=key(sheet,ref);
   if(memo.has(k))return memo.get(k);
   if(stack.has(k))return null;
   stack.add(k);
   const computed=compute(formula.textContent,sheet);
   stack.delete(k);
   memo.set(k,computed);
   return computed;
  }
  const t=node.getAttribute('t');
  if(t==='s'||t==='inlineStr'||t==='str'||t==='e')return null;
  const raw=own(node,'v')?.textContent;
  return raw==null||raw===''?0:asNumber(raw);
 }
 function compute(source,initialSheet){
  let text=String(source||'').trim().replace(/^=/,'');
  let pos=0;
  const whitespace=()=>{while(pos<text.length&&/\s/.test(text[pos]))pos++};
  const take=ch=>{whitespace();if(text[pos]===ch){pos++;return true}return false};
  function ref(defaultSheet){
   whitespace();
   const remainder=text.slice(pos);
   let m=remainder.match(/^'((?:[^']|'')+)'!\$?([A-Z]{1,3})\$?(\d+)/i);
   if(m){pos+=m[0].length;return {sheet:m[1].replace(/''/g,"'"),ref:m[2].toUpperCase()+m[3]}}
   m=remainder.match(/^([A-Za-z_][A-Za-z0-9_.]*)!\$?([A-Z]{1,3})\$?(\d+)/i);
   if(m){pos+=m[0].length;return {sheet:m[1],ref:m[2].toUpperCase()+m[3]}}
   m=remainder.match(/^\$?([A-Z]{1,3})\$?(\d+)/i);
   if(m){pos+=m[0].length;return {sheet:defaultSheet,ref:m[1].toUpperCase()+m[2]}}
   return null;
  }
  function range(first,second){
   if(first.sheet!==second.sheet)return null;
   const a=first.ref.match(/^([A-Z]+)(\d+)$/),b=second.ref.match(/^([A-Z]+)(\d+)$/);
   if(!a||!b)return null;
   const sc=colNumber(a[1]),ec=colNumber(b[1]);
   const sr=Number(a[2]),er=Number(b[2]);
   if((Math.abs(er-sr)+1)*(Math.abs(ec-sc)+1)>10000)return null;
   let sum=0;
   for(let row=Math.min(sr,er);row<=Math.max(sr,er);row++){
    for(let col=Math.min(sc,ec);col<=Math.max(sc,ec);col++){
     const n=fetch(first.sheet,colLabel(col)+row);
     // SUM ignores textual cells, but never guesses unknown formula results.
     if(n===null)return null;
     sum+=n;
    }
   }
   return sum;
  }
  function primary(){
   whitespace();
   if(take('+'))return primary();
   if(take('-')){const v=primary();return v===null?null:-v}
   if(take('(')){const value=expression();if(!take(')'))return null;return value}
   const tail=text.slice(pos);
   const fn=tail.match(/^(SUM)\s*\(/i);
   if(fn){
    pos+=fn[0].length;
    let total=0;
    if(take(')'))return 0;
    while(pos<text.length){
     whitespace();
     const before=pos,first=ref(initialSheet);
     let value=null;
     if(first){
      if(take(':')){const second=ref(first.sheet);if(!second)return null;value=range(first,second)}
      else{pos=before;value=expression()}
     }else value=expression();
     if(value===null)return null;total+=value;
     if(take(')'))return total;
     if(!take(',')&&!take(';'))return null;
    }
    return null;
   }
   const location=ref(initialSheet);
   if(location)return fetch(location.sheet,location.ref);
   const num=tail.match(/^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/);
   if(num){pos+=num[0].length;return Number(num[0])}
   return null;
  }
  function term(){
   let value=primary();if(value===null)return null;
   for(;;){
    if(take('*')){const rhs=primary();if(rhs===null)return null;value*=rhs}
    else if(take('/')){const rhs=primary();if(rhs===null||rhs===0)return null;value/=rhs}
    else break;
   }
   return value;
  }
  function expression(){
   let value=term();if(value===null)return null;
   for(;;){
    if(take('+')){const rhs=term();if(rhs===null)return null;value+=rhs}
    else if(take('-')){const rhs=term();if(rhs===null)return null;value-=rhs}
    else break;
   }
   return value;
  }
  const value=expression();whitespace();
  return pos===text.length&&value!==null&&Number.isFinite(value)?round(value):null;
 }
 // Recalculate the actual financial subtotal chains only. The rest of the
 // original sheet has complicated formula logic (diet lookup etc.).
 const lookup=targets||[];
 for(const {sheet,cell} of lookup){
  const c=bySheet.get(sheet)?.get(cell),f=own(c,'f');
  if(!f||!f.textContent?.trim())continue;
  const resultValue=fetch(sheet,cell);
  if(resultValue===null){result.unsupported++;continue}
  const next=String(resultValue);
  let value=own(c,'v');
  const previous=value?.textContent;
  if(previous===next){result.unchanged++;continue}
  if(!value){value=xmlBySheet.get(sheet).createElementNS(NS,'v');c.appendChild(value)}
  value.textContent=next;
  if(c.getAttribute('t')==='str')c.removeAttribute('t');
  result.updated++;result.changed.push({sheet,cell,previous:previous??null,value:resultValue});
 }
 return result;
}
export const CORE_ZSL_FORMULA_CELLS=[
 ...['H3','I11','I17','I23','I36','H38','H45','H47','H56'].map(cell=>({sheet:'s.3 - výdavky',cell})),
 ...['I32','I33','I34','I35','I36','I37','I38','I39','I40'].map(cell=>({sheet:'s.1 - pokyn',cell})),
 ...['H110','I110','H111','I111'].map(cell=>({sheet:'s.4 - stravné zahr.',cell}))
];
