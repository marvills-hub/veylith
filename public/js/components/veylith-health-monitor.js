import {connectionHealthState} from "./connection-health.js";

const STORAGE_KEY="veylith-health-history-v1";
const MAX_POINTS=60;
let history=[];

function arr(value){return Array.isArray(value)?value:[]}
function norm(value){return String(value||"").toLowerCase()}
function num(value){const n=Number(value);return Number.isFinite(n)?n:0}

function load(){
 try{
  const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");
  if(Array.isArray(value))history=value.slice(-MAX_POINTS);
 }catch{history=[]}
}

function save(){
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify(history.slice(-MAX_POINTS)))}catch{}
}

function workerHeartbeat(worker){
 const value=worker?.heartbeat_at||worker?.heartbeatAt||worker?.updated_at||worker?.updatedAt;
 const parsed=Date.parse(value||"");
 return Number.isFinite(parsed)?parsed:0;
}

function calculate(data){
 let score=100;
 const reasons=[];
 const connection=connectionHealthState();
 if(connection.state==="offline"){
  score-=35;
  reasons.push("Runtime offline");
 }else if(connection.state==="stale"){
  score-=20;
  reasons.push("Runtime data stale");
 }else if(connection.state==="reconnecting"){
  score-=10;
  reasons.push("Runtime reconnecting");
 }

 const ai=data?.ai||{};
 if(ai.configured===false){
  score-=20;
  reasons.push("AI not configured");
 }

 const circuits=arr(data?.providerCircuits);
 const badCircuits=circuits.filter(item=>{
  const state=norm(item?.state||item?.status);
  return ["open","failed","error","offline","unavailable"].includes(state);
 }).length;
 if(badCircuits){
  score-=Math.min(20,badCircuits*10);
  reasons.push(`${badCircuits} provider circuit${badCircuits===1?"":"s"} unhealthy`);
 }

 const jobs=arr(data?.jobs);
 const failedJobs=jobs.filter(job=>["failed","error"].includes(norm(job?.status))).length;
 const runningJobs=jobs.filter(job=>["running","working","claimed","executing"].includes(norm(job?.status))).length;
 const queuedJobs=jobs.filter(job=>["queued","pending"].includes(norm(job?.status))).length;

 if(failedJobs){
  score-=Math.min(25,failedJobs*5);
  reasons.push(`${failedJobs} failed job${failedJobs===1?"":"s"}`);
 }

 if(queuedJobs>10&&runningJobs===0){
  score-=10;
  reasons.push("Queue stalled");
 }

 const workers=arr(data?.workerSlots).length?arr(data?.workerSlots):arr(data?.workers);
 const now=Date.now();
 const staleWorkers=workers.filter(worker=>{
  const heartbeat=workerHeartbeat(worker);
  return heartbeat&&now-heartbeat>45000;
 }).length;

 if(staleWorkers){
  score-=Math.min(20,staleWorkers*5);
  reasons.push(`${staleWorkers} stale worker${staleWorkers===1?"":"s"}`);
 }

 const projects=arr(data?.projects);
 const failedProjects=projects.filter(project=>["failed","blocked"].includes(norm(project?.status))).length;
 if(failedProjects){
  score-=Math.min(15,failedProjects*3);
  reasons.push(`${failedProjects} project${failedProjects===1?"":"s"} need attention`);
 }

 const sandbox=data?.sandbox||{};
 if(sandbox.isolated===false){
  score-=10;
  reasons.push("Sandbox not isolated");
 }

 score=Math.max(0,Math.min(100,Math.round(score)));

 return{
  score,
  reasons,
  runningJobs,
  queuedJobs,
  failedJobs,
  staleWorkers,
  connection:connection.state
 };
}

function status(score){
 if(score>=90)return{label:"STABLE",cls:"stable"};
 if(score>=75)return{label:"DEGRADED",cls:"degraded"};
 if(score>=50)return{label:"WARNING",cls:"warning"};
 return{label:"CRITICAL",cls:"critical"};
}

