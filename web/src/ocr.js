import {enhanceFaintInk} from './receipt-ink.mjs';
import {combineReceiptPasses} from './receipt-consensus.mjs';
import {findReceiptBand,paperCropRect} from './receipt-crop.mjs';
import {chooseOcrPass,maxOcrPasses,isOcrCertain} from './ocr-policy.mjs';

export function canRecognize(file){
  if(!file)return false;
  return (file.type||'').startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name||'');
}
async function loadPhoto(file){
  const url=URL.createObjectURL(file),image=new Image();
  image.decoding='async';
  try{
    await new Promise((resolve,reject)=>{
      image.onload=resolve;
      image.onerror=()=>reject(new Error('Obrázek nelze načíst pro OCR (zkus JPG nebo PNG).'));
      image.src=url;
    });
    if(!image.naturalWidth||!image.naturalHeight)throw new Error('Fotografie nemá platné rozměry.');
    return {image,release:()=>{image.src='';URL.revokeObjectURL(url)}};
  }catch(error){URL.revokeObjectURL(url);throw error}
}
function locatePaper(image){
  // One tiny raster is enough to find a white thermal-paper band on dark wood.
  // Does not crop in the vertical direction: the bottom of a long receipt matters.
  const cw=360,ch=Math.max(200,Math.round(image.naturalHeight*360/image.naturalWidth));
  const canvas=document.createElement('canvas');
  canvas.width=cw;canvas.height=Math.min(600,ch);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)return null;
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  canvas.width=canvas.height=1;
  return findReceiptBand(pixels);
}
async function createPassImage(image,kind,band,{liteOverview=false}={}){
  const originalW=image.naturalWidth,originalH=image.naturalHeight;
  const focused=['focused','enhanced','header','middle','bottom','soft'].includes(kind)&&!!band;
  // The dedicated total crop intentionally uses the full image width:
  // estimated paper bands sometimes cut off the right-aligned Brutto/EFT.
  const base=paperCropRect(originalW,originalH,focused?band:null);
  // Header and footer are targeted separately: scanning the complete tall
  // image five times would be too slow on an iPhone.
  const region=kind==='items'?[.25,.50]:kind==='tax'?[.67,.31]:kind==='totals'?[.44,.41]:kind==='header'?[0,.48]:kind==='middle'?[.22,.5]:kind==='payment'?[.30,.55]:kind==='bottom'?[.35,.65]:[0,1];
  const cropY=Math.floor(originalH*region[0]);
  const cropH=Math.max(1,Math.min(originalH-cropY,Math.floor(originalH*region[1])));
  // Keep full-resolution normal OCR in fast/precise. In maximum quality,
  // other high-resolution crops already cover text and amounts; downsize the
  // fallback overview to avoid pathological multi-language AUTO runs on iOS.
  const maxW=liteOverview?1350:focused?1750:1950;
  const maxH=liteOverview?1900:kind==='totals'?2100:kind==='header'?1900:kind==='middle'?2300:kind==='payment'?2250:kind==='bottom'?2400:3500;
  const maxPixels=liteOverview?1_600_000:3_600_000;
  const ratio=Math.min(focused?2.8:1.7,maxW/base.width,maxH/cropH,
    Math.sqrt(maxPixels/(base.width*cropH)));
  const width=Math.max(1,Math.round(base.width*ratio));
  const height=Math.max(1,Math.round(cropH*ratio));
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Prohlížeč nedokázal připravit OCR fotografii.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.filter={
    normal:'grayscale(100%) contrast(112%)',
    totals:'grayscale(100%) contrast(120%)',
    items:'grayscale(100%) contrast(126%)',
    tax:'grayscale(100%) contrast(120%)',
    focused:'grayscale(100%) contrast(128%)',
    enhanced:'grayscale(100%) contrast(162%)',
    header:'grayscale(100%) contrast(140%)',
    middle:'grayscale(100%) contrast(125%) brightness(105%)',
    payment:'grayscale(100%) contrast(118%) brightness(106%)',
    bottom:'grayscale(100%) contrast(135%) brightness(104%)',
    soft:'grayscale(100%) contrast(118%) brightness(112%)'
  }[kind]||'none';
  ctx.drawImage(image,base.x,cropY,base.width,cropH,0,0,width,height);
  // Separate targeted pass on fold-shadowed/faint digits. Preserve normal OCR
  // passes as independent evidence and keep all work on-device.
  if(kind==='middle'){
    const raster=ctx.getImageData(0,0,width,height);
    ctx.putImageData(enhanceFaintInk(raster,width,height),0,0);
  }
  try{
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>
      blob?resolve(blob):reject(new Error('Příprava OCR snímku selhala.')),'image/png'));
  }finally{canvas.width=canvas.height=1}
}

