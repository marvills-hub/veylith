import {$,escapeHtml} from "../core/utils.js";

const STALE_API_MS=45000;
const STALE_WORKER_MS=45000;

let streamState="offline";
let lastApiSuccess=0;
let lastApiFailure=0;
let lastRenderData=null;
let timer=null;

function time(value){
 if(!value)return 0;
 const parsed=Date.parse(value);
 return Number.isFinite(parsed)?parsed:0;
}

function ageLabel(ms){
 if(ms<1000)return"NOW";
 const seconds=Math.floor(ms/1000);
 if(seconds<60)return`${seconds}s AGO`;
 const minutes=Math.floor(seconds/60);
 return`${minutes}m AGO`;
}

function connectionState(){
 const now=Date.now();

 if(lastApiSuccess&&now-lastApiSuccess>STALE_API_MS)return"stale";
 if(lastApiFailure&&(!lastApiSuccess||lastApiFailure>lastApiSuccess))return"offline";
 if(streamState==="live")return"live";
 if(streamState==="connecting"||streamState==="reconnecting")return"reconnecting";
 return lastApiSuccess?"reconnecting":"offline";
}

function label(value){
 if(value==="live")return"LIVE";
 if(value==="reconnecting")return"RECONNECTING";
 if(value==="stale")return"STALE";
 return"OFFLINE";
}

function workerHeartbeat(worker){
 return time(
  worker.heartbeat_at||
  worker.heartbeatAt||
  worker.updated_at||
  worker.updatedAt
 );
}

function workersFrom(data){
 if(Array.isArray(data?.workerSlots))return data.workerSlots;
 if(Array.isArray(data?.workers))return data.workers;
 return[];
}

function renderWorkers(data){
 const root=$("connectionWorkers");
 if(!root)return;

 const now=Date.now();
 const workers=workersFrom(data);

 if(!workers.length){
  root.innerHTML=`<div class="empty">No worker heartbeat data.</div>`;
  return;
 }

 root.innerHTML=workers.map(worker=>{
  const heartbeat=workerHeartbeat(worker);
  const stale=heartbeat>0&&now-heartbeat>STALE_WORKER_MS;
  const status=stale?"stale":String(worker.status||"unknown").toLowerCase();
  const name=worker.worker_id||worker.workerId||worker.id||"worker";
  const phase=worker.phase||"idle";

  return`
   <div class="connection-worker ${stale?"stale":""}">
    <span class="worker-health-dot ${stale?"stale":"live"}"></span>
    <div>
     <strong>${escapeHtml(name)}</strong>
     <span>${escapeHtml(phase)}</span>
    </div>
    <b>${stale?"STALE":escapeHtml(status.toUpperCase())}</b>
    <small>${heartbeat?ageLabel(now-heartbeat):"NO HEARTBEAT"}</small>
   </div>`;
 }).join("");
}

function render(){
 const current=connectionState();
 const badge=$("connectionBadge");
 const text=$("connectionText");
 const detail=$("connectionDetail");

 if(badge){
  badge.className=`connection-badge ${current}`;
  badge.textContent=label(current);
 }

 if(text)text.textContent=
  current==="live"?"REAL-TIME STREAM CONNECTED":
  current==="reconnecting"?"SSE INTERRUPTED — FALLBACK POLLING ACTIVE":
  current==="stale"?"DASHBOARD DATA IS STALE":
  "VEYLITH API UNREACHABLE";

 if(detail){
  const age=lastApiSuccess?ageLabel(Date.now()-lastApiSuccess):"NEVER";
  detail.textContent=`LAST API RESPONSE ${age}`;
 }

 if(lastRenderData)renderWorkers(lastRenderData);

 const topStatus=$("systemStatus");
 const topDot=$("systemDot");

 if(topStatus){
  topStatus.textContent=
   current==="live"?"SYSTEM LIVE":
   current==="reconnecting"?"SYSTEM RECONNECTING":
   current==="stale"?"SYSTEM STALE":
   "SYSTEM OFFLINE";
 }

 if(topDot)topDot.className=`status-dot ${
  current==="live"?"online":
  current==="reconnecting"?"reconnecting":
  current==="stale"?"stale":
  "offline"
 }`;
}

export function streamConnectionChanged(info){
 streamState=info?.state||"offline";
 render();
}

export function apiRequestSucceeded(data){
 lastApiSuccess=Date.now();
 lastRenderData=data||lastRenderData;
 render();
}

export function apiRequestFailed(){
 lastApiFailure=Date.now();
 render();
}

export function renderConnectionHealth(data){
 lastRenderData=data;
 render();
}

export function connectionHealthState(){
 return{
  state:connectionState(),
  streamState,
  lastApiSuccess,
  lastApiFailure
 };
}

export function startConnectionHealth(){
 if(timer)return;
 render();
 timer=setInterval(render,5000);
}

export function stopConnectionHealth(){
 if(!timer)return;
 clearInterval(timer);
 timer=null;
}
