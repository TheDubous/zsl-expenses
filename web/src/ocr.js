import {combineReceiptPasses} from './receipt-consensus.mjs';
import {findReceiptBand,paperCropRect} from './receipt-crop.mjs';
import {chooseOcrPass,maxOcrPasses} from './ocr-policy.mjs';

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
async function createPassImage(image,kind,band){
  const originalW=image.naturalWidth,originalH=image.naturalHeight;
  const focused=['focused','enhanced','header','bottom','soft'].includes(kind)&&!!band;
  const base=paperCropRect(originalW,originalH,focused?band:null);
  // Header and footer are targeted separately: scanning the complete tall
  // image five times would be too slow on an iPhone.
  const region=kind==='header'?[0,.48]:kind==='bottom'?[.35,.65]:[0,1];
  const cropY=Math.floor(originalH*region[0]);
  const cropH=Math.max(1,Math.min(originalH-cropY,Math.floor(originalH*region[1])));
  const maxW=focused?1750:1950;
  const maxH=kind==='header'?1900:kind==='bottom'?2400:3500;
  const maxPixels=3_600_000;
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
    focused:'grayscale(100%) contrast(128%)',
    enhanced:'grayscale(100%) contrast(162%)',
    header:'grayscale(100%) contrast(140%)',
    bottom:'grayscale(100%) contrast(143%)',
    soft:'grayscale(100%) contrast(118%) brightness(112%)'
  }[kind]||'none';
  ctx.drawImage(image,base.x,cropY,base.width,cropH,0,0,width,height);
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
  async function recognizePass(image,kind,band){
    const modes={
      normal:PSM.AUTO,focused:PSM.SINGLE_COLUMN,enhanced:PSM.SINGLE_BLOCK,
      header:PSM.SPARSE_TEXT,bottom:PSM.SPARSE_TEXT,soft:PSM.AUTO
    };
    await worker.setParameters({
      tessedit_pageseg_mode:modes[kind],
      preserve_interword_spaces:'1'
    });
    const input=await createPassImage(image,kind,band);
    const result=await worker.recognize(input,kind==='normal'?{rotateAuto:true}:{});
    return {kind,text:String(result.data?.text||''),ocrConfidence:result.data?.confidence??null};
  }
  return {
    language,
    async scan(file,{mode:requestedMode=mode}={}){
      if(closed)throw new Error('OCR bylo ukončeno.');
      if(!canRecognize(file))throw new Error('OCR je dostupné pouze pro fotografie, ne PDF.');
      const opened=await loadPhoto(file),passes=[],attempted=[];
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
            normal:'celá fotografie',focused:'izolovaná účtenka',
            enhanced:'zesílený tisk',header:'dodavatel v hlavičce',
            bottom:'celková částka ve spodní části',
            soft:'kontrola slabého tisku'
          };
          onProgress('OCR · '+attempted.length+'/'+limit+' · '+labels[kind]);
          try{
            passes.push(await recognizePass(opened.image,kind,band));
          }catch(error){
            lastError=error;
            onProgress('Jeden průchod nevyšel; pokračuji jiným postupem…');
          }
        }
        if(!passes.length)throw lastError||new Error('Text účtenky se nepodařilo rozpoznat.');
        const combined=combineReceiptPasses(passes);
        return {...combined,ocrLanguage:language,ocrMode:requestedMode,
          receiptCropDetected:!!band,ocrDurationMs:Date.now()-started,
          attemptedPasses:attempted};
      }finally{opened.release()}
    },
    async close(){if(closed)return;closed=true;await worker.terminate()}
  };
}
