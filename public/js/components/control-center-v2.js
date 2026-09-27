import {$,escapeHtml,statusClass,duration} from "../core/utils.js";

const terminalStatuses=new Set(["completed","failed","cancelled"]);
const time=value=>{
 if(!value)return"—";
 const date=new Date(value);
 return Number.isNaN(date.getTime())?"—":date.toLocaleTimeString();
};
const age=value=>{
 if(!value)return"—";
 const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));
 return duration(seconds);
};
const number=value=>Number(value)||0;
const latest=(rows,predicate)=>[...(rows||[])].reverse().find(predicate)||null;

function workItems(data){
 return data.goalWorkItems||
  data.goal_work_items||
  data.workItems||
  data.work_items||
  data.autonomousWork||
  [];
}

function assignments(data){
 return data.agentAssignments||
  data.agent_assignments||
  data.assignments||
  [];
}

function releases(data){
 return data.releases||
  data.verifiedReleases||
  data.verified_releases||
  [];
}

function currentProject(data){
 const projects=data.projects||[];
 return projects.find(project=>["active","queued","resuming","paused"].includes(project.status))||
  projects[0]||
  null;
}

function projectTasks(data,project){
 if(!project)return[];
 return(data.tasks||[]).filter(task=>task.project_id===project.id);
}

function projectJobs(data,project){
 if(!project)return[];
 const taskIds=new Set(projectTasks(data,project).map(task=>task.id));
 return(data.jobs||[]).filter(job=>job.project_id===project.id||taskIds.has(job.task_id));
}

function projectWork(data,project){
 if(!project)return[];
 return workItems(data).filter(item=>item.project_id===project.id);
}

function projectAssignments(data,project){
 if(!project)return[];
 return assignments(data).filter(item=>item.project_id===project.id);
}

function jobHealth(job){
 if(job.status!=="running")return job.status||"waiting";
 if(!job.lease_expires_at)return"running";
 const remaining=new Date(job.lease_expires_at).getTime()-Date.now();
 if(remaining<=0)return"expired";
 if(remaining<30000)return"warning";
 return"healthy";
}

function summary(data,project){
 const tasks=projectTasks(data,project);
 const jobs=projectJobs(data,project);
 const work=projectWork(data,project);
 const activeJobs=jobs.filter(job=>job.status==="running");
 const queuedJobs=jobs.filter(job=>job.status==="queued");
 const failedJobs=jobs.filter(job=>job.status==="failed");
 const repairs=tasks.reduce((total,task)=>total+number(task.repair_attempts),0);
 const retries=jobs.reduce((total,job)=>total+number(job.attempts),0);
 const recovered=jobs.filter(job=>/recover/i.test(String(job.last_error||""))).length;
 const expired=activeJobs.filter(job=>jobHealth(job)==="expired").length;
 const completedWork=work.filter(item=>item.status==="completed").length;
 return{tasks,jobs,work,activeJobs,queuedJobs,failedJobs,repairs,retries,recovered,expired,completedWork};
}

function stat(label,value,detail="",tone=""){
 return`<div class="v2-stat ${tone}">
  <span>${escapeHtml(label)}</span>
  <strong>${escapeHtml(value)}</strong>
  <small>${escapeHtml(detail)}</small>
 </div>`;
}

function renderOverview(data,project,s){
 const stats=data.stats||{};
 $("v2Overview").innerHTML=[
  stat("PROJECT",project?.status?.toUpperCase()||"IDLE",project?`${number(project.progress)}% · ${project.phase||"unknown"}`:"No autonomous project",project?.status==="completed"?"good":""),
  stat("EXECUTION",`${s.activeJobs.length} ACTIVE`,`${s.queuedJobs.length} queued · ${s.failedJobs.length} failed`,s.failedJobs.length?"bad":s.activeJobs.length?"live":""),
  stat("WORK GRAPH",s.work.length?`${s.completedWork}/${s.work.length}`:"—",s.work.length?"authoritative work items":"No graph exposed"),
  stat("RECOVERIES",String(s.recovered),`${s.repairs} repairs · ${s.retries} retries`,s.recovered||s.repairs?"warn":""),
  stat("LEASES",s.expired?`${s.expired} EXPIRED`:`${s.activeJobs.length} HEALTHY`,s.activeJobs.length?"live worker ownership":"No active leases",s.expired?"bad":"good"),
  stat("TASK HISTORY",String(s.tasks.length),`${number(stats.completed)} global complete · ${number(stats.failed)} global failed`)
 ].join("");
}

function renderExecution(data,project,s){
 const work=s.work;
 if(work.length){
  $("v2Execution").innerHTML=work.map(item=>{
   const dependencies=item.depends_on||item.dependencies||[];
   const deps=Array.isArray(dependencies)?dependencies.join(", "):String(dependencies||"");
   return`<div class="v2-work ${statusClass(item.status)}">
    <span class="v2-work-node"></span>
    <div>
     <strong>${escapeHtml(item.title||item.work_key||item.id)}</strong>
     <small>${escapeHtml(item.kind||item.role||"work")}${deps?` · ← ${escapeHtml(deps)}`:""}</small>
    </div>
    <b>${escapeHtml(item.status||"pending")}</b>
   </div>`;
  }).join("");
  return;
 }
 const tasks=s.tasks;
 $("v2Execution").innerHTML=tasks.length?tasks.map(task=>`<div class="v2-work ${statusClass(task.status)}">
  <span class="v2-work-node"></span>
  <div><strong>${escapeHtml(task.title||task.name||task.id)}</strong><small>${escapeHtml(task.phase||"task")}</small></div>
  <b>${escapeHtml(task.status||"unknown")}</b>
 </div>`).join(""):`<div class="empty">No autonomous execution graph.</div>`;
}