function ensure(){
 let root=document.getElementById("veylithHealthMonitor");
 if(root)return root;

 const scene=document.getElementById("veylithScene");
 if(!scene)return null;

 root=document.createElement("section");
 root.id="veylithHealthMonitor";
 root.className="veylith-health-monitor";
 root.innerHTML=`
  <div class="vhm-head">
   <div>
    <strong>VEYLITH HEALTH</strong>
    <span id="vhmReason">INITIALIZING</span>
   </div>
   <div class="vhm-score">
    <b id="vhmScore">--%</b>
    <span id="vhmStatus">CALCULATING</span>
   </div>
  </div>
  <div class="vhm-chart">
   <svg id="vhmSvg" viewBox="0 0 1000 150" preserveAspectRatio="none">
    <defs>
     <linearGradient id="vhmArea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d92218" stop-opacity=".24"/>
      <stop offset="100%" stop-color="#d92218" stop-opacity="0"/>
     </linearGradient>
     <filter id="vhmGlow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
     </filter>
    </defs>
    <g class="vhm-grid">
     <line x1="0" y1="20" x2="1000" y2="20"/>
     <line x1="0" y1="55" x2="1000" y2="55"/>
     <line x1="0" y1="90" x2="1000" y2="90"/>
     <line x1="0" y1="125" x2="1000" y2="125"/>
    </g>
    <path id="vhmAreaPath" class="vhm-area"/>
    <polyline id="vhmLine" class="vhm-line"/>
   </svg>
   <div class="vhm-scale"><span>100</span><span>75</span><span>50</span><span>25</span></div>
  </div>
  <div class="vhm-foot">
   <span id="vhmConnection">RUNTIME --</span>
   <span id="vhmJobs">0 RUNNING · 0 QUEUED</span>
   <span id="vhmFailures">0 FAILURES</span>
   <span>60 SAMPLE HISTORY</span>
  </div>`;

 scene.parentElement?.insertBefore(root,scene);
 return root;
}

let liveHealth=100;
let healthObservations=[];
let renderedSeries=[];
let trendAnimation=0;
let lastObservationAt=0;
let lastFrameAt=0;
const HEALTH_HISTORY_KEY="veylith-health-trend-v2";
const MAX_OBSERVATIONS=180;
const DISPLAY_POINTS=120;

function loadTrend(){
 try{
  const saved=JSON.parse(localStorage.getItem(HEALTH_HISTORY_KEY)||"[]");
  if(Array.isArray(saved)){
   healthObservations=saved
    .filter(item=>Number.isFinite(Number(item?.score))&&Number.isFinite(Number(item?.time)))
    .slice(-MAX_OBSERVATIONS);
  }
 }catch{
  healthObservations=[];
 }
}

function saveTrend(){
 try{
  localStorage.setItem(
   HEALTH_HISTORY_KEY,
   JSON.stringify(healthObservations.slice(-MAX_OBSERVATIONS))
  );
 }catch{}
}

function recordObservation(force=false){
 const now=Date.now();

 if(!force&&now-lastObservationAt<1500)
  return;

 lastObservationAt=now;

 healthObservations.push({
  time:now,
  score:Math.max(0,Math.min(100,Number(liveHealth)||0))
 });

 if(healthObservations.length>MAX_OBSERVATIONS)
  healthObservations=healthObservations.slice(-MAX_OBSERVATIONS);

 saveTrend();
}

function hashNoise(index){
 const x=Math.sin(index*12.9898+78.233)*43758.5453;
 return((x-Math.floor(x))*2)-1;
}

function interpolateRealHealth(position){
 if(!healthObservations.length)
  return liveHealth;

 if(healthObservations.length===1)
  return healthObservations[0].score;

 const scaled=position*(healthObservations.length-1);
 const left=Math.floor(scaled);
 const right=Math.min(healthObservations.length-1,left+1);
 const mix=scaled-left;

 const a=Number(healthObservations[left]?.score??liveHealth);
 const b=Number(healthObservations[right]?.score??a);

 return a+(b-a)*mix;
}

