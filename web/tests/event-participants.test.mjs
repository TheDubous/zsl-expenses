import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TEAM_ROLES,resolveEventParticipants,applyTeamChange} from '../src/event-participants.mjs';
import {buildTemplatePatches} from '../src/zsl-template-map.mjs';
import {participantCsv} from '../src/archive.js';

const trainers=[
 {id:'main',name:'Eva Účetní',role:'Tréner',club:'ZSL'},
 {id:'chief',name:'Jan Vedoucí',role:'Tréner',club:'ZSL',contact:'test@example.test'},
 {id:'wax',name:'Petr Servis',role:'Servis',club:'Waxlab'},
 {id:'assistant',name:'Dana Asistent',club:'ZSL'}
];
const riders=[
 {id:'athlete1',name:'Alex Racing',club:'SKI',birthYear:'2010'},
 {id:'athlete2',name:'Sára Snow',club:'ZSL',birthYear:'2011'}
];
const event={id:'trip',trainerId:'main',riderIds:['athlete1','athlete2'],
 tourLeaderId:'chief',staffAssignments:[
  {personId:'chief',role:'coach'},
  {personId:'wax',role:'service'},
  {personId:'assistant',role:'assistant'}
 ]};
test('staff, assistants and athletes have independent roles, trip leader is not claimant',()=>{
 const people=resolveEventParticipants(event,trainers,riders);
 assert.equal(people.length,6);
 assert.equal(people[0].name,'Jan Vedoucí');
 assert.equal(people[0].isLeader,true);
 assert.equal(people.find(x=>x.id==='main').isLeader,false);
 assert.equal(people.find(x=>x.id==='wax').roleLabel,'Servisný technik');
 assert.equal(people.find(x=>x.id==='assistant').roleLabel,'Asistent trénera');
 assert.equal(people.filter(x=>x.kind==='athlete').length,2);
 assert.equal(people.find(x=>x.id==='athlete1').birthYear,'2010');
 assert.ok(TEAM_ROLES.some(x=>x.id==='service'));
});
test('old trips without staff fields still show claimant and sportspersons',()=>{
 const people=resolveEventParticipants({trainerId:'main',riderIds:['athlete1','athlete1']},trainers,riders);
 assert.deepEqual(people.map(x=>x.id),['main','athlete1']);
 assert.ok(!people.some(x=>x.isLeader));
});
test('leader can be selected even without a separate staff checkbox',()=>{
 const people=resolveEventParticipants({trainerId:'main',tourLeaderId:'chief'},trainers,riders);
 assert.equal(people[0].id,'chief');
 assert.equal(people.length,2);
});
test('staff roles and leader can change per trip without destroying historical rider changes',()=>{
 const old={id:'trip',trainerId:'main',riderIds:['athlete1'],
  rosterChanges:[{action:'joined',riderId:'athlete1',at:'2026-11-01'}]};
 const changed=applyTeamChange(old,{
   riderIds:['athlete1','athlete2'],
   staffAssignments:[{personId:'wax',role:'service'}],
   tourLeaderId:'chief'
 },'2026-11-18T10:00:00Z','Změna plánu');
 assert.deepEqual(changed.riderIds,['athlete1','athlete2']);
 assert.equal(changed.rosterChanges.length,2);
 assert.equal(changed.staffAssignments[0].role,'service');
 assert.equal(changed.tourLeaderId,'chief');
 assert.ok(changed.teamChanges.some(x=>x.action==='leader_changed'));
 assert.equal(old.tourLeaderId,undefined);
 const updated=applyTeamChange(changed,{
   riderIds:['athlete2'],staffAssignments:[{personId:'wax',role:'assistant'}],
   tourLeaderId:'main'
 },'2026-11-19T10:00:00Z');
 assert.ok(updated.teamChanges.some(x=>x.action==='role_changed'&&x.role==='assistant'));
 assert.ok(updated.rosterChanges.some(x=>x.riderId==='athlete1'&&x.action==='left'));
});
test('leader goes into existing s.6 person and role cell, while claimant is unchanged',()=>{
 const members=resolveEventParticipants(event,trainers,riders);
 const {patches}=buildTemplatePatches({
  event:{...event,currency:'EUR'},trainer:trainers[0],riders,members,
  expenses:[],funding:[],variant:'official'
 });
 const pick=(sheet,cell)=>patches.find(p=>p.sheet===sheet&&p.cell===cell)?.value;
 assert.equal(pick('s.1 - pokyn','B18'),'Eva Účetní');
 assert.equal(pick('s.1 - pokyn','D18'),'Alex Racing');
 assert.equal(pick('s.6 - správa','C26'),'Jan Vedoucí');
 assert.equal(pick('s.6 - správa','F26'),'Vedúci výjazdu');
 assert.equal(pick('s.6 - správa','C27'),'Eva Účetní');
 assert.equal(pick('s.6 - správa','C28'),'Petr Servis');
 assert.equal(pick('s.6 - správa','F28'),'Servisný technik');
 assert.equal(pick('s.6 - správa','F30'),'Športovec');
});
test('complete participant CSV includes more people than the unchanged ZSL print template supports',()=>{
 const members=Array.from({length:25},(_,i)=>({
  id:'p'+i,name:'Participant '+i,kind:'athlete',roleLabel:'Športovec',
  club:'Club',birthYear:'2012',isLeader:false
 }));
 const result=buildTemplatePatches({event:{currency:'EUR'},trainer:{},riders:[],
   members,expenses:[],funding:[],variant:'official'});
 assert.ok(result.warnings.some(w=>w.includes('21 účastníků')));
 assert.equal(result.patches.filter(p=>p.sheet==='s.6 - správa'&&/^C(?:2[6-9]|3\d|4[0-6])$/.test(p.cell)).length,21);
 const csv=participantCsv(members);
 assert.ok(csv.startsWith('\ufeff'));
 assert.match(csv,/Participant 24/);
 assert.match(csv,/Jméno a příjmení/);
 assert.equal(csv.trim().split('\r\n').length,26);
});

test('roster CSV neutralizes formula-like participant names without deleting the name',()=>{
 const csv=participantCsv([{name:'=IMPORTXML("bad")',kind:'athlete',
   roleLabel:'Športovec',club:'Club',isLeader:false}]);
 assert.ok(csv.includes("'=IMPORTXML"));
 assert.ok(!csv.includes(';"=IMPORTXML'));
});
