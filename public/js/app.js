import { setupResponsiveDashboard } from "./components/responsive-dashboard.js";
import { setupSystemWidgetControl } from "./components/system-widget-control.js";
import { $ } from "./core/utils.js";
import { getState, setState } from "./core/state.js";
import { api } from "./api/client.js";
import { connectEvents, eventConnectionState } from "./api/events.js";
import { renderStats, renderWorkers, renderProjects } from "./components/summary.js";
import { renderTasks, renderEvents, prependEvent, setDevelopmentWorker, setDevelopmentWorkerRole } from "./components/activity.js";
import { metric, metrics } from "./components/charts.js";
import { renderSystem } from "./components/health.js";
import { renderAutonomousTeam, getActiveAutonomousWorker } from "./components/autonomous-team.js";
import { renderPublication } from "./components/publication.js";
import { setupTaskModal } from "./components/task-modal.js";
import { setupTaskControl, renderTaskControl } from "./components/task-control.js";
import { renderControlCenterV2 } from "./components/control-center-v2.js";
import { setupOperations, loadOperations } from "./components/operations.js";
import { streamConnectionChanged, apiRequestSucceeded, apiRequestFailed, renderConnectionHealth, startConnectionHealth } from "./components/connection-health.js";
import {renderProjectIntelligence} from './components/project-intelligence.js';
import {renderVeylithHealth} from "./components/veylith-health-monitor.js";

let refreshing=false;
let pollTimer=null;
let stopped=false;
const terminalHistory=[];
const TERMINAL_LIMIT=180;

function selectTask(id){
 setState({selectedTaskId:id});
 renderTaskControl(id);
}

function text(value){
 if(value===null||value===undefined)return"";
 if(typeof value==="string")return value;
 if(typeof value==="number"||typeof value==="boolean")return String(value);
 try{return JSON.stringify(value)}catch{return String(value)}
}

function eventText(message){
 const channel=String(message?.channel||"event").toLowerCase();
 const payload=message?.payload||{};

 if(channel==="terminal")
  return text(payload.text||payload.message||payload);

 const type=text(
  payload.type||
  payload.event||
  payload.action||
  payload.status||
  channel
 );

 const id=text(
  payload.job_id||
  payload.jobId||
  payload.worker_id||
  payload.workerId||
  payload.task_id||
  payload.taskId||
  ""
 );

 const body=text(
  payload.message||
  payload.text||
  payload.name||
  ""
 );

 const details=[];
 if(id)details.push(id);
 if(body&&body!==type&&body!==id)details.push(body);

 return `${type}${details.length?` · ${details.join(" · ")}`:""}`;
}

function isRuntimeChannel(message){
 const channel=String(message?.channel||"").toLowerCase();
 const payload=message?.payload||{};
 const type=String(payload.type||"").toLowerCase();
 const group=type.split(".")[0];

 if(channel==="terminal")return true;
 if(["job","worker","worker_slots"].includes(channel))return true;

 return[
  "job",
  "recovery",
  "worker",
  "queue",
  "lease",
  "heartbeat",
  "system",
  "provider",
  "sandbox"
 ].includes(group);
}
function addTerminalLine(value){
 const line=text(value).trim();
 if(!line)return;
 const time=new Date().toLocaleTimeString();
 terminalHistory.push(`${time}  ${line}`);
 if(terminalHistory.length>TERMINAL_LIMIT)terminalHistory.splice(0,terminalHistory.length-TERMINAL_LIMIT);
 renderExecutionTerminal();
}

function runtimeParts(line){
 const raw=String(line||"");
 const match=raw.match(/^(.+?)\s{2}(.+)$/);

 let time="";
 let message=raw;

 if(match){
  time=match[1];
  message=match[2];
 }

 const typeMatch=message.match(/(?:\[([A-Z_]+)\]\s*)?([a-zA-Z_]+)(?:\.([a-zA-Z0-9_.-]+))?/);

 let group="runtime";
 let action="activity";

 if(typeMatch){
  const channel=String(typeMatch[1]||"").toLowerCase();
  const detected=String(typeMatch[2]||"runtime").toLowerCase();
  const detectedAction=String(typeMatch[3]||"activity").toLowerCase();

  group=channel==="event"?detected:(channel||detected);
  action=channel==="event"?detectedAction:(detectedAction||detected);
 }

 return{time,message,group,action};
}

function runtimeKey(value){
 return String(value||"runtime")
  .toLowerCase()
  .replace(/[^a-z0-9_-]/g,"-");
}

function runtimeEscape(value){
 const node=document.createElement("div");
 node.textContent=String(value??"");
 return node.innerHTML;
}

function renderExecutionTerminal(){
 const terminal=$("terminal");
 if(!terminal)return;

 if(!terminalHistory.length){
  terminal.innerHTML=`<div class="runtime-empty">Waiting for Veylith runtime activity...</div>`;
  return;
 }

 terminal.innerHTML=terminalHistory.map(line=>{
  const item=runtimeParts(line);

  return`
   <div class="runtime-line">
    <span class="runtime-time">${runtimeEscape(item.time)}</span>
    <span class="runtime-type">
     <b class="runtime-group group-${runtimeKey(item.group)}">${runtimeEscape(item.group)}</b>
     <i>.</i>
     <b class="runtime-action action-${runtimeKey(item.action)}">${runtimeEscape(item.action)}</b>
    </span>
    <span class="runtime-message">${runtimeEscape(item.message)}</span>
   </div>`;
 }).join("");

 requestAnimationFrame(()=>{
  terminal.scrollTop=terminal.scrollHeight;
 });
}

