import React,{useEffect,useState} from 'react';
import {getOne} from './localdb.js';
import {downloadBlob} from './archive.js';
import {X,Download} from 'lucide-react';

export default function ReceiptViewer({id,onClose}){
  const [doc,setDoc]=useState(null),[url,setUrl]=useState(null),[error,setError]=useState(null);
  useEffect(()=>{
    let active=true;
    let created=null;
    getOne('documents',id).then(result=>{
      if(!active)return;
      if(!result?.blob){setError('Doklad se nepodařilo najít.');return}
      created=URL.createObjectURL(result.blob);
      setUrl(created);setDoc(result);
    }).catch(e=>{if(active)setError(e.message)});
    return()=>{active=false;if(created)URL.revokeObjectURL(created)};
  },[id]);
  const image=doc?.type?.startsWith('image/')||/\.(heic|heif|jpe?g|png|webp)$/i.test(doc?.name||'');
  return <div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="modal document-modal">
      <div className="heading"><h2>{doc?.name||'Náhled dokladu'}</h2><button aria-label="Zavřít" onClick={onClose}><X size={20}/></button></div>
      {error?<p className="muted">{error}</p>:!url?<p className="muted">Otevírám doklad…</p>:
        image?<img className="document-image" src={url} alt="Náhled nahraného dokladu"/>:
        doc.type==='application/pdf'||/\.pdf$/i.test(doc.name)?<object data={url} type="application/pdf" className="document-pdf"><p>Na tomto zařízení nelze PDF zobrazit přímo. Použij tlačítko Uložit soubor.</p></object>:
        <p className="muted">Pro tento typ souboru není k dispozici náhled.</p>}
      {doc&&<button className="btn secondary" onClick={()=>downloadBlob(doc.blob,doc.name||'doklad')}><Download size={16}/> Uložit soubor</button>}
    </div>
  </div>
}
