// Find a narrow light paper receipt against a darker/colored background.
// The algorithm uses only a small downsampled raster (no image upload or OCR).
export function findReceiptBand({data,width,height}){
  if(!data||!width||!height)return null;
  const counts=new Uint16Array(width),totals=new Uint16Array(width);
  const top=Math.round(height*.10),bottom=Math.round(height*.72);
  const step=Math.max(1,Math.floor(height/260));
  for(let y=top;y<bottom;y+=step){
    for(let x=0;x<width;x++){
      const offset=(y*width+x)*4;
      const r=data[offset],g=data[offset+1],b=data[offset+2];
      totals[x]++;
      if(Math.min(r,g,b)>157&&Math.max(r,g,b)-Math.min(r,g,b)<70)counts[x]++;
    }
  }
  // Smooth over 5 pixel columns, so dark printing/lines don't split the paper.
  const radius=Math.max(2,Math.round(width*.014)),flags=[];
  for(let x=0;x<width;x++){
    let white=0,count=0;
    for(let k=Math.max(0,x-radius);k<=Math.min(width-1,x+radius);k++){
      white+=counts[k];count+=totals[k];
    }
    flags.push(count>0&&white/count>.64);
  }
  const runs=[];let start=null;
  for(let x=0;x<=width;x++){
    if(x<width&&flags[x]){if(start==null)start=x}
    else if(start!=null){runs.push({a:start,b:x-1});start=null}
  }
  const candidates=runs.filter(r=>{
    const band=(r.b-r.a+1)/width;
    const center=(r.a+r.b)/(2*width);
    return band>=.18&&band<=.82&&center>=.22&&center<=.78;
  }).sort((a,b)=>(b.b-b.a)-(a.b-a.a));
  if(!candidates.length)return null;
  const band=candidates[0];
  const margin=Math.round(width*.018);
  const left=Math.max(0,band.a-margin),right=Math.min(width-1,band.b+margin);
  return {x:left/width,width:(right-left+1)/width,y:0,height:1};
}
export function paperCropRect(sourceWidth,sourceHeight,band){
  if(!band)return {x:0,y:0,width:sourceWidth,height:sourceHeight,found:false};
  return {
    x:Math.floor(band.x*sourceWidth),y:0,
    width:Math.min(sourceWidth-Math.floor(band.x*sourceWidth),Math.ceil(band.width*sourceWidth)),
    height:sourceHeight,found:true
  };
}
