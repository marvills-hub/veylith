import {$,escapeHtml,statusClass} from "../core/utils.js";

const roles=[
 ["architect","ARCHITECT"],
 ["planner","DEVELOPMENT PLANNER"],
 ["developer","DEVELOPER"],
 ["validator","VALIDATOR"],
 ["reviewer","REVIEWER"],
 ["diagnostic","DIAGNOSTIC ENGINEER"],
 ["repair","REPAIR ENGINEER"],
 ["versioning","VERSION CONTROLLER"],
 ["publisher","PUBLISHER"]
];

function norm(v){return String(v??"").trim().toLowerCase()}
function clamp(v){const n=Number(v)||0;return Math.max(0,Math.min(100,n))}
function projectId(v){return v?.project_id||v?.projectId||v?.project?.id||null}
function taskId(v){return v?.task_id||v?.taskId||v?.id||null}
function isWorking(v){return["working","running","active","executing","claimed","processing","in_progress","busy"].includes(norm(v))}
function isBlocked(v){return["blocked","waiting","dependency","waiting_dependency"].includes(norm(v))}
function isDone(v){return["completed","done","verified","released","passed"].includes(norm(v))}
function isFailed(v){return["failed","error","cancelled"].includes(norm(v))}
function roleOf(v){
 const raw=norm(v?.agent_id||v?.agentId||v?.agent||v?.role||v?.worker_role||v?.workerRole||v?.phase||v?.id);
 const aliases={
  architect:["architect","architecture"],
  planner:["planner","planning"],
  developer:["developer","development","coding","implementation"],
  validator:["validator","validation","testing","test"],
  reviewer:["reviewer","review"],
  diagnostic:["diagnostic","diagnosis"],
  repair:["repair","fix"],
  versioning:["versioning","git","commit"],
  publisher:["publisher","publication","release"]
 };
 for(const [role,values] of Object.entries(aliases))if(values.some(x=>raw.includes(x)))return role;
 return null;
}
function allMembers(data){
 const map=new Map();
 for(const [id,label] of roles)map.set(id,{id,name:label,state:"waiting"});
 for(const team of data.autonomousTeams||[]){
  for(const member of team.team||team.members||[]){
   const id=roleOf(member)||member.id;
   if(id&&map.has(id))map.set(id,{...map.get(id),...member,id});
  }
 }
 return [...map.values()];
}
function activeProject(data){
 const teams=data.autonomousTeams||[];
 const team=teams.find(t=>(t.team||t.members||[]).some(m=>isWorking(m.state||m.status)))||
  teams.find(t=>isWorking(t.project?.status))||
  teams.find(t=>t.current?.agent)||
  teams[0];
 if(team?.project)return {project:team.project,team};
 const project=(data.projects||[]).find(p=>isWorking(p.status))||(data.projects||[])[0]||null;
 return {project,team:null};
}
function tasksForProject(data,id){
 if(!id)return data.tasks||[];
 return (data.tasks||[]).filter(t=>!projectId(t)||String(projectId(t))===String(id));
}
function eventMessage(e){
 return String(e?.message||e?.text||e?.name||e?.type||"Development activity");
}
function eventRole(e){
 return roleOf(e)||"veylith";
}
function projectName(data,id){
 const p=(data.projects||[]).find(x=>String(x.id)===String(id));
 return p?.name||id||"UNASSIGNED";
}
function renderProjects(data,current){
 const projects=data.projects||[];
 const root=$("devProjects");
 if(root)root.innerHTML=projects.length?projects.map(p=>`
 <div class="dev-project-card ${current&&String(p.id)===String(current.id)?"active":""}">
  <div class="dev-project-card-head"><strong>${escapeHtml(p.name||p.id)}</strong><span class="project-state ${statusClass(p.status)}">${escapeHtml(p.status||"unknown")}</span></div>
  <div class="dev-project-meta"><span>${clamp(p.progress)}% COMPLETE</span><span>${escapeHtml(p.github_repo||"LOCAL")}</span></div>
  <div class="dev-project-progress"><i style="width:${clamp(p.progress)}%"></i></div>
 </div>`).join(""):`<div class="empty">No projects yet.</div>`;
 const portfolio=$("portfolioList");
 if(portfolio)portfolio.innerHTML=projects.length?projects.map(p=>`
 <div class="portfolio-row">
  <div class="portfolio-top"><strong>${escapeHtml(p.name||p.id)}</strong><span class="${statusClass(p.status)}">${escapeHtml(p.status||"unknown")}</span></div>
  <div class="portfolio-meta"><span>${clamp(p.progress)}% complete</span><span>${escapeHtml(p.github_repo||"LOCAL")}</span></div>
  <div class="dev-project-progress"><i style="width:${clamp(p.progress)}%"></i></div>
 </div>`).join(""):`<div class="empty">No projects yet.</div>`;
}
function renderCurrent(data,project,team){
 const root=$("devCurrentProject");
 if(!root)return;
 if(!project){root.innerHTML=`<div class="empty">Waiting for a project.</div>`;return}
 const tasks=tasksForProject(data,project.id);
 const done=tasks.filter(t=>isDone(t.status)).length;
 const active=tasks.filter(t=>isWorking(t.status)).length;
 const blocked=tasks.filter(t=>isBlocked(t.status)).length;
 const remaining=Math.max(0,tasks.length-done);
 $("devProjectState").textContent=String(project.status||"active").toUpperCase();
 root.innerHTML=`
 <div class="current-project-name">${escapeHtml(project.name||project.id)}</div>
 <div class="current-project-description">${escapeHtml(project.description||project.prompt||"Autonomous project development in progress.")}</div>
 <div class="current-project-progress">
  <div class="current-project-progress-head"><span>PROJECT COMPLETION</span><strong>${clamp(project.progress)}%</strong></div>
  <div class="big-progress"><i style="width:${clamp(project.progress)}%"></i></div>
 </div>
 <div class="project-focus-grid">
  <div class="project-focus-stat"><span>TASKS</span><strong>${done} / ${tasks.length}</strong></div>
  <div class="project-focus-stat"><span>ACTIVE WORK</span><strong>${active}</strong></div>
  <div class="project-focus-stat"><span>BLOCKED</span><strong>${blocked}</strong></div>
  <div class="project-focus-stat"><span>REMAINING</span><strong>${remaining}</strong></div>
 </div>`;
}
function renderConstruction(data,project,team){
 const tasks=tasksForProject(data,project?.id);
 const stats=[
  ["TOTAL TASKS",tasks.length],
  ["COMPLETED",tasks.filter(t=>isDone(t.status)).length],
  ["IN PROGRESS",tasks.filter(t=>isWorking(t.status)).length],
  ["BLOCKED",tasks.filter(t=>isBlocked(t.status)).length],
  ["FAILED",tasks.filter(t=>isFailed(t.status)).length]
 ];
 $("constructionDetail").innerHTML=stats.map(([a,b])=>`<div class="construction-card"><span>${a}</span><strong>${b}</strong></div>`).join("");
 const root=$("projectStats");
 root.innerHTML=stats.map(([a,b])=>`<div class="project-stat"><strong>${b}</strong><span>${a}</span></div>`).join("");
 const blocked=tasks.filter(t=>isBlocked(t.status));
 $("blockedWork").innerHTML=blocked.length?blocked.slice(0,8).map(t=>`
 <div class="blocked-row"><strong>${escapeHtml(roleOf(t)||t.phase||"WORK")}</strong><span>${escapeHtml(t.name||t.id)}</span><span>${escapeHtml(t.status||"waiting")}</span></div>
 `).join(""):`<div class="empty">No blocked development work.</div>`;
}
function workerAssignment(data,role){
 const candidates=[...(data.jobs||[]),...(data.tasks||[])];
 return candidates.find(x=>roleOf(x)===role&&isWorking(x.status||x.state))||
  candidates.find(x=>roleOf(x)===role&&["queued","pending","waiting"].includes(norm(x.status||x.state)))||null;
}
function workerEvents(data,role){
 return (data.events||[]).filter(e=>eventRole(e)===role).slice(-8);
}
function renderWorkers(data){
 const members=allMembers(data);
 let working=0,waiting=0;
 const html=members.map(member=>{
  const role=roleOf(member)||member.id;
  const assignment=workerAssignment(data,role);
  const state=assignment&&isWorking(assignment.status||assignment.state)?"working":norm(member.state||member.status)||"waiting";
  if(isWorking(state))working++;else waiting++;
  const progress=clamp(assignment?.progress??member.progress??0);
  const project=projectName(data,projectId(assignment));
  const task=assignment?.name||taskId(assignment)||"Waiting for eligible work";
  const events=workerEvents(data,role);
  return `<article class="worker-terminal-card ${isWorking(state)?"working":""}">
   <div class="worker-terminal-card-head">
    <div class="worker-terminal-role">${escapeHtml(roles.find(x=>x[0]===role)?.[1]||member.name||role)}</div>
    <div class="worker-terminal-state">${escapeHtml(String(state).toUpperCase())}</div>
   </div>
   <div class="worker-progress-ring" style="--progress:${progress}%"><strong>${Math.round(progress)}%</strong></div>
   <div class="worker-assignment"><span>${escapeHtml(project)}</span><strong>${escapeHtml(task)}</strong></div>
   <div class="worker-terminal-body">${events.length?events.map(e=>`<div class="worker-terminal-line">${escapeHtml(eventMessage(e))}</div>`).join(""):`<div class="worker-terminal-empty">$ waiting for eligible development work</div>`}</div>
  </article>`;
 }).join("");
 $("workerTerminalGrid").innerHTML=html;
 $("devWorkingCount").textContent=`${working} WORKING`;
 $("devWaitingCount").textContent=`${waiting} WAITING`;
}
function renderQueue(data){
 const tasks=(data.tasks||[]).filter(t=>!isDone(t.status)&&!isFailed(t.status)).slice(0,30);
 const root=$("devTaskList");
 root.innerHTML=tasks.length?tasks.map(t=>`
 <div class="dev-task-row">
  <div class="dev-task-top"><strong>${escapeHtml(t.name||t.id)}</strong><span class="${statusClass(t.status)}">${escapeHtml(t.status||"waiting")}</span></div>
  <div class="dev-task-meta"><span>${escapeHtml(projectName(data,projectId(t)))}</span><span>${clamp(t.progress)}%</span></div>
  <div class="dev-project-progress"><i style="width:${clamp(t.progress)}%"></i></div>
 </div>`).join(""):`<div class="empty">No remaining development work.</div>`;
}
export function renderDevelopmentDashboard(data){
 const {project,team}=activeProject(data);
 renderProjects(data,project);
 renderCurrent(data,project,team);
 renderConstruction(data,project,team);
 renderWorkers(data);
 renderQueue(data);
}

