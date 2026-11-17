/**
 * Locally normalize the paper background in faint thermal receipt scans.
 * Uses the 80th percentile luminance on each image row, so folds/shadows
 * don't wash out thin digits. Pure, in-place and offline; only applied on
 * a targeted OCR crop, not on the original receipt attachment.
 */
export function enhanceFaintInk(pixels,width,height){
 if(!pixels?.data||!width||!height)return pixels;
 const data=pixels.data;
 const step=Math.max(1,Math.floor(width/96));
 const shades=[];
 for(let y=0;y<height;y++){
  shades.length=0;
  for(let x=0;x<width;x+=step){
   const offset=(y*width+x)*4;
   shades.push(Math.round((data[offset]*3+data[offset+1]*6+data[offset+2])/10));
  }
  shades.sort((a,b)=>a-b);
  const background=shades[Math.floor((shades.length-1)*.8)];
  // Avoid amplifying random JPEG noise in already-white paper.
  if(background<110)continue;
  for(let x=0;x<width;x++){
   const offset=(y*width+x)*4;
   const gray=(data[offset]*3+data[offset+1]*6+data[offset+2])/10;
   const ink=Math.max(0,background-gray-5);
   const value=Math.max(0,Math.min(255,Math.round(255-ink*3.25)));
   data[offset]=data[offset+1]=data[offset+2]=value;
  }
 }
 return pixels;
}
