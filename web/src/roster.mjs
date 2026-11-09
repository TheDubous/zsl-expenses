export function applyRosterChange(event,ids,at=new Date().toISOString(),reason=''){
  const next=[...new Set(ids)];
  const before=Array.isArray(event?.riderIds)?event.riderIds:[];
  const changes=[
    ...next.filter(id=>!before.includes(id)).map(riderId=>({riderId,action:'joined',at,reason})),
    ...before.filter(id=>!next.includes(id)).map(riderId=>({riderId,action:'left',at,reason}))
  ];
  return {...event,riderIds:next,rosterChanges:[...(event?.rosterChanges||[]),...changes]};
}