export async function createOCRSession(onProgress=()=>{},{mode='max'}={}){
  const {createWorker,PSM}=await import('tesseract.js');
  const languageGroups=mode==='max'?
    [['eng','deu','ces','slk'],['eng','deu','ces'],['eng','deu'],['eng']]:
    [['eng','deu'],['eng']];
  let worker=null,language='',lastError=null;
  for(const languages of languageGroups){
    try{
      onProgress('Připravuji OCR jazyky: '+languages.join(', ')+'…');
      worker=await createWorker(languages,1,{logger:m=>{
        if(typeof m.progress==='number'&&m.status)
          onProgress('OCR: '+m.status+' · '+Math.round(m.progress*100)+' %');
      }});
      language=languages.join('+');
      break;
    }catch(error){
      lastError=error;
      onProgress('Ne všechny jazykové modely jsou dostupné. Zkouším záložní sadu…');
    }
  }
  if(!worker)throw lastError||new Error('Nepodařilo se načíst OCR jazyky.');
  let closed=false;
  async function recognizePass(image,kind,band,requestedMode=mode){
    const started=Date.now();
    const modes={
      normal:PSM.AUTO,totals:PSM.SINGLE_BLOCK,items:PSM.SINGLE_BLOCK,tax:PSM.SINGLE_BLOCK,focused:PSM.SINGLE_COLUMN,enhanced:PSM.SINGLE_BLOCK,
      header:PSM.SPARSE_TEXT,middle:PSM.AUTO,payment:PSM.AUTO,bottom:PSM.SPARSE_TEXT,soft:PSM.AUTO
    };
    await worker.setParameters({
      tessedit_pageseg_mode:modes[kind],
      preserve_interword_spaces:'1'
    });
    const input=await createPassImage(image,kind,band,{liteOverview:kind==='normal'&&requestedMode==='max'});
    const result=await worker.recognize(input,kind==='normal'&&requestedMode!=='max'?{rotateAuto:true}:{});
    return {kind,text:String(result.data?.text||''),ocrConfidence:result.data?.confidence??null,durationMs:Date.now()-started};
  }
  return {
    language,
    async scan(file,{mode:requestedMode=mode}={}){
      if(closed)throw new Error('OCR bylo ukončeno.');
      if(!canRecognize(file))throw new Error('OCR je dostupné pouze pro fotografie, ne PDF.');
      const opened=await loadPhoto(file),passes=[],attempted=[],failedPasses=[];
      const started=Date.now(),limit=maxOcrPasses(requestedMode);
      let lastError=null;
      try{
        const band=locatePaper(opened.image);
        for(;;){
          const tentative=passes.length?combineReceiptPasses(passes):null;
          const kind=chooseOcrPass({
            mode:requestedMode,band:!!band,passes:attempted,
            result:tentative,elapsedMs:Date.now()-started
          });
          if(!kind)break;
          attempted.push(kind);
          const labels={
            normal:'celá fotografie',totals:'celková částka a zaplaceno',
            items:'součet jednotlivých položek',tax:'kontrola daňového základu a DPH',focused:'izolovaná účtenka',
            enhanced:'zesílený tisk',header:'dodavatel v hlavičce',
            middle:'oblast skutečného součtu',payment:'kontrola platby bez ořezu papíru',bottom:'celková částka ve spodní části',
            soft:'kontrola slabého tisku'
          };
          onProgress('OCR · '+attempted.length+'/'+limit+' · '+labels[kind]);
          try{
            passes.push(await recognizePass(opened.image,kind,band,requestedMode));
          }catch(error){
            lastError=error;
            failedPasses.push({kind,message:String(error?.message||error).slice(0,250)});
            onProgress('Jeden průchod nevyšel; pokračuji jiným postupem…');
          }
        }
        if(!passes.length)throw lastError||new Error('Text účtenky se nepodařilo rozpoznat.');
        const combined=combineReceiptPasses(passes);
        // In maximum-quality mode, two passes can repeat the SAME OCR digit
        // error. Complete both arithmetic crops before claiming green status.
        const verified=isOcrCertain(combined)&&
          (requestedMode!=='max'||(passes.some(p=>p.kind==='items')&&passes.some(p=>p.kind==='tax')));
        // Two reads may repeat the same digit error. When the phone reaches
        // its time budget early, show the candidate but require review.
        const confidence=requestedMode==='max'&&combined.confidence==='high'&&!verified?
          'medium':combined.confidence;
        return {...combined,confidence,ocrVerified:verified,ocrLanguage:language,ocrMode:requestedMode,
          receiptCropDetected:!!band,ocrDurationMs:Date.now()-started,
          attemptedPasses:attempted,
          failedPasses,
          passDiagnostics:passes.map(p=>({kind:p.kind,ocrConfidence:p.ocrConfidence,
            durationMs:p.durationMs,text:p.text.slice(0,12000)}))};
      }finally{opened.release()}
    },
    async close(){if(closed)return;closed=true;await worker.terminate()}
  };
}
