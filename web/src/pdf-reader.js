import {parsePdfReceiptPages} from './pdf-receipt-parse.mjs';

export function isPdf(file){
 return !!file&&(file.type==='application/pdf'||/\.pdf$/i.test(file.name||''));
}
function linesFromPage(textContent){
 const chunks=(textContent.items||[]).filter(x=>typeof x.str==='string'&&x.str.trim());
 if(!chunks.length)return '';
 // Reassemble text by physical baselines and x position. A final total often
 // has "Celkem" at the left and "1469" at the far right of the same PDF row.
 const rows=[];
 for(const item of chunks){
  const x=item.transform?.[4]||0,y=item.transform?.[5]||0;
  let row=rows.find(r=>Math.abs(r.y-y)<2.4);
  if(!row){row={y,parts:[]};rows.push(row)}
  if(!row.parts.some(p=>Math.abs(p.x-x)<.4&&p.text===item.str))
   row.parts.push({x,text:item.str});
 }
 rows.sort((a,b)=>b.y-a.y);
 return rows.map(r=>r.parts.sort((a,b)=>a.x-b.x).map(p=>p.text.trim()).filter(Boolean).join('  ')).filter(Boolean).join('\n');
}
async function renderAsBlob(page){
 const original=page.getViewport({scale:1});
 const scale=Math.min(2.1,Math.sqrt(2_400_000/(original.width*original.height)));
 const viewport=page.getViewport({scale});
 const canvas=document.createElement('canvas');
 canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
 const ctx=canvas.getContext('2d',{alpha:false});
 if(!ctx)throw new Error('Nelze převést naskenovanou stránku PDF na obrázek.');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 try{
  await page.render({canvasContext:ctx,viewport,background:'rgb(255,255,255)'}).promise;
  return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Nelze připravit stránku PDF k OCR.')),'image/png'));
 }finally{canvas.width=canvas.height=1}
}
export async function openPdfEngine(){
 const pkg=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const worker=await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
 pkg.GlobalWorkerOptions.workerSrc=worker.default;
 return pkg;
}
export async function recognizePdf(file,{onProgress=()=>{},mode='precise',pdfEngine=null,ocrSessionFactory=null}={}){
 if(!isPdf(file))throw new Error('Soubor není PDF.');
 onProgress('Otevírám PDF a vyhledávám text všech stran…');
 let engine=pdfEngine;
 if(!engine)engine=await openPdfEngine();
 const task=engine.getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true});
 let pdf,worker;
 try{
  pdf=await task.promise;
  if(pdf.numPages>32)throw new Error('PDF má více než 32 stran. Rozděl ho na menší doklady.');
  const pages=[],needsRendering=[];
  for(let i=1;i<=pdf.numPages;i++){
   onProgress('Čtu text PDF – strana '+i+'/'+pdf.numPages);
   const page=await pdf.getPage(i);
   let text='';
   try{text=linesFromPage(await page.getTextContent({includeMarkedContent:false}))}
   catch{/* Can still fall back to rasterized OCR for a scanned page. */}
   pages.push(text);
   if(text.trim().length<50)needsRendering.push(i);
   page.cleanup();
  }
  let result=parsePdfReceiptPages(pages);
  // Digital PDFs need no image OCR. Only rasterize when there is truly no
  // usable text / amount. A PDF may contain both searchable and scanned pages.
  if(!result.sourceAmount||!result.sourceCurrency){
   const targets=needsRendering.length?needsRendering:
     (pdf.numPages===1?[1]:[pdf.numPages,1]);
   onProgress(needsRendering.length?'PDF obsahuje obrázkové stránky, spouštím doplňkové OCR…':
     'PDF nemá jistě určenou částku nebo měnu. Zkouším kontrolní OCR důležitých stran…');
   const factory=ocrSessionFactory||(async callback=>{
    const {createOCRSession}=await import('./ocr.js');return createOCRSession(callback);
   });
   worker=await factory(onProgress);
   const scanned=[];
   for(const [i,number] of targets.slice(0,6).entries()){
    onProgress('Rozpoznávám sken PDF – strana '+number+' ('+(i+1)+'/'+Math.min(6,targets.length)+')');
    try{
     const page=await pdf.getPage(number);
     const img=await renderAsBlob(page);
     const read=await worker.scan(img,{mode:mode==='fast'?'fast':'fast'});
     pages[number-1]=read.rawText||pages[number-1];
     scanned.push(number);
     page.cleanup();
    }catch{/* Keep other pages; never overwrite a good text extraction. */}
   }
   const recovered=parsePdfReceiptPages(pages);
   if(recovered.sourceAmount&&recovered.sourceCurrency)result={...recovered,scannedPasses:[...recovered.scannedPasses,...scanned.map(i=>'PDF OCR strana '+i)]};
  }
  return {...result,pdfPages:pdf.numPages};
 }finally{
  if(worker)await worker.close().catch(()=>{});
  if(pdf)await pdf.destroy().catch(()=>{});
  else await task.destroy?.().catch(()=>{});
 }
}