function buildTargetSeries(time){
 const points=[];

 for(let i=0;i<DISPLAY_POINTS;i++){
  const position=i/(DISPLAY_POINTS-1);
  const realHealth=interpolateRealHealth(position);

  const broad=
   Math.sin(i*.23+time*.00018)*1.55+
   Math.sin(i*.087+1.7+time*.00009)*1.15;

  const medium=
   Math.sin(i*.61+2.4)*.72+
   Math.sin(i*.39+.8)*.48;

  const fine=hashNoise(i+Math.floor(time/1400)*7)*.62;

  const severity=Math.max(0,(100-realHealth)/100);

  const visualVariation=
   broad+
   medium+
   fine*(1+severity*.75);

  points.push(
   Math.max(
    0,
    Math.min(
     100,
     realHealth+visualVariation
    )
   )
  );
 }

 return points;
}

function animateTrend(time=0){
 const line=document.getElementById("vhmLine");
 const area=document.getElementById("vhmAreaPath");

 if(!line||!area){
  trendAnimation=requestAnimationFrame(animateTrend);
  return;
 }

 if(time-lastObservationAt>=1500)
  recordObservation();

 const target=buildTargetSeries(time);

 if(renderedSeries.length!==DISPLAY_POINTS)
  renderedSeries=[...target];

 for(let i=0;i<DISPLAY_POINTS;i++){
  renderedSeries[i]+=(target[i]-renderedSeries[i])*.07;
 }

 const width=1000;
 const top=7;
 const bottom=103;
 const chartHeight=bottom-top;

 const points=renderedSeries.map((score,index)=>{
  const x=(index/(DISPLAY_POINTS-1))*width;
  const y=top+((100-score)/100)*chartHeight;

  return{
   x,
   y:Math.max(top,Math.min(bottom,y))
  };
 });

 const linePoints=points
  .map(point=>`${point.x.toFixed(1)},${point.y.toFixed(1)}`)
  .join(" ");

 line.setAttribute("points",linePoints);

 const first=points[0];
 const last=points[points.length-1];

 area.setAttribute(
  "d",
  `M ${first.x.toFixed(1)} ${bottom} L ${linePoints.replaceAll(","," ")} L ${last.x.toFixed(1)} ${bottom} Z`
 );

 lastFrameAt=time;
 trendAnimation=requestAnimationFrame(animateTrend);
}

function draw(){
 if(!trendAnimation)
  trendAnimation=requestAnimationFrame(animateTrend);
}

loadTrend();export function renderVeylithHealth(data){
 const root=ensure();
 if(!root)return;

 const health=calculate(data);
 liveHealth=health.score;
 recordObservation(true);
 const state=status(health.score);

 history.push({time:Date.now(),score:health.score});
 if(history.length>MAX_POINTS)history=history.slice(-MAX_POINTS);
 save();

 const score=document.getElementById("vhmScore");
 const stateNode=document.getElementById("vhmStatus");
 const reason=document.getElementById("vhmReason");
 const connection=document.getElementById("vhmConnection");
 const jobs=document.getElementById("vhmJobs");
 const failures=document.getElementById("vhmFailures");

 root.dataset.state=state.cls;
 if(score)score.textContent=`${health.score}%`;
 if(stateNode)stateNode.textContent=state.label;
 if(reason)reason.textContent=health.reasons[0]||"ALL CORE SYSTEMS NOMINAL";
 if(connection)connection.textContent=`RUNTIME ${health.connection.toUpperCase()}`;
 if(jobs)jobs.textContent=`${health.runningJobs} RUNNING · ${health.queuedJobs} QUEUED`;
 if(failures)failures.textContent=`${health.failedJobs} FAILURE${health.failedJobs===1?"":"S"}`;

 draw();
}

load();






