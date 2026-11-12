// A separate PDF collecting RECEIPTS AND BANK CONFIRMATIONS, NOT a facsimile
// of the ZSL Excel workbook. Each expense gets a numbered cover and attachments.
import {getOne} from './localdb.js';
import {downloadBlob} from './archive.js';
import {safeFilename,expenseStatus} from './utils.mjs';
import {receiptItemLabel} from './zsl-template-map.mjs';

function ascii(value){
 return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .replace(/[^\x20-\x7e]/g,'?').slice(0,200);
}
async function normalizeImage(blob){
 const source=URL.createObjectURL(blob);
 try{
  const img=new Image();img.decoding='async';
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('iPhone nedokáže otevřít fotografii pro PDF.'));img.src=source;});
  const max=2100,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const jpg=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Obrázek nelze převést do PDF.')),'image/jpeg',.86));
  canvas.width=canvas.height=1;
  return jpg.arrayBuffer();
 }finally{URL.revokeObjectURL(source)}
}
function notePage(pdf,font,heading,lines,{color,regularFont}={}){
 const page=pdf.addPage([595,842]);
 const blue=color||{r:.07,g:.22,b:.38};
 const size=18,margin=42;
 page.drawText(ascii(heading).slice(0,68),{x:margin,y:790,size,font,color:blue});
 page.drawLine({start:{x:margin,y:778},end:{x:553,y:778},thickness:.8});
 let y=746;
 for(const line of lines){
  const str=ascii(line);
  const limit=90;
  for(let index=0;index<str.length;index+=limit){
   page.drawText(str.slice(index,index+limit),{x:margin,y,size:10.5,font});
   y-=20;if(y<65)break;
  }
  y-=8;
  if(y<65)break;
 }
 return page;
}
export async function buildAttachmentsPdf({event,expenses,documents=async id=>getOne('documents',id)}){
 const {PDFDocument,StandardFonts,rgb}=await import('pdf-lib');
 const pdf=await PDFDocument.create();
 const font=await pdf.embedFont(StandardFonts.Helvetica);
 const warnings=[];
 const lines=[ 'Akce: '+(event?.name||'Vyuctovani ZSL'),
  'Mena: '+(event?.currency||'EUR'),
  'Pocet vydaju: '+expenses.length,
  'Tento PDF soubor obsahuje kopie dokladu, nikoli originalni XLSX ZSL.',
  'Kazda kartova platba ma vlastni prilohu potvrzeni (pokud je nahrana).',
  'Upozorneni: chybici dokumenty nejsou odstraneny ze seznamu.' ];
 notePage(pdf,font,'ZSL - PRILOHY K VYUCTOVANI',lines,{color:rgb(.07,.22,.38)});
 const ordered=[...expenses].sort((a,b)=>String(a.spent_on||'').localeCompare(String(b.spent_on||'')));
 let attached=0;
 for(let i=0;i<ordered.length;i++){
  const e=ordered[i];
  const label='DOKLAD '+(i+1)+' / '+ordered.length;
  notePage(pdf,font,label,[
    'Polozka: '+receiptItemLabel(e),
    'Dodavatel: '+(e.merchant||e.receipt_name||'Neurceno'),
    'Datum: '+(e.spent_on||'Neurceno'),
    'Suma pro ZSL: '+Number(e.amount||0).toFixed(2)+' '+(event?.currency||'EUR'),
    ...(Number(e.sourceAmount)>0?['Puvodni cena na dokladu: '+Number(e.sourceAmount).toFixed(2)+' '+(e.sourceCurrency||'?')]:[]),
    ...(Number(e.sourceAmount)>0&&e.sourceCurrency!=='EUR'&&!e.conversionConfirmed?['POZOR: Doklad v jine mene - prepocet do EUR dosud nepotvrzen']:[]),
    'Uhrada: '+(e.payment_method==='card'?'KARTOU':e.payment_method==='cash'?'HOTOVE':'NEURCENO'),
    'Stav: '+expenseStatus(e),
    'Uctenka: '+(e.receipt_name||'CHYBI'),
    'Bankovni potvrzeni: '+(e.bank_name||(e.payment_method==='card'?'CHYBI':'Nevyzaduje se'))
  ],{color:rgb(.11,.3,.45)});

  const attachments=[
    {id:e.receipt_path,kind:'UCTENKA',name:e.receipt_name},
    ...(e.payment_method==='card'?[{id:e.bank_path,kind:'BANKOVNI POTVRZENI',name:e.bank_name}]:[])
  ];
  for(const a of attachments){
   if(!a.id){warnings.push(label+': chybí '+a.kind);continue;}
   const doc=await documents(a.id);
   if(!doc?.blob){warnings.push(label+': soubor '+a.kind+' nebyl nalezen v telefonu.');continue;}
   const type=String(doc.type||doc.blob.type||'').toLowerCase(),name=doc.name||a.name||'priloha';
   try{
    if(type==='application/pdf'||/\.pdf$/i.test(name)){
     const existing=await PDFDocument.load(await doc.blob.arrayBuffer(),{ignoreEncryption:false});
     const pages=await pdf.copyPages(existing,existing.getPageIndices());
     for(const p of pages)pdf.addPage(p);
     attached+=1;
    }else{
     const jpg=await pdf.embedJpg(await normalizeImage(doc.blob));
     // portrait or landscape A4: no cropping or stretching.
     const landscape=jpg.width>jpg.height;
     const page=pdf.addPage(landscape?[842,595]:[595,842]);
     const w=page.getWidth(),h=page.getHeight();
     page.drawText(ascii(a.kind+' - '+name).slice(0,75),{x:28,y:h-31,size:10,font});
     const maxW=w-50,maxH=h-76;
     const scale=Math.min(maxW/jpg.width,maxH/jpg.height);
     const iw=jpg.width*scale,ih=jpg.height*scale;
     page.drawImage(jpg,{x:(w-iw)/2,y:(h-ih)/2-12,width:iw,height:ih});
     attached+=1;
    }
   }catch(err){
    warnings.push(label+': přílohu '+a.kind+' nelze převést: '+(err?.message||err));
   }
  }
 }
 if(warnings.length)notePage(pdf,font,'KONTROLA PRILOH - NEDOSTATKY',
  warnings.map((v,i)=>(i+1)+'. '+v),{color:rgb(.62,.17,.19)});
 const bytes=await pdf.save({useObjectStreams:true});
 return {blob:new Blob([bytes],{type:'application/pdf'}),pages:pdf.getPageCount(),
   attachmentCount:attached,warnings,filename:'ZSL_PRILOHY_'+safeFilename(event?.name||'vyuctovani')+'.pdf'};
}
export async function downloadAttachmentsPdf(input){
 const result=await buildAttachmentsPdf(input);
 downloadBlob(result.blob,result.filename);
 return result;
}