function seedTerminal(data){
 if(terminalHistory.length)return;
 const events=(Array.isArray(data?.events)?data.events:[]).filter(event=>isRuntimeChannel({channel:"event",payload:event})).slice(-80);
 for(const event of events){
  const type=text(event.type||"event");
  const body=text(event.message||"");
  const created=event.created_at||event.createdAt;
  const time=created?new Date(created).toLocaleTimeString():new Date().toLocaleTimeString();
  terminalHistory.push(`${time}  [EVENT] ${type}${body?` · ${body}`:""}`);
 }
 if(terminalHistory.length>TERMINAL_LIMIT)terminalHistory.splice(0,terminalHistory.length-TERMINAL_LIMIT);
 renderExecutionTerminal();
}


function currentDevelopmentWorker(data){
 const teams=Array.isArray(data?.autonomousTeams)?data.autonomousTeams:[];

 for(const team of teams){
  const members=Array.isArray(team?.team)
   ?team.team
   :Array.isArray(team?.members)
    ?team.members
    :[];

  const working=members.find(member=>{
   const state=String(member?.state||member?.status||"").toLowerCase();
   return["working","running","active","executing","claimed"].includes(state);
  });

  if(working)return working;

  const current=team?.current?.agent;

  if(current){
   const member=members.find(item=>item?.id===current?.id);

   if(member){
    const state=String(member?.state||member?.status||"").toLowerCase();

    if(["working","running","active","executing","claimed"].includes(state))
     return member;
   }
  }
 }

 const sources=[
  ...(Array.isArray(data?.jobs)?data.jobs:[]),
  ...(Array.isArray(data?.tasks)?data.tasks:[])
 ];

 const active=sources.find(item=>
  ["working","running","claimed","active","executing"].includes(
   String(item?.state||item?.status||"").toLowerCase()
  )
 );

 if(!active)return null;

 const value=String(
  active.agent_id||
  active.agentId||
  active.agent||
  active.role||
  active.worker_role||
  active.workerRole||
  active.phase||
  ""
 ).toLowerCase();

 const roles=[
  ["architect",["architect","architecture"]],
  ["planner",["planner","planning"]],
  ["developer",["developer","development","coding","implementation"]],
  ["validator",["validator","validation","testing","test"]],
  ["reviewer",["reviewer","review"]],
  ["diagnostic",["diagnostic","diagnosis"]],
  ["repair",["repair","fix"]],
  ["versioning",["versioning","git","commit"]],
  ["publisher",["publisher","publication","release"]]
 ];

 for(const [id,aliases] of roles){
  if(id===value||aliases.some(alias=>value.includes(alias)))
   return{id,state:"working"};
 }

 return null;
}
function render(data,initial=false){
  const developmentWorker=getActiveAutonomousWorker(data);
 setDevelopmentWorkerRole(developmentWorker?.id||developmentWorker?.role||developmentWorker?.name||"");
 setState({dashboard:data});
 renderStats(data);
 renderWorkers(data);
 renderProjects(data);
 renderTasks(data,selectTask);
 renderSystem(data);
 renderAutonomousTeam(data);
 renderPublication(data);
 renderConnectionHealth(data);
 renderControlCenterV2(data);
 renderProjectIntelligence(data);
  renderVeylithHealth(data);
 if(initial){
  renderEvents(data);
  metrics(data.metrics);
  seedTerminal(data);
 }
 if(getState().selectedTaskId)renderTaskControl();
}

async function refresh(initial=false){
 if(refreshing)return false;
 refreshing=true;
 try{
  const data=await api.dashboard();
  apiRequestSucceeded(data);
  render(data,initial);
  return true;
 }catch(error){
  apiRequestFailed();
  console.error(error);
  return false;
 }finally{
  refreshing=false;
 }
}

function stream(message){
 const channel=String(message?.channel||"").toLowerCase();
 if(channel==="metric")metric(message.payload);
 if(channel==="event")prependEvent(message.payload);
 if(isRuntimeChannel(message)){
  addTerminalLine(eventText(message));
 }
 if(["metric","event","worker","worker_slots","phase","task","job"].includes(channel)){
  refresh(false);
 }
}

function schedulePoll(){
 if(stopped)return;
 if(pollTimer)clearTimeout(pollTimer);
 const connection=eventConnectionState();
 const wait=connection.connected?15000:5000;
 pollTimer=setTimeout(async()=>{
  await refresh(false);
  schedulePoll();
 },wait);
}

setupTaskModal(()=>refresh(false));
setupTaskControl(()=>refresh(false));
setupOperations();
startConnectionHealth();

connectEvents(stream,info=>{
 streamConnectionChanged(info);
 if(info.state==="live"){
  addTerminalLine("[SYSTEM] Live event stream connected");
  refresh(false);
 }
 schedulePoll();
});

await refresh(true);
loadOperations();
schedulePoll();

setInterval(()=>loadOperations(true),30000);

window.addEventListener("beforeunload",()=>{
 stopped=true;
 if(pollTimer)clearTimeout(pollTimer);
});

setupSystemWidgetControl();
setupResponsiveDashboard();


