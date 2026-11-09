import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyRosterChange} from '../src/roster.mjs';
test('rider can leave then return without destroying old records',()=>{
 const initial={id:'event1',riderIds:['r1','r2'],rosterChanges:[],name:'Preteky'};
 const changed=applyRosterChange(initial,['r2'],'2026-11-09T10:00:00Z');
 assert.deepEqual(changed.riderIds,['r2']);
 assert.equal(changed.rosterChanges[0].riderId,'r1');
 assert.equal(changed.rosterChanges[0].action,'left');
 assert.deepEqual(initial.riderIds,['r1','r2']);
 const back=applyRosterChange(changed,['r2','r1'],'2026-11-10T10:00:00Z');
 assert.deepEqual(back.riderIds,['r2','r1']);
 assert.equal(back.rosterChanges[1].action,'joined');
 assert.equal(back.rosterChanges.length,2);
});
test('roster order and accidental duplicates do not add phantom participants',()=>{
 const result=applyRosterChange({riderIds:[]},['r1','r1','r2']);
 assert.deepEqual(result.riderIds,['r1','r2']);
 assert.equal(result.rosterChanges.length,2);
});

test('roster reason is kept for departures',()=>{
 const x=applyRosterChange({riderIds:['athlete1']},[],'2026-11-09T12:00:00Z','Nemoc');
 assert.equal(x.rosterChanges[0].reason,'Nemoc');
 assert.deepEqual(x.riderIds,[]);
});
