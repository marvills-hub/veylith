import {$,escapeHtml,statusClass} from "../core/utils.js";
import {setState} from "../core/state.js";

export function renderTasks(data,onSelect){
 const tasks=data.tasks||[];
 $("taskCount").textContent=`${tasks.length} TASKS`;
 $("taskList").innerHTML=tasks.length?tasks.slice(0,50).map(task=>`
 <button class="task-row" data-task="${escapeHtml(task.id)}">
  <div class="task-top">
   <strong>${escapeHtml(task.name||task.id)}</strong>
   <span class="status ${statusClass(task.status)}">${escapeHtml(task.status)}</span>
  </div>
  <div class="task-meta">
   <span>${Number(task.progress)||0}%</span>
   <span>attempt ${Number(task.attempts)||0}</span>
   <span>repairs ${Number(task.repair_attempts)||0}</span>
  </div>
  <div class="progress"><span style="width:${Math.max(0,Math.min(100,Number(task.progress)||0))}%"></span></div>
 </button>`).join(""):`<div class="empty">No tasks queued.</div>`;

 $("taskList").querySelectorAll("[data-task]").forEach(button=>{
  button.onclick=()=>{
   const id=button.dataset.task;
   setState({selectedTaskId:id});
   onSelect?.(id);
  };
 });
}



let activeDevelopmentWorker=null;

const developmentRoles=[
 ["architect",["architect","architecture"]],
 ["planner",["planner","planning"]],
 ["developer",["developer","development","coding","implementation"]],
 ["validator",["validator","validation","testing","test"]],
 ["reviewer",["reviewer","review"]],
 ["diagnostic",["diagnostic","diagnosis"]],
 ["repair",["repair","fixing","fix"]],
 ["versioning",["versioning","git","commit"]],
 ["publisher",["publisher","publication","release","github"]]
];

const developmentRoleLabel={
 architect:"ARCHITECT",
 planner:"PLANNER",
 developer:"DEVELOPER",
 validator:"VALIDATOR",
 reviewer:"REVIEWER",
 diagnostic:"DIAGNOSTIC",
 repair:"REPAIR",
 versioning:"GIT",
 publisher:"PUBLISHER",
 veylith:"VEYlITH"
};

export function setDevelopmentWorkerRole(role){
 const value=String(role||"").trim().toLowerCase();

 if(!value){
  activeDevelopmentWorker=null;
  return;
 }

 activeDevelopmentWorker={
  id:value,
  role:value,
  name:value,
  state:"working"
 };
}
export function setDevelopmentWorker(worker){
 activeDevelopmentWorker=worker&&worker.id?worker:null;
 if(!activeDevelopmentWorker)return;

 const identity=[
  activeDevelopmentWorker.id,
  activeDevelopmentWorker.name,
  activeDevelopmentWorker.role,
  activeDevelopmentWorker.type,
  activeDevelopmentWorker.agent,
  activeDevelopmentWorker.phase
 ].filter(Boolean).join(" ").toLowerCase();

 let role="veylith";

 for(const [candidate,aliases] of developmentRoles){
  if(
   identity.includes(candidate)||
   aliases.some(alias=>identity.includes(alias))
  ){
   role=candidate;
   break;
  }
 }

 if(role==="veylith")return;

 const label=developmentRoleLabel[role]||role.toUpperCase();
 const feed=$("feed");
 if(!feed)return;

 feed.querySelectorAll(".development-role.role-veylith").forEach(node=>{
  node.classList.remove("role-veylith");
  node.classList.add(`role-${role}`);
  node.textContent=label;
 });
}
function eventValue(event,...keys){
 for(const key of keys){
  const value=event?.[key];
  if(value!==undefined&&value!==null&&value!=="")return String(value);
 }
 return "";
}

function developmentRole(event){
 const explicit=[
  eventValue(event,"agent_id","agentId"),
  eventValue(event,"agent","role","worker_role","workerRole"),
  eventValue(event,"phase")
 ].join(" ").toLowerCase();

 for(const [role,aliases] of developmentRoles){
  if(aliases.some(alias=>explicit.includes(alias)))return role;
 }

 const type=String(event?.type||"").toLowerCase();

 for(const [role,aliases] of developmentRoles){
  if(aliases.some(alias=>type.includes(alias)))return role;
 }

 const active=String(activeDevelopmentWorker?.id||"").toLowerCase();

 if(active){
  for(const [role,aliases] of developmentRoles){
   if(role===active||aliases.some(alias=>active.includes(alias)))return role;
  }
 }

 return "veylith";
}

