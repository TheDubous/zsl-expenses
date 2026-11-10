/**
 * Verify the real ZSL workbook is filled in-place rather than rebuilt.
 * Existing formula text, merge structure, cell style ids and original sheet
 * count must remain intact. We may add missing formulas only to previously
 * literal-zero calculated foreign-meal cells as an explicit repair.
 */
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
function nodes(xml,type){return Array.from(xml.getElementsByTagNameNS(NS,type))}
function originals(xml){
 const formulas=new Map(),styles=new Map();
 for(const cell of nodes(xml,'c')){
  const ref=cell.getAttribute('r');
  if(!ref)continue;
  const f=Array.from(cell.childNodes||[]).find(c=>c.localName==='f'&&c.namespaceURI===NS);
  if(f){
   const attributes=Array.from(f.attributes||[]).map(a=>a.name+'='+a.value).sort().join(';');
   formulas.set(ref,JSON.stringify([f.textContent||'',attributes]));
  }
  if(cell.hasAttribute('s'))styles.set(ref,cell.getAttribute('s'));
 }
 const merges=nodes(xml,'mergeCell').map(x=>x.getAttribute('ref')).sort();
 return {formulas,styles,merges};
}
export function verifyOriginalWorksheetIntegrity(source,exported,sheetName=''){
 const base=originals(source),out=originals(exported);
 for(const [ref,formula] of base.formulas){
  if(out.formulas.get(ref)!==formula)
   throw new Error('Originální vzorec ZSL byl změněn: '+sheetName+'!'+ref);
 }
 for(const [ref,style] of base.styles){
  if(out.styles.get(ref)!==style)
   throw new Error('Formát původní buňky ZSL byl změněn: '+sheetName+'!'+ref);
 }
 if(base.merges.join('|')!==out.merges.join('|'))
  throw new Error('Rozložení sloučených buněk ZSL bylo změněno: '+sheetName);
 return {formulaCount:base.formulas.size,formattedCellCount:base.styles.size,
  addedFormulas:out.formulas.size-base.formulas.size,mergedRanges:base.merges.length};
}
