
import React,{useEffect,useMemo,useState} from 'react';
import {View,Text,TextInput,ScrollView,TouchableOpacity,Alert,StyleSheet,StatusBar,ActivityIndicator} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import {File,Directory,Paths} from 'expo-file-system';
import JSZip from 'jszip';
import domain from './src/domain.cjs';

const {CATEGORIES,amount,status,totals}=domain;
const BG='#0b1220',PANEL='#172339',TEXT='#f5f8ff',MUTED='#98a9c4',ACCENT='#9b83fa';
const id=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const fmt=(x,c='EUR')=>Number(x||0).toLocaleString('sk-SK',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+c;
const cleanName=s=>String(s||'dokument').replace(/[^\p{L}\p{N}._-]+/gu,'_').slice(0,70);
function Button({label,onPress,kind='primary',disabled=false}){return <TouchableOpacity disabled={disabled} onPress={onPress} style={[s.button,kind==='secondary'&&s.buttonSecondary,disabled&&{opacity:.45}]}><Text style={[s.buttonText,kind==='secondary'&&{color:TEXT}]}>{label}</Text></TouchableOpacity>}
function Field({label,value,onChangeText,placeholder,keyboardType}){return <View style={{marginBottom:11}}><Text style={s.label}>{label}</Text><TextInput placeholderTextColor="#7385a5" style={s.input} placeholder={placeholder||label} value={String(value??'')} onChangeText={onChangeText} keyboardType={keyboardType||'default'}/></View>}
function Choice({label,chosen,onPress}){return <TouchableOpacity onPress={onPress} style={[s.choice,chosen&&s.choiceSelected]}><Text style={{color:chosen?TEXT:MUTED,fontWeight:chosen?'700':'500'}}>{label}</Text></TouchableOpacity>}
async function persistDocument(uri,name){
 const dir=new Directory(Paths.document,'receipts');
 if(!dir.exists)dir.create({intermediates:true,idempotent:true});
 const extension=String(name||'').split('.').pop().replace(/[^a-zA-Z0-9]/g,'').slice(0,8)||'jpg';
 const destination=new File(dir,id()+'.'+extension);
 new File(uri).copy(destination);
 return destination.uri;
}
async function takeReceipt(){
 const permission=await ImagePicker.requestCameraPermissionsAsync();
 if(!permission.granted){Alert.alert('Fotoaparát','Povoľ prístup ku kamere.');return [];}
 const result=await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:.82});
 if(result.canceled)return [];
 return Promise.all(result.assets.map(async a=>({name:a.fileName||'uctenka.jpg',uri:await persistDocument(a.uri,a.fileName||'uctenka.jpg')})));
}
async function selectFiles(mode){
 if(mode==='receipts'){
  const r=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:true,quality:.85});
  if(r.canceled)return [];
  return Promise.all(r.assets.map(async a=>({name:a.fileName||'uctenka.jpg',uri:await persistDocument(a.uri,a.fileName||'uctenka.jpg')})));
 }
 const r=await DocumentPicker.getDocumentAsync({type:['application/pdf','image/*'],multiple:true,copyToCacheDirectory:true});
 if(r.canceled)return [];
 return Promise.all(r.assets.map(async a=>({name:a.name||'potvrdenie.pdf',uri:await persistDocument(a.uri,a.name||'potvrdenie.pdf')})));
}
function Header({title,onBack}){return <View style={s.header}>{onBack&&<TouchableOpacity onPress={onBack}><Text style={{color:ACCENT,fontWeight:'800'}}>‹ Späť</Text></TouchableOpacity>}<Text style={s.headerTitle}>{title}</Text></View>}
export default function App(){
 const [data,setData]=useState({coaches:[],riders:[],events:[],expenses:[],banks:[]});
 const [ready,setReady]=useState(false),[screen,setScreen]=useState('home'),[eventId,setEventId]=useState(null),[expenseId,setExpenseId]=useState(null);
 const [draft,setDraft]=useState({}),[busy,setBusy]=useState(false);
 useEffect(()=>{AsyncStorage.getItem('zsl-expenses-v1').then(v=>{if(v){try{setData(JSON.parse(v))}catch(e){}}}).finally(()=>setReady(true))},[]);
 useEffect(()=>{if(ready)AsyncStorage.setItem('zsl-expenses-v1',JSON.stringify(data)).catch(()=>Alert.alert('Uloženie','Dáta sa nepodarilo uložiť.'))},[data,ready]);
 const update=(key,item)=>setData(old=>({...old,[key]:[...old[key],item]}));
 const replace=(key,item)=>setData(old=>({...old,[key]:old[key].map(x=>x.id===item.id?item:x)}));
 const event=data.events.find(x=>x.id===eventId),expense=data.expenses.find(x=>x.id===expenseId);
 const expenses=data.expenses.filter(x=>x.eventId===eventId);
 const banks=data.banks.filter(x=>x.eventId===eventId);
 const summary=event?totals(event,data.expenses):null;
 const back=()=>{if(screen==='editExpense'){setScreen('event')}else if(screen==='event'||screen==='newEvent'){setScreen('home')}else if(screen==='profiles'){setScreen('home')}else setScreen('event')};
 const openNewEvent=()=>{setDraft({type:'Sústredenie',coachId:data.coaches[0]?.id||'',riderIds:[],currency:'EUR',advance:'0'});setScreen('newEvent')};
 const openExpense=(x)=>{setExpenseId(x.id);setDraft({...x,amount:String(x.amount||'')});setScreen('editExpense')};
 const addReceipts=async(camera=false)=>{
  if(!event)return;
  try{setBusy(true);const files=camera?await takeReceipt():await selectFiles('receipts');if(files.length){setData(old=>({...old,expenses:[...old.expenses,...files.map(f=>({id:id(),eventId:event.id,receiptUri:f.uri,receiptName:f.name,merchant:'',date:new Date().toISOString().slice(0,10),amount:0,method:'unset',category:'other',bankDocumentId:null,note:''}))]}));Alert.alert('Účtenky',`Pridané: ${files.length}. Doplň sumy a spôsob platby.`);}}catch(e){Alert.alert('Nahrávanie',String(e.message||e))}finally{setBusy(false)}
 };
 const addBankDocs=async()=>{
  try{setBusy(true);const files=await selectFiles('bank');if(files.length){setData(old=>({...old,banks:[...old.banks,...files.map(f=>({id:id(),eventId:event.id,uri:f.uri,name:f.name,expenseId:null}))]}));Alert.alert('Potvrdenia',`Pridané: ${files.length}. Priraď ich ku kartovým platbám.`);}}catch(e){Alert.alert('Nahrávanie',String(e.message||e))}finally{setBusy(false)}
 };
 const linkBank=(bank,ex)=>{
  setData(old=>({...old,banks:old.banks.map(b=>b.id===bank.id?{...b,expenseId:ex.id}:b),expenses:old.expenses.map(x=>x.id===ex.id?{...x,bankDocumentId:bank.id}:x)}));
 };
 const exportZip=async()=>{
  try{
   setBusy(true);
   const zip=new JSZip();const folder=zip.folder('Doklady');
   const lines=[['ID','Datum','Obchodnik','Suma','Mena','Kategoria','Platba','Stav']];
   for(const [index,x] of expenses.entries()){
    lines.push([x.id,x.date,x.merchant,x.amount,event.currency,CATEGORIES.find(c=>c.id===x.category)?.label,x.method,status(x)]);
    const sub=folder.folder(String(index+1).padStart(3,'0')+'_'+cleanName(x.merchant));
    if(x.receiptUri){try{const f=new File(x.receiptUri);sub.file('Uctenka_'+cleanName(x.receiptName),await f.base64(),{base64:true})}catch(e){sub.file('CHYBA_UCTENKY.txt',String(e))}}
    const b=banks.find(v=>v.id===x.bankDocumentId);
    if(b){try{const f=new File(b.uri);sub.file('Bankove_potvrdenie_'+cleanName(b.name),await f.base64(),{base64:true})}catch(e){sub.file('CHYBA_POTVRDENIA.txt',String(e))}}
   }
   const csv=lines.map(line=>line.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
   zip.file('Vydavky.csv','\ufeff'+csv);
   zip.file('Prehlad_chyb.txt',expenses.filter(x=>status(x)!=='Kompletné').map(x=>x.id+' | '+x.merchant+' | '+status(x)).join('\n')||'Bez nedostatkov');
   zip.file('Zaloha_dat.json',JSON.stringify({event,expenses,banks:banks.map(({uri,...rest})=>rest)},null,2));
   const unlinked=banks.filter(b=>!b.expenseId);
   for(const b of unlinked){try{zip.file('Nepriradene_potvrdenia/'+cleanName(b.name),await new File(b.uri).base64(),{base64:true})}catch(e){}}
   const archive=new File(Paths.cache,'ZSL_'+cleanName(event.name)+'_'+Date.now()+'.zip');
   archive.write(await zip.generateAsync({type:'uint8array'}));
   await Sharing.shareAsync(archive.uri,{mimeType:'application/zip',dialogTitle:'Export ZSL vyúčtovania'});
  }catch(e){Alert.alert('ZIP export',String(e.message||e))}finally{setBusy(false)}
 };
 if(!ready)return <View style={s.page}><ActivityIndicator color={ACCENT}/></View>;
 return <View style={s.page}><StatusBar barStyle="light-content"/><ScrollView contentContainerStyle={s.scroll}>
  {screen==='home'&&<><Header title="ZSL Expenses"/><Text style={s.subtitle}>Sústredenia a preteky · moje vyúčtovania</Text>
    <Button label="+ Nové vyúčtovanie" onPress={openNewEvent}/>
    <Button label="Tréneri a jazdci" kind="secondary" onPress={()=>setScreen('profiles')}/>
    <Text style={s.section}>Moje vyúčtovania</Text>
    {data.events.length===0&&<Text style={s.muted}>Zatiaľ nemáš žiadne vyúčtovanie. Najskôr pridaj trénera a jazdcov.</Text>}
    {data.events.map(x=>{const t=totals(x,data.expenses);return <TouchableOpacity key={x.id} style={s.panel} onPress={()=>{setEventId(x.id);setScreen('event')}}><Text style={s.title}>{x.name}</Text><Text style={s.muted}>{x.type} · {data.coaches.find(c=>c.id===x.coachId)?.name||'Bez trénera'}</Text><Text style={s.amount}>{fmt(t.remaining,x.currency)} zostáva</Text><Text style={s.muted}>{t.count} dokladov · {t.incomplete} na kontrolu</Text></TouchableOpacity>})}
  </>}
  {screen==='profiles'&&<><Header title="Tréneri a jazdci" onBack={back}/>
    <Text style={s.section}>Pridať trénera</Text><Field label="Meno a priezvisko" value={draft.coachName||''} onChangeText={v=>setDraft(d=>({...d,coachName:v}))}/><Button label="Uložiť trénera" onPress={()=>{if(!draft.coachName?.trim())return;update('coaches',{id:id(),name:draft.coachName.trim()});setDraft(d=>({...d,coachName:''}))}}/>
    {data.coaches.map(c=><Text key={c.id} style={s.muted}>• {c.name}</Text>)}
    <Text style={s.section}>Pridať jazdca</Text><Field label="Meno jazdca" value={draft.riderName||''} onChangeText={v=>setDraft(d=>({...d,riderName:v}))}/><Button label="Uložiť jazdca" onPress={()=>{if(!draft.riderName?.trim())return;update('riders',{id:id(),name:draft.riderName.trim()});setDraft(d=>({...d,riderName:''}))}}/>
    {data.riders.map(c=><Text key={c.id} style={s.muted}>• {c.name}</Text>)}
  </>}
  {screen==='newEvent'&&<><Header title="Nové vyúčtovanie" onBack={back}/>
    <Text style={s.label}>Typ akcie</Text><View style={s.wrap}>{['Sústredenie','Preteky'].map(t=><Choice key={t} label={t} chosen={draft.type===t} onPress={()=>setDraft(d=>({...d,type:t}))}/>)}</View>
    <Field label="Názov akcie" value={draft.name||''} onChangeText={v=>setDraft(d=>({...d,name:v}))} placeholder="Pitztal SBX"/>
    <Field label="Začiatok (RRRR-MM-DD)" value={draft.start||''} onChangeText={v=>setDraft(d=>({...d,start:v}))}/>
    <Field label="Koniec (RRRR-MM-DD)" value={draft.end||''} onChangeText={v=>setDraft(d=>({...d,end:v}))}/>
    <Field label="Záloha" value={draft.advance||''} onChangeText={v=>setDraft(d=>({...d,advance:v}))} keyboardType="decimal-pad"/>
    <Text style={s.label}>Mena</Text><View style={s.wrap}>{['EUR','CZK','CHF'].map(t=><Choice key={t} label={t} chosen={draft.currency===t} onPress={()=>setDraft(d=>({...d,currency:t}))}/>)}</View>
    <Text style={s.section}>Tréner</Text><View style={s.wrap}>{data.coaches.map(c=><Choice key={c.id} label={c.name} chosen={draft.coachId===c.id} onPress={()=>setDraft(d=>({...d,coachId:c.id}))}/>)}</View>
    <Text style={s.section}>Jazdci</Text><View style={s.wrap}>{data.riders.map(r=><Choice key={r.id} label={r.name} chosen={draft.riderIds?.includes(r.id)} onPress={()=>setDraft(d=>({...d,riderIds:d.riderIds?.includes(r.id)?d.riderIds.filter(k=>k!==r.id):[...(d.riderIds||[]),r.id]}))}/>)}</View>
    <Button label="Vytvoriť vyúčtovanie" onPress={()=>{if(!draft.name?.trim()||!draft.coachId||!Number.isFinite(amount(draft.advance))){Alert.alert('Údaje','Vyplň názov, trénera a platnú zálohu.');return;}const x={...draft,id:id(),advance:amount(draft.advance)};update('events',x);setEventId(x.id);setScreen('event')}}/>
  </>}
  {screen==='event'&&event&&<><Header title={event.name} onBack={back}/><Text style={s.muted}>{event.type} · {event.start||'—'} až {event.end||'—'}</Text>
    <View style={s.panel}><Text style={s.muted}>Zostáva zo zálohy</Text><Text style={[s.big,{color:summary.remaining<0?'#ff818f':'#79e5b8'}]}>{fmt(summary.remaining,event.currency)}</Text>
     <Text style={s.muted}>Záloha {fmt(summary.advance,event.currency)} · Výdavky {fmt(summary.spent,event.currency)}</Text>
     <View style={s.bar}><View style={[s.barFill,{width:(summary.advance?Math.min(100,Math.max(0,summary.spent/summary.advance*100)):0)+'%'}]}/></View>
     {summary.categories.filter(x=>x.total>0).map(c=><Text key={c.id} style={s.muted}>{c.label}: {fmt(c.total,event.currency)}</Text>)}
    </View>
    <View style={s.panel}><Text style={s.title}>Kontrola dokladov</Text><Text style={s.muted}>{summary.count} účteniek · {summary.incomplete} nekompletných · {summary.missingBank} chýbajúcich potvrdení</Text></View>
    <Text style={s.section}>1. Nahrať účtenky</Text><Button label="📷 Odfoť účtenku" disabled={busy} onPress={()=>addReceipts(true)}/><Button label="Nahrať viac účteniek z galérie" kind="secondary" disabled={busy} onPress={()=>addReceipts(false)}/>
    <Text style={s.section}>2. Doplniť bankové potvrdenia</Text><Button label="Nahrať potvrdenia (PDF / obrázky)" disabled={busy} onPress={addBankDocs}/>
    {banks.filter(x=>!x.expenseId).map(b=><View key={b.id} style={s.panel}><Text style={s.title}>{b.name}</Text><Text style={s.muted}>Priraď k platbe kartou:</Text>{expenses.filter(x=>x.method==='card'&&!x.bankDocumentId).map(x=><Button key={x.id} kind="secondary" label={(x.merchant||'Neznámy obchodník')+' · '+fmt(x.amount,event.currency)} onPress={()=>Alert.alert('Potvrdiť párovanie','Skontroluj sumu a dátum na bankovom potvrdení.',[{text:'Zrušiť'},{text:'Spárovať',onPress:()=>linkBank(b,x)}])}/>)}</View>)}
    <Text style={s.section}>Výdavky</Text>
    {expenses.map(x=><TouchableOpacity key={x.id} style={s.panel} onPress={()=>openExpense(x)}><Text style={s.title}>{x.merchant||x.receiptName||'Účtenka'}</Text><Text style={s.amount}>{fmt(x.amount,event.currency)}</Text><Text style={[s.muted,{color:status(x)==='Kompletné'?'#79e5b8':'#ffc27b'}]}>{status(x)} · {x.method==='card'?'Karta':x.method==='cash'?'Hotovosť':'Neurčené'}</Text></TouchableOpacity>)}
    <Text style={s.section}>Export</Text><Button label="Export ZIP – doklady + súhrn" disabled={busy||!expenses.length} onPress={exportZip}/><Text style={s.muted}>Export je kontrolný. Originálny Excel ZSL a AI rozpoznávanie budú doplnené v ďalšej verzii.</Text>
  </>}
  {screen==='editExpense'&&expense&&<><Header title="Kontrola účtenky" onBack={back}/>
   <Text style={s.muted}>{expense.receiptName}</Text>
   <Field label="Dodávateľ" value={draft.merchant} onChangeText={v=>setDraft(d=>({...d,merchant:v}))}/>
   <Field label="Dátum (RRRR-MM-DD)" value={draft.date} onChangeText={v=>setDraft(d=>({...d,date:v}))}/>
   <Field label="Suma" value={draft.amount} onChangeText={v=>setDraft(d=>({...d,amount:v}))} keyboardType="decimal-pad"/>
   <Text style={s.label}>Platba</Text><View style={s.wrap}>{[['cash','Hotovosť'],['card','Kartou']].map(([value,label])=><Choice key={value} label={label} chosen={draft.method===value} onPress={()=>setDraft(d=>({...d,method:value,bankDocumentId:value==='cash'?null:d.bankDocumentId}))}/>)}</View>
   <Text style={s.label}>Kategória</Text><View style={s.wrap}>{CATEGORIES.map(c=><Choice key={c.id} label={c.label} chosen={draft.category===c.id} onPress={()=>setDraft(d=>({...d,category:c.id}))}/>)}</View>
   <Field label="Poznámka" value={draft.note} onChangeText={v=>setDraft(d=>({...d,note:v}))}/>
   <Text style={s.muted}>Potvrdenie: {draft.method==='cash'?'Nevyžaduje sa':draft.bankDocumentId?'Priradené':'Chýba'}</Text>
   <Button label="Uložiť doklad" onPress={()=>{const value=amount(draft.amount);if(!Number.isFinite(value)){Alert.alert('Suma','Zadaj platnú kladnú sumu.');return;}replace('expenses',{...draft,amount:value});setScreen('event')}}/>
   <Button label="Odstrániť doklad" kind="secondary" onPress={()=>Alert.alert('Odstrániť?','Výdavok sa vymaže z evidencie.',[{text:'Zrušiť'},{text:'Odstrániť',style:'destructive',onPress:()=>{setData(old=>({...old,expenses:old.expenses.filter(x=>x.id!==expense.id),banks:old.banks.map(b=>b.expenseId===expense.id?{...b,expenseId:null}:b)}));setScreen('event')}}])}/>
  </>}
 </ScrollView>{busy&&<View style={s.busy}><ActivityIndicator color={ACCENT}/><Text style={s.muted}>Spracovanie…</Text></View>}</View>
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:BG},scroll:{padding:18,paddingTop:54,paddingBottom:80},header:{flexDirection:'row',alignItems:'center',gap:14,marginBottom:16},headerTitle:{fontSize:25,fontWeight:'800',color:TEXT,flexShrink:1},subtitle:{color:MUTED,fontSize:14,marginBottom:18},section:{fontSize:18,color:TEXT,fontWeight:'800',marginTop:24,marginBottom:12},panel:{backgroundColor:PANEL,borderRadius:16,padding:16,marginTop:12,gap:7},title:{color:TEXT,fontSize:16,fontWeight:'700'},muted:{color:MUTED,fontSize:13,lineHeight:21},amount:{color:TEXT,fontWeight:'800',fontSize:19},big:{fontSize:31,fontWeight:'900'},label:{color:'#d3dcf0',fontSize:13,fontWeight:'700',marginBottom:7},input:{backgroundColor:PANEL,color:TEXT,borderColor:'#30415d',borderWidth:1,borderRadius:12,padding:13,minHeight:49},button:{backgroundColor:ACCENT,paddingVertical:14,paddingHorizontal:14,borderRadius:12,marginTop:8,alignItems:'center'},buttonSecondary:{backgroundColor:'#25344f'},buttonText:{fontWeight:'800',color:BG,textAlign:'center'},wrap:{flexDirection:'row',gap:7,flexWrap:'wrap',marginBottom:8},choice:{backgroundColor:PANEL,paddingHorizontal:12,paddingVertical:11,borderRadius:12,borderWidth:1,borderColor:'#30415d'},choiceSelected:{backgroundColor:'#56458c',borderColor:ACCENT},bar:{height:10,borderRadius:10,backgroundColor:'#32425c',overflow:'hidden',marginTop:12,marginBottom:5},barFill:{height:10,backgroundColor:'#79e5b8'},busy:{position:'absolute',bottom:10,right:20,backgroundColor:PANEL,padding:12,borderRadius:12,flexDirection:'row',gap:8}});
