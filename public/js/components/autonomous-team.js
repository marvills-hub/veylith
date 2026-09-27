import {$,escapeHtml,statusClass} from "../core/utils.js";
import {createVeylithScene} from "../scene/veylith-scene.js";

const agentIcon={
 architect:"ARC",
 planner:"PLN",
 developer:"DEV",
 validator:"VAL",
 reviewer:"REV",
 diagnostic:"DIA",
 repair:"REP",
 versioning:"GIT",
 publisher:"PUB"
};

const activityLabel={
 architect:"ARCHITECTING",
 planner:"PLANNING",
 developer:"DEVELOPING",
 validator:"VALIDATING",
 reviewer:"REVIEWING",
 diagnostic:"DIAGNOSING",
 repair:"REPAIRING",
 versioning:"COMMITTING",
 publisher:"PUBLISHING"
};

const roleAliases={
 architecture:"architect",
 architect:"architect",
 planning:"planner",
 planner:"planner",
 development:"developer",
 developer:"developer",
 coding:"developer",
 validation:"validator",
 validator:"validator",
 testing:"validator",
 review:"reviewer",
 reviewer:"reviewer",
 diagnostic:"diagnostic",
 diagnosis:"diagnostic",
 repair:"repair",
 repairing:"repair",
 versioning:"versioning",
 git:"versioning",
 commit:"versioning",
 publisher:"publisher",
 publishing:"publisher",
 release:"publisher"
};

let scenePromise=null;

function norm(value){
 return String(value||"").trim().toLowerCase();
}

function idOf(value){
 return value?.id||value?.task_id||value?.taskId||value?.job_id||value?.jobId||null;
}

function projectOf(value){
 return value?.project_id||value?.projectId||value?.project?.id||null;
}

function roleOf(value){
 const raw=norm(
  value?.agent_id||
  value?.agentId||
  value?.agent||
  value?.role||
  value?.phase||
  value?.worker_role||
  value?.workerRole
 );
 if(roleAliases[raw])return roleAliases[raw];
 for(const [key,role] of Object.entries(roleAliases)){
  if(raw.includes(key))return role;
 }
 return null;
}

function stateLabel(state){
 const s=norm(state);
 if(["working","running","claimed","processing","executing","in_progress"].includes(s))return"WORKING";
 if(["queued","pending","created","waiting"].includes(s))return"QUEUED";
 if(["completed","done","verified","released","passed"].includes(s))return"COMPLETE";
 if(["failed","error","blocked"].includes(s))return"FAILED";
 if(["paused"].includes(s))return"PAUSED";
 return"WAITING";
}

function stateClass(state){
 const label=stateLabel(state);
 if(label==="WORKING")return"working";
 if(label==="QUEUED")return"queued";
 if(label==="COMPLETE")return"completed";
 if(label==="FAILED")return"failed";
 if(label==="PAUSED")return"paused";
 return"waiting";
}

function teamFor(data){
 const teams=data.autonomousTeams||[];
 return teams.find(team=>(team.team||team.members||[]).some(member=>stateClass(member.state||member.status)==="working"))||
  teams.find(team=>["active","running","working","in_progress"].includes(norm(team.project?.status)))||
  teams.find(team=>team.current?.agent)||
  teams.find(team=>!["completed","failed","cancelled","released"].includes(norm(team.project?.status)))||
  teams[0]||
  null;
}

function activeRuntime(data,team){
 const projectId=team?.project?.id||team?.project?.project_id||team?.project?.projectId;
 const jobs=data?.jobs||[];
 const tasks=data?.tasks||[];
 const slots=data?.workerSlots||data?.workers||[];

 const activeJob=jobs.find(job=>{
  const s=norm(job.status);
  const same=!projectId||!projectOf(job)||projectOf(job)===projectId;
  return same&&["running","working","claimed","processing","executing","in_progress"].includes(s);
 });

 const activeTask=tasks.find(task=>{
  const s=norm(task.status);
  const same=!projectId||!projectOf(task)||projectOf(task)===projectId;
  return same&&["running","working","claimed","processing","executing","in_progress"].includes(s);
 });

 const activeSlot=slots.find(slot=>{
  const s=norm(slot.status);
  return["running","working","busy","claimed","processing","executing"].includes(s);
 });

 return {job:activeJob||null,task:activeTask||null,slot:activeSlot||null};
}

function deriveActiveRole(team,runtime){
 const members=team?.team||team?.members||[];
 const current=team?.current?.agent;
 if(current){
  const member=members.find(item=>item.id===current.id);
  if(member&&stateClass(member.state||member.status)==="working")return member.id;
 }

 const working=members.find(member=>stateClass(member.state||member.status)==="working");
 if(working)return working.id;

 return roleOf(runtime.job)||roleOf(runtime.task)||roleOf(runtime.slot)||roleOf(team?.current)||null;
}