function developmentMessage(event){
 const raw=String(event?.message||event?.text||"").trim();
 const type=String(event?.type||"activity").toLowerCase();
 const task=eventValue(event,"task_name","taskName","name");
 const project=eventValue(event,"project_name","projectName");

 if(raw){
  return raw
   .replace(/^queued task had no active job; persistent job created$/i,"Prepared executable work")
   .replace(/^startup recovery completed$/i,"Veylith restored project execution state")
   .replace(/^live job recovery reconciled runtime state$/i,"Execution state synchronized")
   .replace(/\bjob\b/gi,"work")
   .replace(/\bclaimed\b/gi,"started")
   .replace(/\bqueued\b/gi,"prepared")
   .replace(/\breconciled\b/gi,"synchronized");
 }

 if(type.includes("claimed")||type.includes("started"))
  return task?`Started ${task}`:"Started assigned work";

 if(type.includes("queued")||type.includes("created"))
  return task?`Prepared ${task}`:"Prepared next work item";

 if(type.includes("completed")||type.includes("done"))
  return task?`Completed ${task}`:"Completed assigned work";

 if(type.includes("failed")||type.includes("error"))
  return task?`Problem detected in ${task}`:"Execution problem detected";

 if(type.includes("review"))
  return task?`Reviewing ${task}`:"Reviewing implementation";

 if(type.includes("validation")||type.includes("test"))
  return task?`Validating ${task}`:"Running validation";

 if(type.includes("repair")||type.includes("fix"))
  return task?`Repairing ${task}`:"Repairing implementation";

 if(type.includes("git")||type.includes("commit"))
  return task?`Versioning ${task}`:"Preparing source control update";

 if(type.includes("publish")||type.includes("release"))
  return project?`Publishing ${project}`:"Publishing project";

 return [task,project].filter(Boolean).join(" · ")||"Veylith execution activity";
}

function isRuntimeOnlyEvent(event){
 const type=String(event?.type||"").toLowerCase();
 const group=type.split(".")[0];

 return [
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

function developmentEvent(event){
 if(!event)return null;

 const type=String(event?.type||"").toLowerCase();
 const group=type.split(".")[0];

 if([
  "recovery",
  "heartbeat",
  "lease",
  "system",
  "provider",
  "sandbox"
 ].includes(group))return null;

 const role=developmentRole(event);

 return{
  role,
  label:developmentRoleLabel[role]||"VEYlITH",
  message:developmentMessage(event),
  createdAt:event.created_at||event.createdAt||Date.now(),
  level:event.level||"info"
 };
}

function developmentRow(event){
 const item=developmentEvent(event);
 if(!item)return "";

 return`
 <div class="development-event ${statusClass(item.level)}">
  <span class="development-time">${new Date(item.createdAt).toLocaleTimeString()}</span>
  <b class="development-role role-${escapeHtml(item.role)}">${escapeHtml(item.label)}</b>
  <span class="development-message">${escapeHtml(item.message)}</span>
 </div>`;
}

function scrollDevelopmentToLatest(){
 const feed=$("feed");
 if(!feed)return;
 requestAnimationFrame(()=>{feed.scrollTop=feed.scrollHeight});
}
function eventTypeHtml(type){
 const raw=String(type||"event");
 const parts=raw.split(".");
 const group=parts.shift()||"event";
 const action=parts.join(".")||"event";
 const key=action.toLowerCase().replace(/[^a-z0-9_-]/g,"-");
 const groupKey=group.toLowerCase().replace(/[^a-z0-9_-]/g,"-"); return `<span class="event-group group-${escapeHtml(groupKey)}">${escapeHtml(group)}</span><span class="event-dot">.</span><span class="event-action action-${escapeHtml(key)}">${escapeHtml(action)}</span>`;
}
function scrollFeedToLatest(){
 const feed=$("feed");
 if(!feed)return;
 requestAnimationFrame(()=>{feed.scrollTop=feed.scrollHeight});
}
export function renderEvents(data){
 const events=data.events||[];
 const feed=$("feed");
 const development=events.map(developmentEvent).filter(Boolean).slice(-150);

 $("eventCount").textContent=`${development.length} DEV EVENTS`;

 feed.innerHTML=development.length
  ?development.map(item=>`
   <div class="development-event ${statusClass(item.level)}">
    <span class="development-time">${new Date(item.createdAt).toLocaleTimeString()}</span>
    <b class="development-role role-${escapeHtml(item.role)}">${escapeHtml(item.label)}</b>
    <span class="development-message">${escapeHtml(item.message)}</span>
   </div>`).join("")
  :`<div class="development-empty">Waiting for autonomous development activity...</div>`;

 scrollDevelopmentToLatest();
}

export function prependEvent(event){
 const feed=$("feed");
 if(!feed)return;

 const html=developmentRow(event);
 if(!html)return;

 if(feed.querySelector(".development-empty"))feed.innerHTML="";

 feed.insertAdjacentHTML("beforeend",html);

 while(feed.children.length>150)feed.firstChild.remove();

 $("eventCount").textContent=`${feed.children.length} DEV EVENTS`;
 scrollDevelopmentToLatest();
}








