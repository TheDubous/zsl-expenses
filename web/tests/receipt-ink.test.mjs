import {test} from 'node:test';
import assert from 'node:assert/strict';
import {enhanceFaintInk} from '../src/receipt-ink.mjs';

test('faint thermal ink is darkened against shadowed gray paper',()=>{
 const width=40,height=2,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++){
  const background=y?175:220;
  for(let x=0;x<width;x++){
   const value=x===5?background-37:background;
   const i=(y*width+x)*4;
   data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
  }
 }
 const pixels={data};
 enhanceFaintInk(pixels,width,height);
 for(let y=0;y<height;y++){
  const white=pixels.data[(y*width+12)*4];
  const ink=pixels.data[(y*width+5)*4];
  assert.equal(white,255);
  assert.ok(ink<155,'ink remains visible despite different fold shadow');
 }
});
test('empty pixel inputs do not throw',()=>{
 assert.equal(enhanceFaintInk(null,0,0),null);
});
