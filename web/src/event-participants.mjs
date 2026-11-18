import {applyRosterChange} from './roster.mjs';

/** Roles belong to a particular trip, not permanently to a person. */
export const TEAM_ROLES=[
 {id:'coach',label:'Trenér',xlsx:'Tréner'},
 {id:'assistant',label:'Asistent trenéra',xlsx:'Asistent trénera'},
 {id:'service',label:'Servisní technik',xlsx:'Servisný technik'},
 {id:'physio',label:'Fyzioterapeut',xlsx:'Fyzioterapeut'},
 {id:'driver',label:'Řidič / logistika',xlsx:'Vodič / logistika'},
 {id:'other',label:'Jiná role',xlsx:'Doprovod'}
];
const ROLE_BY_ID=new Map(TEAM_ROLES.map(role=>[role.id,role]));
const text=value=>String(value||'').trim();
const roleOf=(id,profile)=>ROLE_BY_ID.get(id)||ROLE_BY_ID.get('other');
export function teamRoleLabel(role,person={}){
 const r=roleOf(role,person);
 return r.id==='other'?text(person.role)||r.xlsx:r.xlsx;
}
function profileName(person){
 return [person?.title,person?.name].map(text).filter(Boolean).join(' ');
}
/** Build the single, deduplicated trip roster used by UI, XLSX and ZIP. */
export function resolveEventParticipants(event={},trainers=[],riders=[]){
 const byTrainer=new Map(trainers.map(t=>[t.id,t]));
 const byRider=new Map(riders.map(r=>[r.id,r]));
 const staff=new Map();
 const addStaff=(personId,role)=>{
   const person=byTrainer.get(personId);
   if(!person||!text(person.name))return;
   const effectiveRole=ROLE_BY_ID.has(role)?role:'coach';
   staff.set(personId,{
     id:personId,name:profileName(person),kind:'staff',role:effectiveRole,
     roleLabel:teamRoleLabel(effectiveRole,person),
     club:text(person.club),contact:text(person.contact),
     isLeader:false
   });
 };
 // Older events use only trainerId and riderIds. They remain compatible.
 addStaff(event.trainerId,'coach');
 for(const assignment of event.staffAssignments||[]){
   if(assignment&&text(assignment.personId))addStaff(assignment.personId,assignment.role);
 }
 const leaderId=text(event.tourLeaderId);
 if(leaderId&&!staff.has(leaderId))addStaff(leaderId,'coach');
 if(staff.has(leaderId))staff.get(leaderId).isLeader=true;
 const members=[...staff.values()].sort((a,b)=>
   Number(b.isLeader)-Number(a.isLeader));
 const seenRider=new Set();
 for(const id of event.riderIds||[]){
   if(seenRider.has(id))continue;
   seenRider.add(id);
   const person=byRider.get(id);
   if(!person||!text(person.name))continue;
   members.push({id,name:text(person.name),kind:'athlete',role:'athlete',
     roleLabel:'Športovec',club:text(person.club),
     birthYear:text(person.birthYear),isLeader:false});
 }
 return members;
}
/** Track staff changes without replacing legacy rider history or removing people. */
export function applyTeamChange(event,{riderIds=[],staffAssignments=[],tourLeaderId=''},
 at=new Date().toISOString(),reason=''){
 const roster=applyRosterChange(event,riderIds,at,reason);
 const prior=new Map((event.staffAssignments||[]).map(x=>[x.personId,x.role]));
 const selected=new Map();
 for(const assignment of staffAssignments){
   const id=text(assignment?.personId);
   if(!id)continue;
   selected.set(id,ROLE_BY_ID.has(assignment.role)?assignment.role:'other');
 }
 const next=[...selected].map(([personId,role])=>({personId,role}));
 const changes=[];
 for(const [id,role] of selected){
   const previous=prior.get(id);
   if(previous===undefined)changes.push({personId:id,action:'joined',role,at,reason});
   else if(previous!==role)changes.push({personId:id,action:'role_changed',role,previousRole:previous,at,reason});
 }
 for(const [id,role] of prior){
   if(!selected.has(id))changes.push({personId:id,action:'left',role,at,reason});
 }
 const leader=text(tourLeaderId);
 if(text(event.tourLeaderId)!==leader){
   changes.push({action:'leader_changed',personId:leader||null,
     previousPersonId:text(event.tourLeaderId)||null,at,reason});
 }
 return {...roster,staffAssignments:next,tourLeaderId:leader,
   teamChanges:[...(event.teamChanges||[]),...changes]};
}
