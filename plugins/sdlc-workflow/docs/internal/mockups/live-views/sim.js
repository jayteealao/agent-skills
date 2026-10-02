/* Shared run script for options D and E. Each scene owns a plain state object;
   steps mutate it, and each page renders the state in its own style. */
(function(){
const STAGES=['plan','implement','verify','review'];
const SLICES=[['s1','module-boundaries'],['s2','event-bus'],['s3','match-clock'],['s4','action-queue'],['s5','replay-hooks'],['s6','fast-model'],['s7','perf-budget']];
const USUAL=[6,14,8,5];

/* ---------------- yolo ---------------- */
const yolo={
  init(){
    const s={ slices:SLICES.map(([id,name],i)=>({id,name,stage:i<2?4:-1,p:0})), cur:2, used:6*60, usual:8*60,
      gap:3, rate:20, elapsed:14*60+2, agents:[{name:'verify-runner',model:'opus'}], commits:11, lastCommit:'match-clock: fixed-step tick with drift guard',
      needs:[], steerRead:4, steerTotal:4, steerEdited:'13:40', prot:'intact', h5:58, wk:61, stopReq:null, halted:false, log:[],
      durations:[5,12,7,4,6,13,8,5], journal:'agent-start verify-runner s3' };
    s.slices[2].stage=2; s.slices[2].p=.15;
    log(s,'13:58','Yolo resumed on engine-modules at s3 verify.');
    return s;
  },
  steps:[
    [1400,s=>{ beat(s,'tool cargo test'); prog(s,.45); }],
    [1400,s=>{ beat(s,'tool playwright smoke'); prog(s,.8); }],
    [1200,s=>{ beat(s,'agent-end verify-runner'); prog(s,1); log(s,'14:22','Verify on s3 passed: 412 tests, 2 retried.'); }],
    [900, s=>{ if(bound(s,'verify')) return halt(s); next(s,3); s.agents=[{name:'review-writer',model:'opus'},{name:'refuter',model:'sonnet'},{name:'refuter',model:'sonnet'}]; }],
    [1500,s=>{ beat(s,'decision D6 recorded'); prog(s,.45); s.needs.push({id:'d6',kind:'intent',title:'D6 · intent-bearing',body:'Replay hooks record every action, not only goals. Matches charter R4.',actions:['Confirm','Open record']}); log(s,'14:29','D6 needs you: intent-bearing, replay hooks.','attn'); }],
    [1400,s=>{ beat(s,'commit 3be81aa'); prog(s,.8); commit(s,'match-clock: clamp drift to 2 ticks'); s.agents=[{name:'review-writer',model:'opus'}]; }],
    [1100,s=>{ beat(s,'agent-end review-writer'); prog(s,1); }],
    [900, s=>{ cur(s).stage=4; s.durations.push(5); if(bound(s,'review')) return halt(s); s.cur=3; next(s,0); s.agents=[{name:'planner',model:'opus'},{name:'scout',model:'sonnet'}]; log(s,'14:33','s3 match-clock done. s4 action-queue starts.'); }],
    [1300,s=>{ beat(s,'agent-end scout'); prog(s,.55); s.agents=[{name:'planner',model:'opus'}]; }],
    [1100,s=>{ beat(s,'agent-end planner'); prog(s,1); }],
    [900, s=>{ if(bound(s,'plan')) return halt(s); next(s,1); s.agents=[{name:'implementer',model:'opus'}]; s.steerRead=0; s.steerEdited='14:36'; log(s,'14:36','You steered: keep the queue lock-free. Added to steer.md.','user'); }],
    [1400,s=>{ beat(s,'agent read steer.md'); s.steerRead=1; prog(s,.3); commit(s,'action-queue: ring buffer with atomic head/tail'); }],
    [1500,s=>{ beat(s,'write PRODUCT.md'); prog(s,.45); s.prot='changed'; s.needs.push({id:'pm',kind:'file',title:'PRODUCT.md · line 88',body:'Implement wrote here. You had uncommitted edits. Nothing was reverted.',actions:['Show diff','Keep']}); log(s,'14:41','PRODUCT.md changed at line 88.','warn'); }],
    [1100,s=>{ beat(s,'tool cargo build --release'); s.steerRead=2; s.rate=170; }],
    [4300,s=>{}],
    [2400,s=>{ s.rate=20; beat(s,'build finished 10m 40s'); prog(s,.85); commit(s,'action-queue: drain in fixed-step order'); log(s,'14:53','The quiet gap was a 10 min release build.'); }],
    [1200,s=>{ beat(s,'agent-end implementer'); prog(s,1); }],
    [900, s=>{ if(bound(s,'implement')) return halt(s); next(s,2); s.agents=[{name:'verify-runner',model:'opus'}]; if(!s.stopReq){ s.stopReq='verify'; log(s,'14:58','You asked: stop after verify.','user'); } }],
    [1400,s=>{ beat(s,'tool cargo test'); prog(s,.5); }],
    [1400,s=>{ beat(s,'tool playwright smoke'); prog(s,1); }],
    [900, s=>{ beat(s,'agent-end verify-runner'); return bound(s,'verify')? halt(s): undefined; }],
  ],
  tick(s,dt){ if(s.halted) return; s.gap+=dt*s.rate; s.elapsed+=dt*20; s.used+=dt*20; },
};
function cur(s){ return s.slices[s.cur]; }
function prog(s,p){ cur(s).p=p; }
function next(s,i){ const c=cur(s); if(c.stage>=0&&c.stage<4&&i>c.stage) s.durations.push(Math.round(s.used/60)); c.stage=i; c.p=.04; s.used=0; s.usual=USUAL[i]*60; }
function beat(s,j){ s.gap=0; s.journal=j; }
function commit(s,m){ s.commits++; s.lastCommit=m; }
function log(s,t,text,kind){ s.log.unshift({t,text,kind:kind||''}); s.log=s.log.slice(0,6); }
function bound(s,st){ return s.stopReq && (s.stopReq==='stage' || (s.stopReq==='verify'&&st==='verify')); }
function halt(s){ s.halted=true; s.agents=[]; log(s,'15:07','Stopped after verify on s4. Resume: /wf yolo engine-modules','stop'); return 'end'; }

/* ---------------- campaign ---------------- */
const campaign={
  init(){
    const s={ waves:[
        {n:1,version:'v0.4.0-beta.1',gates:6,run:false,slugs:[{name:'event-contract',state:'done',stage:4},{name:'player-record',state:'done',stage:4}]},
        {n:2,version:null,gates:0,run:false,slugs:[{name:'team-shape',state:'run',stage:1,note:'implement · 9m'},{name:'action-resolution',state:'run',stage:2,note:'verify · holds lock'}]},
        {n:3,version:null,gates:0,run:false,slugs:[{name:'the-players-mind',state:'prep',stage:-1,note:'needs prepare'},{name:'conditions',state:'prep',stage:-1,note:'needs prepare'}]},
        {n:4,version:null,gates:0,run:false,slugs:[{name:'match-output-ui',state:'wait',stage:-1,note:'waiting'}]} ],
      active:2, h5:58, wk:63, paused:false, cd:0, lock:{holder:'action-resolution',wait:[]},
      prs:[{wave:1,pr:'#214',state:'merged',label:'v0.4.0-beta.1'}], build:null, unshipped:0, log:[], forecast:'fits' };
    log(s,'14:10','Wave 1 shipped as v0.4.0-beta.1. Wave 2 runs 2 drives.');
    log(s,'14:12','Wave 3 waits for your prepare.','warn');
    return s;
  },
  steps:[
    [1500,s=>{ sl(s,'team-shape').note='implement · 13m'; }],
    [1600,s=>{ Object.assign(sl(s,'the-players-mind'),{state:'ready',note:'prepared · 24 decisions'}); log(s,'14:24','You prepared the-players-mind.','user'); }],
    [1500,s=>{ Object.assign(sl(s,'team-shape'),{stage:2,note:'verify · waits for lock'}); s.lock.wait=['team-shape']; s.h5=67; s.wk=64; }],
    [1500,s=>{ Object.assign(sl(s,'action-resolution'),{stage:3,note:'review'}); Object.assign(sl(s,'team-shape'),{note:'verify · holds lock'}); s.lock={holder:'team-shape',wait:[]}; }],
    [1500,s=>{ s.h5=76; s.wk=65; s.forecast='tight'; log(s,'14:41','5-hour window at 76%. No new drive starts.','warn'); }],
    [1500,s=>{ Object.assign(sl(s,'action-resolution'),{state:'done',stage:4,note:''}); Object.assign(sl(s,'team-shape'),{stage:3,note:'review'}); s.lock={holder:null,wait:[]}; }],
    [1400,s=>{ Object.assign(sl(s,'team-shape'),{state:'done',stage:4,note:''}); s.waves[1].run=true; log(s,'14:50','Wave 2 merging.'); }],
    [800,s=>{ s.waves[1].gates=1; }],[800,s=>{ s.waves[1].gates=2; }],[800,s=>{ s.waves[1].gates=3; }],
    [900,s=>{ s.waves[1].gates=5; s.waves[1].run=false; s.build='wave-2+3f9c1a2'; s.prs.push({wave:2,pr:'#215',state:'ci',label:'wave-2+3f9c1a2'}); s.unshipped=1; log(s,'14:58','Wave 2 merged. No drift. Build ready to try.','ok'); }],
    [1500,s=>{ s.h5=91; s.wk=66; s.paused=true; s.cd=72*60; sl(s,'the-players-mind').note='paused'; log(s,'15:28','Paused at 91%. Resumes 16:40.','stop'); }],
    [1400,s=>{ pr(s,2).state='green'; }],
    [3800,s=>{}],
    [600,s=>{ s.paused=false; s.h5=4; s.forecast='fits'; s.active=3; Object.assign(sl(s,'the-players-mind'),{state:'run',stage:0,note:'plan'}); log(s,'16:40','Window reset. Wave 3 starts.','ok'); }],
    [1500,s=>{ Object.assign(sl(s,'the-players-mind'),{stage:1,note:'implement'}); s.waves[1].run=true; }],
    [1400,s=>{ s.waves[1].gates=6; s.waves[1].run=false; s.waves[1].version='v0.4.0-beta.2'; Object.assign(pr(s,2),{state:'merged',label:'v0.4.0-beta.2'}); s.unshipped=0; s.build=null; log(s,'16:52','Wave 2 shipped as v0.4.0-beta.2.','ok'); return 'end'; }],
  ],
  tick(s,dt){ if(s.paused){ s.cd=Math.max(0,s.cd-dt*900); } },
  prepare(s){ const x=s.waves.flatMap(w=>w.slugs).find(q=>q.state==='prep'); if(x){ x.state='ready'; x.note='prepared'; } },
};
function sl(s,n){ return s.waves.flatMap(w=>w.slugs).find(x=>x.name===n); }
function pr(s,w){ return s.prs.find(p=>p.wave===w); }

/* ---------------- brainstorm ---------------- */
const TH=[['Match feel',['pressing traps','ball spin','ref advantage','fatigue curve']],['Player mind',['confidence swings','captain voice','grudges']],['Club life',['board patience','fan mood','youth intake']],['Speed & replay',['120× sim','replay scrub','fixed seed','desync guard']]];
const CALL={'pressing traps':'keep','ball spin':'later','ref advantage':'keep','fatigue curve':'keep','confidence swings':'keep','captain voice':'keep','grudges':'cut','board patience':'keep','fan mood':'keep','youth intake':'later','120× sim':'keep','replay scrub':'keep','fixed seed':'keep','desync guard':'later'};
const ORDER=[]; TH.forEach(([t,items],ti)=>items.forEach((_,k)=>ORDER.push([ti,k])));
const brainstorm={
  init(){
    const s={ mode:'explore', threads:TH.map(([name,items])=>({name,items:items.map(n=>({name:n,on:false,call:null}))})), captured:0, walked:0, last:null, focus:null,
      packets:[], rev:3, hotfix:false, src:{r:2,f:1,w:0}, overheard:'What if the captain talks the team down after a goal against?', log:[], turn:18 };
    for(let i=0;i<6;i++) cap(s);
    log(s,'13:02','Captured B06 captain voice under Player mind.');
    return s;
  },
  steps:[
    [1100,s=>cap(s)],[1000,s=>{ cap(s); s.src.r=3; }],[1000,s=>cap(s)],[1000,s=>{ cap(s); s.overheard='Replays should scrub, not just play.'; }],
    [1000,s=>{ cap(s); s.src.f=2; }],[1000,s=>cap(s)],[1000,s=>cap(s)],[1000,s=>{ cap(s); log(s,'13:40','14 ideas in 4 threads.'); }],
    [1400,s=>{ s.mode='scope'; s.overheard='Ok, let’s scope it.'; log(s,'13:41','Scoping walk: keep, cut or later for each idea.','user'); }],
    ...Array.from({length:14},()=>[600,s=>walk(s)]),
    [1500,s=>{ s.mode='done'; s.focus=null; s.overheard='Done.'; s.packets=[{name:'event-contract',size:12,wave:1},{name:'speed-and-replay',size:18,wave:1},{name:'match-feel',size:22,wave:2},{name:'club-life',size:29,wave:2},{name:'the-players-mind',size:51,wave:3}]; s.src.w=5; log(s,'14:02','Done. 5 packets in 3 waves.'); }],
    [1800,s=>{ log(s,'14:05','the-players-mind has 51 decisions: over 40, must split.','stop'); }],
    [1800,s=>{ s.overheard='Split players-mind; keep club-life whole.'; s.packets=s.packets.filter(p=>p.name!=='the-players-mind').concat([{name:'players-mind-morale',size:24,wave:3,isNew:true},{name:'players-mind-decisions',size:27,wave:3,isNew:true}]); s.src.w=6; log(s,'14:06','Split into morale (24) and decisions (27).','user'); }],
    [2400,s=>{ s.rev=4; s.hotfix=true; s.overheard='Replay desyncs after a red card — hotfix.'; s.packets.unshift({name:'hotfix-replay-desync',size:3,wave:0,isNew:true,hot:true}); s.src.w=7; log(s,'15:02','Revision 4: hotfix-replay-desync added, amends speed-and-replay.','attn'); return 'end'; }],
  ],
};
function cap(s){ const [ti,k]=ORDER[s.captured++]; const it=s.threads[ti].items[k]; it.on=true; s.last={item:it.name,thread:s.threads[ti].name,key:'B'+String(s.captured).padStart(2,'0')}; }
function walk(s){ const [ti,k]=ORDER[s.walked++]; const it=s.threads[ti].items[k]; it.call=CALL[it.name]; s.focus=it.name; s.last={item:it.name,thread:s.threads[ti].name,call:it.call}; }

window.SIM={yolo,campaign,brainstorm,STAGES,USUAL};

/* ---------------- shared player ---------------- */
window.makePlayer=function(render){
  const P={active:'yolo',speed:1,idx:0,timer:null,state:null};
  P.restart=function(){ clearTimeout(P.timer); P.idx=0; P.state=SIM[P.active].init(); render(P.active,P.state,'reset'); P.run(); };
  P.run=function(){ clearTimeout(P.timer); const sc=SIM[P.active], st=sc.steps[P.idx];
    if(!st){ P.timer=setTimeout(P.restart,9000/P.speed); return; }
    P.timer=setTimeout(()=>{ const r=st[1](P.state); P.idx++; render(P.active,P.state,'step'); if(r==='end'){ P.timer=setTimeout(P.restart,10000/P.speed); return; } P.run(); }, st[0]/P.speed); };
  setInterval(()=>{ const sc=SIM[P.active]; if(sc.tick&&P.state){ sc.tick(P.state,.1*P.speed); render(P.active,P.state,'tick'); } },100);
  return P;
};
})();
