import {parseReceiptText} from './receipt-parse.mjs';

export function canRecognize(file){
  if(!file)return false;
  return (file.type||'').startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name||'');
}
async function imageForOCR(file){
  const url=URL.createObjectURL(file);
  try{
    // Decode with the device's image codec: important for photos taken on iPhone.
    const img=new Image();
    img.decoding='async';
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Fotografii nelze otevřít pro OCR.'));img.src=url});
    const maxSide=2300;
    const ratio=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));
    canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw new Error('Nepodařilo se připravit fotografii.');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
    if('filter' in ctx)ctx.filter='grayscale(100%) contrast(140%)';
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Zpracování snímku selhalo.')),'image/png'));
    // Release heavy pixel buffers as early as possible.
    canvas.width=canvas.height=1;
    return blob;
  }finally{URL.revokeObjectURL(url)}
}
export async function createOCRSession(onProgress=()=>{}){
  const {createWorker}=await import('tesseract.js');
  // Only one worker. Reusing it avoids exhausting Safari memory for batch uploads.
  const worker=await createWorker('eng',1,{
    logger:message=>{if(typeof message.progress==='number')onProgress(message.status+' – '+Math.round(message.progress*100)+' %')}
  });
  return {
    async scan(file){
      if(!canRecognize(file))throw new Error('Čtení je zatím dostupné pro fotografie JPG/PNG/HEIC, nikoli PDF.');
      const input=await imageForOCR(file);
      const result=await worker.recognize(input);
      return parseReceiptText(result.data.text);
    },
    async close(){await worker.terminate()}
  };
}
