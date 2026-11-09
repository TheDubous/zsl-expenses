import {combineReceiptPasses} from './receipt-consensus.mjs';
import {findReceiptBand,paperCropRect} from './receipt-crop.mjs';

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
  const focused=['focused','enhanced','header','bottom'].includes(kind)&&!!band;
  const base=paperCropRect(originalW,originalH,focused?band:null);
  const top=kind==='header'?.01:kind==='bottom'?.19:0;
  const heightFraction=kind==='header'?.48:kind==='bottom'?.77:1;
  const cropY=Math.floor(originalH*top);
  const cropH=Math.min(originalH-cropY,Math.max(1,Math.floor(originalH*heightFraction)));
  const maxW=focused?1900:2300;
  const maxH=kind==='header'?2450:4200;
  const maxPixels=5_800_000;
  const ratio=Math.min(focused?3.1:1.75,maxW/base.width,maxH/cropH,Math.sqrt(maxPixels/(base.width*cropH)));
  const width=Math.max(1,Math.round(base.width*ratio));
  const height=Math.max(1,Math.round(cropH*ratio));
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Prohlížeč nedokázal připravit OCR fotografii.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.filter=kind==='enhanced'?'grayscale(100%) contrast(165%)':
    kind==='header'?'grayscale(100%) contrast(150%)':
    kind==='focused'?'grayscale(100%) contrast(128%)':
    kind==='bottom'?'grayscale(100%) contrast(130%)':'grayscale(100%) contrast(112%)';
  ctx.drawImage(image,base.x,cropY,base.width,cropH,0,0,width,height);
  try{
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Příprava OCR snímku selhala.')),'image/png'));
  }finally{canvas.width=canvas.height=1}
}
export async function createOCRSession(onProgress=()=>{}){
  const {createWorker,PSM}=await import('tesseract.js');
  let worker,language='eng+deu';
  try{
    worker=await createWorker(['eng','deu'],1,{logger:m=>{
      if(typeof m.progress==='number')onProgress('OCR: '+m.status+' · '+Math.round(m.progress*100)+' %')
    }});
  }catch(error){
    onProgress('Německý model se nenačetl; zkouším anglický…');
    language='eng';
    worker=await createWorker('eng',1,{logger:m=>{
      if(typeof m.progress==='number')onProgress('OCR: '+m.status+' · '+Math.round(m.progress*100)+' %')
    }});
  }
  let closed=false;
  async function recognizePass(image,kind,band){
    const modes={
      normal:PSM.AUTO,focused:PSM.SINGLE_COLUMN,enhanced:PSM.SINGLE_BLOCK,
      header:PSM.SPARSE_TEXT,bottom:PSM.SPARSE_TEXT
    };
    await worker.setParameters({tessedit_pageseg_mode:modes[kind],preserve_interword_spaces:'1'});
    const input=await createPassImage(image,kind,band);
    const result=await worker.recognize(input,kind==='normal'?{rotateAuto:true}:{});
    return {kind,text:String(result.data?.text||'')};
  }
  return {
    language,
    async scan(file,{mode='precise'}={}){
      if(closed)throw new Error('OCR bylo ukončeno.');
      if(!canRecognize(file))throw new Error('OCR je dostupné pouze pro fotografie, ne PDF.');
      const opened=await loadPhoto(file),passes=[];
      let lastError=null;
      try{
        const band=locatePaper(opened.image);
        const steps=mode==='fast'?['normal','header']:
          band?['focused','normal','enhanced','header']:['normal','enhanced','header'];
        for(const [i,kind] of steps.entries()){
          const description=kind==='focused'?'izolovaná účtenka':kind==='header'?'dodavatel v hlavičce':
            kind==='enhanced'?'zesílený tisk':'celá fotografie';
          onProgress('Čtu účtenku '+(i+1)+'/'+steps.length+' · '+description);
          try{passes.push(await recognizePass(opened.image,kind,band))}
          catch(error){lastError=error;onProgress('Jeden průchod nevyšel; pokračuji…')}
        }
        if(mode!=='fast'){
          const tentative=combineReceiptPasses(passes);
          if(tentative.amount==null||tentative.confidence==='low'||!tentative.merchant){
            onProgress('Doplňková kontrola celkové částky a dodavatele…');
            try{passes.push(await recognizePass(opened.image,'bottom',band))}
            catch(error){lastError=error}
          }
        }
        if(!passes.length)throw lastError||new Error('Text účtenky se nepodařilo rozpoznat.');
        return {...combineReceiptPasses(passes),ocrLanguage:language,ocrMode:mode,receiptCropDetected:!!band};
      }finally{opened.release()}
    },
    async close(){if(closed)return;closed=true;await worker.terminate()}
  };
}