function effectiveMembers(team,data){
 const source=team?.team||team?.members||[];
 const runtime=activeRuntime(data,team);
 const activeRole=deriveActiveRole(team,runtime);

 return source.map(member=>{
  let state=member.state||member.status||"waiting";
  if(activeRole&&member.id===activeRole)state="working";
  return {...member,state};
 });
}

function workingAgent(team,data){
 const members=effectiveMembers(team,data);
 const member=members.find(item=>stateClass(item.state)==="working");
 if(!member)return null;

 const current=team?.current?.agent;
 if(current&&current.id===member.id)return {...current,...member};
 return member;
}

function projectProgress(project,current){
 const value=Number(project?.progress??current?.progress??0);
 return Math.max(0,Math.min(100,Number.isFinite(value)?value:0));
}

async function renderScene(team){
 const root=$("veylithScene");
 if(!root)return;
 try{
  scenePromise??=createVeylithScene(root);
  const scene=await scenePromise;
  scene.setTeam(team);
 }catch(error){
  console.error("Veylith 3D scene failed",error);
 }
}

function renderTerminalState(team,agent,progress=0,data={}){
 const badge=$("terminalAgentStatus");
 if(!badge)return;

 const project=team?.project||{};
 const runtime=activeRuntime(data,team);
 const running=Boolean(runtime.job||runtime.task||runtime.slot);
 const queued=(data?.jobs||[]).some(job=>["queued","pending"].includes(norm(job.status)));
 const terminal=["completed","failed","cancelled","released","verified"].includes(norm(project.status));

 let label="IDLE";
 let cls="waiting";

 if(agent){
  label=`${activityLabel[agent.id]||"WORKING"} · ${agentIcon[agent.id]||"AI"}`;
  cls="working";
 }else if(running){
  label="EXECUTING";
  cls="working";
 }else if(queued){
  label="QUEUED";
  cls="queued";
 }else if(terminal){
  label=`${String(project.status||"completed").toUpperCase()} · ${Math.round(progress)}%`;
  cls=statusClass(project.status);
 }

 badge.className=`terminal-agent-status ${cls}`;
 badge.innerHTML=`<i></i>${escapeHtml(label)}`;
}

export function renderAutonomousTeam(data){
 const team=teamFor(data);
 renderScene(team);

 if(!team){
  $("teamProject").textContent="NO ACTIVE PROJECT";
  $("currentAgent").innerHTML="";
  $("agentTeam").innerHTML=`<div class="empty">No autonomous agent activity yet.</div>`;
  $("pipeline").innerHTML=`<div class="empty">Pipeline waiting.</div>`;
  renderTerminalState(null,null,0,data);
  return;
 }

 const project=team.project||{};
 const current=team.current||{};
 const members=effectiveMembers(team,data);
 const agent=workingAgent(team,data);
 const progress=projectProgress(project,current);

 $("teamProject").textContent=project.name||project.id||"PROJECT";
 $("currentAgent").innerHTML="";
 renderTerminalState(team,agent,progress,data);

 $("agentTeam").innerHTML=members.map(member=>{
  const cls=stateClass(member.state);
  return `
   <div class="agent-row ${cls}">
    <strong class="compact-agent-name">${escapeHtml(member.name||member.id)}</strong>
    <span class="agent-state ${cls}"><i class="agent-status-dot"></i>${stateLabel(member.state)}</span>
   </div>`;
 }).join("");

 $("pipeline").innerHTML=(team.pipeline||[]).map(stage=>{
  const cls=stateClass(stage.state||stage.status);
  return `
   <div class="pipeline-stage ${cls}">
    <span class="pipeline-node">${cls==="completed"?"✓":cls==="working"?"●":cls==="failed"?"!":"○"}</span>
    <span>${escapeHtml(stage.label)}</span>
   </div>`;
 }).join("");
}

export function getActiveAutonomousWorker(data){
 const teams=Array.isArray(data?.autonomousTeams)?data.autonomousTeams:[];

 for(const team of teams){
  const members=typeof effectiveMembers==="function"
   ?effectiveMembers(team,data)
   :Array.isArray(team?.team)
    ?team.team
    :Array.isArray(team?.members)
     ?team.members
     :[];

  const active=members.find(member=>
   ["working","running","active","executing","claimed"].includes(
    String(member?.state||member?.status||"").toLowerCase()
   )
  );

  if(active)return active;
 }

 return null;
}
