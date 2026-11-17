import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findReceiptBand,paperCropRect} from '../src/receipt-crop.mjs';
function scene(width,height,{left,right,paper=[231,229,224],background=[150,94,52]}={}){
 const data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const color=x>=left&&x<right?paper:background;
  const offset=(y*width+x)*4;
  data[offset]=color[0];data[offset+1]=color[1];data[offset+2]=color[2];data[offset+3]=255;
 }
 return {data,width,height};
}
test('IMG_7834-type narrow pale paper is detected on wooden background',()=>{
 const img=scene(400,600,{left:123,right:281});
 const band=findReceiptBand(img);
 assert.ok(band);
 assert.ok(band.x>.26&&band.x<.34);
 assert.ok(band.width>.35&&band.width<.48);
 const rect=paperCropRect(1152,1536,band);
 assert.ok(rect.found);
 assert.ok(rect.width<.5*1152);
 assert.ok(rect.x<123/400*1152);
});
test('avoid guessing a crop on all-white paper/background',()=>{
 const img=scene(300,400,{left:0,right:300,paper:[240,240,240],background:[240,240,240]});
 assert.equal(findReceiptBand(img),null);
 assert.equal(paperCropRect(1000,1400,null).width,1000);
});
test('avoid cutting receipt if it is extremely thin or at edge',()=>{
 const thin=scene(400,500,{left:180,right:211});
 assert.equal(findReceiptBand(thin),null);
 const edge=scene(400,500,{left:0,right:115});
 assert.equal(findReceiptBand(edge),null);
});

test('long folded receipt still includes right-hand amount column instead of cropping it off',()=>{
 const img=scene(360,480,{left:90,right:266,paper:[229,232,229],background:[143,102,68]});
 // Reproduce a shaded fold/text block where columns 170–255 have barely
 // 44% visible bright paper; old 0.64 requirement cropped to x<170.
 for(let y=48;y<346;y++)for(let x=170;x<256;x++){
  if(y%10>=4)continue;
  const o=(y*img.width+x)*4;
  img.data[o]=117;img.data[o+1]=117;img.data[o+2]=121;
 }
 const band=findReceiptBand(img);
 assert.ok(band,'a thermal receipt should still be detected');
 assert.ok(band.x<.27,'the header must stay inside the crop');
 assert.ok(band.x+band.width>.71,'the right-aligned total must stay inside the crop');
});
test('gray and creased vignette receipt can be detected against wooden table',()=>{
 const img=scene(360,480,{left:90,right:272,paper:[223,224,224],background:[146,103,66]});
 // Folds and dot-matrix printing leave only about 43% white sampling rows.
 for(let y=48;y<346;y++)for(let x=90;x<272;x++){
  if(y%9>=4)continue;
  const o=(y*img.width+x)*4;
  img.data[o]=130;img.data[o+1]=129;img.data[o+2]=131;
 }
 const band=findReceiptBand(img);
 assert.ok(band);
 assert.ok(band.x<.27&&band.x+band.width>.73);
});
test('do not crop a low-contrast uniformly light background',()=>{
 const img=scene(360,480,{left:80,right:280,paper:[232,231,230],background:[224,223,221]});
 assert.equal(findReceiptBand(img),null,'do not invent a narrow receipt crop on a similarly bright table');
});
