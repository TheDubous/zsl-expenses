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
