import {combineReceiptPasses} from './receipt-consensus.mjs';

export function canRecognize(file){
  if(!file)return false;
  return (file.type||'').startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name||'');
}

async function loadPhoto(file){
  const url=URL.createObjectURL(file);
  const image=new Image();
  image.decoding='async';
  try{
    await new Promise((resolve,reject)=>{
      image.onload=resolve;
      image.onerror=()=>reject(new Error('Obrázek nelze načíst pro OCR (zkus JPG nebo PNG).'));
      image.src=url;
    });
    if(!image.naturalWidth||!image.naturalHeight)throw new Error('Fotografie nemá platné rozměry.');
    return {image,release:()=>{image.src='';URL.revokeObjectURL(url)}};
  }catch(error){
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function createPassImage(image,pass){
  const originalW=image.naturalWidth,originalH=image.naturalHeight;
  const top=pass==='header'?0:pass==='bottom'?.53:0;
  const section=pass==='header'?.45:pass==='bottom'?.47:1;
  const cropY=Math.floor(originalH*top);
  const cropH=Math.max(1,Math.floor(originalH*section));
  const maxW=pass==='header'?2600:2300;
  const maxH=pass==='header'?2300:4200;
  const ratio=Math.min(1.75,maxW/originalW,maxH/cropH,Math.sqrt(5300000/(originalW*cropH)));
  const width=Math.max(1,Math.round(originalW*ratio)),height=Math.max(1,Math.round(cropH*ratio));
  const canvas=document.createElement('canvas');
  canvas.width=width;
  canvas.height=height;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Prohlížeč nedokázal připravit OCR fotografii.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.filter=pass==='enhanced'?'grayscale(100%) contrast(160%)':pass==='header'?'grayscale(100%) contrast(140%)':pass==='bottom'?'grayscale(100%) contrast(145%)':'grayscale(100%) contrast(112%)';
  ctx.drawImage(image,0,cropY,originalW,cropH,0,0,width,height);
  try{
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Příprava OCR snímku selhala.')),'image/png'));
  }finally{canvas.width=canvas.height=1}
}

export async function createOCRSession(onProgress=()=>{}){
  const {createWorker,PSM}=await import('tesseract.js');
  // One worker for the whole batch to protect iPhone Safari memory. A multilingual model
  // helps with Austrian/German receipts. If language data cannot load, use English only.
  let worker;
  let language='eng+deu';
  try{
    worker=await createWorker(['eng','deu'],1,{
      logger:m=>{if(typeof m.progress==='number')onProgress('OCR: '+m.status+' · '+Math.round(m.progress*100)+' %')}
    });
  }catch(error){
    onProgress('Německý model není dostupný; zkouším anglický…');
    language='eng';
    worker=await createWorker('eng',1,{
      logger:m=>{if(typeof m.progress==='number')onProgress('OCR: '+m.status+' · '+Math.round(m.progress*100)+' %')}
    });
  }

  let closed=false;
  async function recognizePass(photo,kind,mode){
    const modes={normal:PSM.AUTO,enhanced:PSM.SINGLE_BLOCK,header:PSM.SPARSE_TEXT,bottom:PSM.SPARSE_TEXT};
    await worker.setParameters({tessedit_pageseg_mode:modes[kind],preserve_interword_spaces:'1'});
    const image=await createPassImage(photo,kind);
    const data=await worker.recognize(image,kind==='normal'?{rotateAuto:true}:{});
    return {kind,text:String(data?.data?.text||'')};
  }

  return {
    language,
    async scan(file,{mode='precise'}={}){
      if(closed)throw new Error('OCR již bylo uzavřeno.');
      if(!canRecognize(file))throw new Error('OCR je dostupné pouze pro fotografii, ne pro PDF.');
      const opened=await loadPhoto(file);
      const passes=[];
      let lastError=null;
      const stages=mode==='fast'?['normal','header']:['normal','enhanced','header'];
      try{
        for(const [index,kind] of stages.entries()){
          onProgress('Důkladná analýza · krok '+(index+1)+'/'+stages.length+' ('+(kind==='normal'?'celá účtenka':kind==='enhanced'?'druhý kontrast':'hlavička')+')');
          try{
            const pass=await recognizePass(opened.image,kind,mode);
            passes.push(pass);
          }catch(err){lastError=err;onProgress('Jeden průchod selhal, pokračuji dalším…')}
        }
        if(mode!=='fast'){
          const interim=combineReceiptPasses(passes);
          // Only spend extra processing time when the amount is uncertain or unreadable.
          if(interim.amount==null||interim.confidence==='low'){
            onProgress('Kontroluji spodní část účtenky kvůli celkové částce…');
            try{passes.push(await recognizePass(opened.image,'bottom',mode))}
            catch(err){lastError=err}
          }
        }
        if(!passes.length)throw lastError||new Error('Text účtenky se nepodařilo rozpoznat.');
        return {...combineReceiptPasses(passes),ocrLanguage:language,ocrMode:mode};
      }finally{opened.release()}
    },
    async close(){
      if(closed)return;
      closed=true;
      await worker.terminate();
    }
  };
}