function renderReliability(data,project,s){
 const jobs=s.jobs.filter(job=>job.status==="running"||job.status==="queued"||job.status==="failed").slice(0,16);
 $("v2Reliability").innerHTML=jobs.length?jobs.map(job=>{
  const health=jobHealth(job);
  const heartbeat=job.heartbeat_at||job.updated_at;
  return`<div class="v2-reliability-row">
   <span class="v2-health ${statusClass(health)}"></span>
   <div>
    <strong>${escapeHtml(job.title||job.id)}</strong>
    <small>${escapeHtml(job.claimed_by||job.worker_id||"UNCLAIMED")}</small>
   </div>
   <div class="v2-reliability-meta">
    <b>${escapeHtml(health.toUpperCase())}</b>
    <small>HB ${escapeHtml(age(heartbeat))} · ${number(job.attempts)}/${number(job.max_attempts)}</small>
   </div>
  </div>`;
 }).join(""):`<div class="empty">No active, queued or failed jobs.</div>`;
}

function renderAssignments(data,project,s){
 const rows=projectAssignments(data,project);
 $("v2Assignments").innerHTML=rows.length?rows.slice(-18).reverse().map(row=>`<div class="v2-assignment">
  <span class="agent-avatar ${statusClass(row.status)}">${escapeHtml(String(row.role||row.agent||"AI").slice(0,3).toUpperCase())}</span>
  <div><strong>${escapeHtml(row.role||row.agent||"Agent")}</strong><small>${escapeHtml(row.title||row.work_key||row.work_item_id||"Autonomous assignment")}</small></div>
  <div><b class="status ${statusClass(row.status)}">${escapeHtml(row.status||"unknown")}</b><small>${escapeHtml(time(row.completed_at||row.updated_at||row.created_at))}</small></div>
 </div>`).join(""):`<div class="empty">Assignment telemetry is not exposed by this dashboard response.</div>`;
}

function renderEngineering(data,project,s){
 const steps=(data.developmentSteps||data.development_steps||[]).filter(step=>!project||step.project_id===project.id);
 const validation=steps.filter(step=>["validation","review","diagnosis","repair"].includes(String(step.phase)));
 const rows=validation.length?validation.slice(-18).reverse():s.tasks.filter(task=>/test|build|review|repair|valid/i.test(`${task.title||""} ${task.phase||""}`)).slice(0,18);
 $("v2Engineering").innerHTML=rows.length?rows.map(row=>`<div class="v2-engineering-row">
  <span class="v2-engineering-icon ${statusClass(row.status)}">${row.status==="completed"?"✓":row.status==="failed"?"!":"•"}</span>
  <div><strong>${escapeHtml(row.title||row.phase||row.id)}</strong><small>${escapeHtml(row.agent||row.phase||"engineering")} · ${escapeHtml(time(row.completed_at||row.updated_at))}</small></div>
  <b class="status ${statusClass(row.status)}">${escapeHtml(row.status||"unknown")}</b>
 </div>`).join(""):`<div class="empty">No validation or review history yet.</div>`;
}

function renderRelease(data,project){
 const publication=(data.publications||[]).find(row=>row.project?.id===project?.id||row.project_id===project?.id)||
  (data.publication?.project?.id===project?.id?data.publication:null);
 const release=releases(data).find(row=>row.project_id===project?.id)||releases(data)[0];
 const source=publication||project||{};
 const repo=source.repository||source.github_repo||source.project?.github_repo||project?.github_repo;
 const branch=source.branch||source.github_branch||project?.github_branch;
 const commit=source.commitSha||source.commit_sha||source.github_commit||project?.github_commit;
 const stage=source.stage||source.status||project?.status||"none";
 const verified=Boolean(source.verified||source.verified_at||release?.status==="released");
 $("v2Release").innerHTML=`
 <div class="v2-release-head">
  <div class="git-mark">GIT</div>
  <div><span>DELIVERY STATE</span><strong>${escapeHtml(String(stage).toUpperCase())}</strong></div>
  <b class="status ${verified?"verified":statusClass(stage)}">${verified?"REMOTE VERIFIED":escapeHtml(stage)}</b>
 </div>
 <div class="v2-release-grid">
  ${stat("REPOSITORY",repo||"NOT PUBLISHED",source.owner||source.github_owner||project?.github_owner||"—")}
  ${stat("BRANCH",branch||"—","remote branch")}
  ${stat("COMMIT",commit?String(commit).slice(0,12):"—",commit||"No commit")}
  ${stat("RELEASE",release?.status?.toUpperCase()||"—",release?.id||"No verified release",release?.status==="released"?"good":"")}
 </div>`;
}

export function renderControlCenterV2(data){
 const project=currentProject(data);
 const s=summary(data,project);
 $("v2Project").textContent=project?.name||"NO PROJECT";
 renderOverview(data,project,s);
 renderExecution(data,project,s);
 renderReliability(data,project,s);
 renderAssignments(data,project,s);
 renderEngineering(data,project,s);
 renderRelease(data,project);
}