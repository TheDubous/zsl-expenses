import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import JSZip from 'jszip';

// The association publishes the original template. Bundle that published
// template, not a user-provided example containing personal details.
const SOURCE='https://www.zvazslovenskeholyzovania.sk/wp-content/uploads/ZSL-Cestovny-prikaz-sablona-v20250430.xlsx';
const DEST=path.resolve('web/public/ZSL-Cestovny-prikaz.xlsx');
const SHEETS=[
 's.1 - pokyn','s.3 - výdavky','s.4 - stravné tuzem.','s.4 - stravné zahr.',
 's.5 - kniha jázd','s.5 - kniha jázd_Kufel_2','s.6 - správa',
 'Náhrady INT 2021','pomocný hárok','DIÉTY SLOVENSKO','str.4 - stravné INT'
];
const response=await fetch(SOURCE,{redirect:'follow',signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error('Nelze stáhnout oficiální ZSL formulář: HTTP '+response.status);
const sizeHeader=Number(response.headers.get('content-length'));
if(sizeHeader>3_000_000)throw Error('Oficiální šablona je nečekaně velká.');
const data=new Uint8Array(await response.arrayBuffer());
if(data.length>3_000_000||data.length<20_000||String.fromCharCode(...data.slice(0,2))!=='PK')
 throw Error('Zdroj nevrací očekávaný soubor XLSX.');
const zip=await JSZip.loadAsync(data,{checkCRC32:true});
const wb=await zip.file('xl/workbook.xml')?.async('string');
if(!wb)throw Error('XLSX neobsahuje hlavní workbook.xml');
const publishedNames=[...wb.matchAll(/<sheet\b[^>]*name="([^"]+)"/g)].map(m=>m[1]);
console.log('Published sheet names:',JSON.stringify(publishedNames));
console.log('Published size and SHA256:',data.length,createHash('sha256').update(data).digest('hex'));
for(const name of SHEETS){
 if(!wb.includes('name="'+name.replace(/&/g,'&amp;')+'"'))
  throw Error('Neplatný oficiální formulář ZSL: chybí list '+name);
}
if(!zip.file('xl/worksheets/sheet1.xml')||!zip.file('xl/worksheets/sheet3.xml'))
 throw Error('Oficiální šablona nemá požadovanou strukturu pracovních listů.');
await mkdir(path.dirname(DEST),{recursive:true});
await writeFile(DEST,data);
const sha=createHash('sha256').update(data).digest('hex');
console.log('Official ZSL template verified:',data.length,'bytes; SHA256:',sha,'; 11 expected sheets');
console.log('Bundled at:',DEST);
