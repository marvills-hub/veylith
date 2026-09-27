const $=id=>document.getElementById(id);
const arr=v=>Array.isArray(v)?v:[];
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const status=v=>String(v||"unknown").toLowerCase();
const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,n(v)));
const projectId=p=>p?.id||p?.project_id||p?.projectId;
const taskProject=t=>t?.project_id||t?.projectId;
const activeStatuses=new Set(["active","running","working","in_progress","developing","planning","validating","reviewing","repairing","publishing"]);
const terminalStatuses=new Set(["completed","released","verified","failed","cancelled"]);
const projectProgress=p=>clamp(p?.progress??p?.progress_percent??p?.progressPercent??0);
const currentProject=data=>{
 const projects=arr(data?.projects);
 return projects.find(p=>activeStatuses.has(status(p.status)))||projects.find(p=>!terminalStatuses.has(status(p.status)))||projects[0]||null;
};
const counts=data=>{
 const result={active:0,queued:0,completed:0,failed:0};
 arr(data?.projects).forEach(p=>{
  const s=status(p.status);
  if(["completed","released","verified"].includes(s))result.completed++;
  else if(["failed","cancelled","blocked"].includes(s))result.failed++;
  else if(["queued","pending","created"].includes(s))result.queued++;
  else result.active++;
 });
 return result;
};
function svgLine(values){
 const vals=values.length?values:[0,0];
 const max=Math.max(100,...vals),min=Math.min(0,...vals);
 const points=vals.map((v,i)=>{
  const x=vals.length===1?50:i/(vals.length-1)*100;
  const y=38-((v-min)/(max-min||1))*32;
  return `${x.toFixed(1)},${y.toFixed(1)}`;
 }).join(" ");
 return `<svg viewBox="0 0 100 42" preserveAspectRatio="none"><defs><linearGradient id="velocityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef3030" stop-opacity=".34"/><stop offset="1" stop-color="#ef3030" stop-opacity="0"/></linearGradient></defs><path d="M0 38 L${points.replaceAll(" "," L")} L100 38 Z" fill="url(#velocityFill)"/><polyline points="${points}" fill="none" stroke="#ff4545" stroke-width="1.8" vector-effect="non-scaling-stroke"/><line x1="0" y1="38" x2="100" y2="38" stroke="#421515" stroke-width=".5"/></svg>`;
}
function donut(c){
 const total=Math.max(1,c.active+c.queued+c.completed+c.failed);
 const values=[c.active,c.queued,c.completed,c.failed];
 const colors=["#ff3535","#d99a38","#55c47a","#7c2020"];
 let offset=25;
 const circles=values.map((v,i)=>{
  const pct=v/total*100;
  const el=`<circle cx="50" cy="50" r="36" fill="none" stroke="${colors[i]}" stroke-width="12" pathLength="100" stroke-dasharray="${pct} ${100-pct}" stroke-dashoffset="${offset}" transform="rotate(-90 50 50)"/>`;
  offset-=pct;
  return el;
 }).join("");
 return `<svg viewBox="0 0 100 100">${circles}<circle cx="50" cy="50" r="27" fill="#060404"/><text x="50" y="48" text-anchor="middle" fill="#f2e7e2" font-size="15" font-weight="800">${total}</text><text x="50" y="60" text-anchor="middle" fill="#8e7770" font-size="5">PROJECTS</text></svg>`;
}
function phaseData(team){
 const roles=arr(team?.members);
 const fallback=["architect","planner","developer","validator","reviewer","diagnostic","repair","versioning","publisher"];
 return (roles.length?roles:fallback.map(role=>({role,state:"waiting"}))).map(m=>({
  role:String(m.role||m.agentRole||"agent"),
  state:status(m.state||m.status),
  progress:clamp(m.progress??(status(m.state)==="completed"?100:status(m.state)==="working"?65:8))
 }));
}
function workload(team){
 return phaseData(team).map(m=>{
  const label=m.role.replace("development_planner","planner").replace("versioning","git").toUpperCase();
  const working=m.state==="working"||m.state==="running";
  const completed=m.state==="completed";
  const value=working?Math.max(55,m.progress):completed?100:Math.max(6,m.progress);
  return `<div class="pi-workload-row"><span>${label}</span><div><i style="width:${value}%"></i></div><b>${m.state.toUpperCase()}</b></div>`;
 }).join("");
}
function roadmap(team){
 const phases=phaseData(team);
 return phases.map((p,i)=>{
  const cls=["completed"].includes(p.state)?"completed":["working","running"].includes(p.state)?"working":["failed"].includes(p.state)?"failed":"waiting";
  const name=p.role.replace("development_planner","planning").replace("developer","development").replace("validator","validation").replace("versioning","git").toUpperCase();
  return `<div class="pi-road-stage ${cls}"><i>${cls==="completed"?"✓":cls==="working"?"●":"○"}</i><span>${name}</span>${i<phases.length-1?`<em></em>`:""}</div>`;
 }).join("");
}
function eta(project,data){
 const progress=projectProgress(project);
 if(progress>=100)return "COMPLETE";
 if(progress<=5)return "CALCULATING";
 const tasks=arr(data?.tasks).filter(t=>!project||taskProject(t)===projectId(project));
 const completed=tasks.filter(t=>["completed","verified","done"].includes(status(t.status))).length;
 if(completed<2)return "CALCULATING";
 const started=project?.createdAt||project?.created_at||project?.startedAt||project?.started_at;
 if(!started)return "CALCULATING";
 const elapsed=Date.now()-new Date(started).getTime();
 if(!Number.isFinite(elapsed)||elapsed<=0)return "CALCULATING";
 const remaining=elapsed*(100-progress)/progress;
 if(remaining<=0)return "COMPLETE";
 const mins=Math.round(remaining/60000);
 if(mins<60)return `~${Math.max(1,mins)}m`;
 const hours=Math.floor(mins/60),rest=mins%60;
 return `~${hours}h ${rest}m`;
}
function history(data,project){
 const events=arr(data?.events).filter(e=>{
  const pid=e?.projectId||e?.project_id;
  return !project||!pid||pid===projectId(project);
 }).slice(-24);
 if(events.length<2){
  const p=projectProgress(project);
  return [0,Math.max(3,p*.15),Math.max(8,p*.3),Math.max(15,p*.48),Math.max(25,p*.67),p];
 }
 let completed=0;
 return events.map((e,i)=>{
  if(/completed|verified|released|passed/i.test(`${e?.type||""} ${e?.message||""}`))completed++;
  return clamp(Math.max(projectProgress(project)*(i+1)/events.length,completed*8));
 });
}

function projectMonitorState(project,data){
 const pid=projectId(project);
 const jobs=arr(data?.jobs).filter(j=>(j.project_id||j.projectId)===pid);
 const tasks=arr(data?.tasks).filter(t=>taskProject(t)===pid);
 const team=arr(data?.autonomousTeams).find(t=>projectId(t?.project)===pid);
 const members=arr(team?.team||team?.members);
 const workingAgent=members.find(m=>["working","running"].includes(status(m.state||m.status)));
 const runningJob=jobs.find(j=>["running","working","claimed","processing","executing","in_progress"].includes(status(j.status)));
 const queuedJob=jobs.find(j=>["queued","pending","created"].includes(status(j.status)));
 const runningTask=tasks.find(t=>["running","working","claimed","processing","executing","in_progress"].includes(status(t.status)));
 const projectStatus=status(project?.status);

 if(workingAgent||runningJob||runningTask){
  return{
   key:"working",
   label:"WORKING",
   detail:workingAgent?.name||workingAgent?.role||runningTask?.name||runningJob?.name||"Autonomous execution"
  };
 }

 if(["completed","released","verified"].includes(projectStatus))
  return{key:"completed",label:"COMPLETED",detail:"Project complete"};

 if(["failed","cancelled","blocked"].includes(projectStatus))
  return{key:"failed",label:projectStatus.toUpperCase(),detail:"Needs attention"};

 if(projectStatus==="paused")
  return{key:"paused",label:"PAUSED",detail:"Execution paused"};

 if(queuedJob||["queued","pending","created"].includes(projectStatus))
  return{key:"queued",label:"QUEUED",detail:"Waiting for execution"};

 return{
  key:"idle",
  label:"IDLE",
  detail:projectProgress(project)>0?"Not currently being worked":"Waiting to start"
 };
}

function ensureProjectMonitor(){
 if($("allProjectMonitor"))return;
 const agents=document.querySelector(".agent-performance");
 if(!agents)return;

 const monitor=document.createElement("section");
 monitor.id="allProjectMonitor";
 monitor.className="all-project-monitor hud-panel";
 monitor.innerHTML=`
  <div class="hud-title">
   <span>ALL VEYLITH PROJECTS</span>
   <b id="allProjectMonitorCount">0 PROJECTS</b>
  </div>
  <div id="allProjectMonitorList" class="all-project-monitor-list"></div>`;

 agents.insertAdjacentElement("afterend",monitor);
}

function renderAllProjects(data){
 ensureProjectMonitor();

 const root=$("allProjectMonitorList");
 const counter=$("allProjectMonitorCount");
 if(!root)return;

 const projects=arr(data?.projects);
 if(counter)counter.textContent=`${projects.length} PROJECT${projects.length===1?"":"S"}`;

 if(!projects.length){
  root.innerHTML=`<div class="empty">No Veylith projects yet.</div>`;
  return;
 }

 const order={working:0,queued:1,idle:2,paused:3,failed:4,completed:5};

 const rows=projects.map(project=>({
  project,
  monitor:projectMonitorState(project,data)
 })).sort((a,b)=>{
  const state=(order[a.monitor.key]??99)-(order[b.monitor.key]??99);
  if(state)return state;
  return String(a.project.name||a.project.title||a.project.id||"").localeCompare(
   String(b.project.name||b.project.title||b.project.id||"")
  );
 });

 root.innerHTML=rows.map(({project,monitor})=>{
  const progress=Math.round(projectProgress(project));
  const name=project?.name||project?.title||project?.id||"Untitled project";

  return`
   <div class="project-monitor-row ${monitor.key}">
    <div class="project-monitor-main">
     <i class="project-monitor-dot ${monitor.key}"></i>
     <strong title="${String(name).replaceAll('"',"&quot;")}">${name}</strong>
    </div>
    <div class="project-monitor-right">
     <span class="project-monitor-progress">${progress}%</span>
     <b class="project-monitor-status ${monitor.key}">${monitor.label}</b>
    </div>
    <div class="project-monitor-bar">
     <i style="width:${progress}%"></i>
    </div>
   </div>`;
 }).join("");
}

function ensureProjectExecutionOverview(){
 if($("projectExecutionOverview"))return;

 const monitor=$("allProjectMonitor");
 if(!monitor)return;

 const panel=document.createElement("section");
 panel.id="projectExecutionOverview";
 panel.className="project-execution-overview hud-panel";

 panel.innerHTML=`
  <div class="hud-title">
   <span>PROJECT EXECUTION OVERVIEW</span>
   <b>LIVE</b>
  </div>
  <div id="projectExecutionVisual" class="project-execution-visual"></div>`;

 monitor.insertAdjacentElement("afterend",panel);
}

function renderProjectExecutionOverview(data){
 ensureProjectExecutionOverview();

 const root=$("projectExecutionVisual");
 if(!root)return;

 const projects=arr(data?.projects);

 const states=projects.map(project=>({
  project,
  state:projectMonitorState(project,data)
 }));

 const counts={
  working:states.filter(x=>x.state.key==="working").length,
  queued:states.filter(x=>x.state.key==="queued").length,
  idle:states.filter(x=>x.state.key==="idle").length,
  completed:states.filter(x=>x.state.key==="completed").length,
  failed:states.filter(x=>x.state.key==="failed").length,
  paused:states.filter(x=>x.state.key==="paused").length
 };

 const total=Math.max(projects.length,1);

 const segments=[
  ["working",counts.working,"WORKING"],
  ["queued",counts.queued,"QUEUED"],
  ["idle",counts.idle,"IDLE"],
  ["completed",counts.completed,"COMPLETE"],
  ["failed",counts.failed,"FAILED"],
  ["paused",counts.paused,"PAUSED"]
 ].filter(x=>x[1]>0);

 const active=states.find(x=>x.state.key==="working");

 root.innerHTML=`
  <div class="execution-distribution">
   ${segments.map(([key,count,label])=>`
    <div class="execution-segment">
     <div class="execution-segment-head">
      <span><i class="execution-dot ${key}"></i>${label}</span>
      <b>${count}</b>
     </div>
     <div class="execution-track">
      <i class="${key}" style="width:${Math.max(4,(count/total)*100)}%"></i>
     </div>
    </div>
   `).join("")}
  </div>

  <div class="execution-now ${active?"working":"idle"}">
   <span class="execution-now-label">
    <i class="execution-dot ${active?"working":"idle"}"></i>
    ${active?"CURRENTLY EXECUTING":"NO ACTIVE EXECUTION"}
   </span>
   <strong>${
    active
     ? escapeHtml(active.project?.name||active.project?.title||active.project?.id||"Project")
     : "Veylith is waiting for executable work"
   }</strong>
  </div>`;
}
function ensureShell(){
 if($("projectIntelligence"))return;
 const stage=document.querySelector(".command-stage");
 if(!stage)return;
 const right=document.createElement("section");
 right.id="projectIntelligence";
 right.className="project-intelligence";
 right.innerHTML=`<div class="pi-panel pi-portfolio"><div class="pi-head"><span>PROJECT PORTFOLIO</span><b>LIVE</b></div><div class="pi-portfolio-body"><div id="piDonut" class="pi-donut"></div><div id="piLegend" class="pi-legend"></div></div></div><div class="pi-panel pi-velocity"><div class="pi-head"><span>PROJECT VELOCITY</span><b id="piVelocityMeta">LIVE PROGRESS</b></div><div id="piVelocity" class="pi-line"></div></div><div class="pi-panel pi-workload"><div class="pi-head"><span>AUTONOMOUS WORKLOAD</span><b>AGENT PHASES</b></div><div id="piWorkload"></div></div><div class="pi-panel pi-forecast"><div class="pi-head"><span>DELIVERY FORECAST</span><b id="piEta">CALCULATING</b></div><div class="pi-forecast-track"><i id="piForecastBar"></i><span id="piForecastProgress">0%</span></div><small id="piForecastProject">Waiting for project</small></div>`;
 stage.appendChild(right);
 const roadmap=document.createElement("section");
 roadmap.id="projectRoadmap";
 roadmap.className="project-roadmap";
 roadmap.innerHTML=`<div class="pi-head"><span>CURRENT PROJECT ROADMAP</span><b id="piRoadmapProject">WAITING</b></div><div id="piRoadmapStages" class="pi-roadmap-stages"></div>`;
 stage.appendChild(roadmap);
}
function moveMainPanels(){
 const stage=document.querySelector(".command-stage");
 if(!stage)return;
 const terminal=$("terminal");
 if(terminal&&!$("mainExecutionTerminal")){
  const sourcePanel=terminal.closest(".detail-panel");
  const panel=document.createElement("section");
  panel.id="mainExecutionTerminal";
  panel.className="hud-panel main-terminal";
  panel.innerHTML=`<div class="hud-title terminal-title"><span>EXECUTION TERMINAL</span><div class="terminal-live"><b id="terminalAgentStatus" class="terminal-agent-status waiting"><i></i> IDLE</b><b>LIVE STREAM</b></div></div>`;
  panel.appendChild(terminal);
  stage.appendChild(panel);
  if(sourcePanel){
   const title=sourcePanel.querySelector(".hud-title,.sub-title");
   if(title&&sourcePanel.querySelectorAll("*").length<8)sourcePanel.style.display="none";
  }
 }
 const activity=document.querySelector(".activity-panel");
 if(activity){
  activity.classList.add("activity-terminal");
  const title=activity.querySelector(".hud-title");
  if(title){
   const first=title.querySelector("span")||title.firstElementChild;
   if(first)first.textContent="ACTIVITY TERMINAL";
  }
 }
 const agents=document.querySelector(".agent-performance");
 if(agents){
  agents.classList.add("workforce-panel");
  const count=agents.querySelector("#workerCount");
  if(count)count.textContent=`${agents.querySelectorAll(".agent-row").length||9} AGENTS`;
 }
 const projects=document.querySelector(".project-progress");
 if(projects){
  projects.classList.add("legacy-project-panel","left-project-window");
  projects.querySelector(".hud-title span").textContent="CURRENT PROJECT";
 }
 const tasks=document.querySelector(".task-panel");
 if(tasks){
  tasks.classList.add("legacy-task-panel","left-task-window");
  tasks.querySelector(".hud-title span").textContent="CURRENT / NEXT TASK";
 }
 document.querySelector(".rail-left")?.classList.add("legacy-runtime-rail");
 document.querySelector(".rail-right")?.classList.add("legacy-system-rail");
}
function makeSystemWidget(){
 if($("systemWidget"))return;
 const cpu=$("cpuChart"),memory=$("memoryChart");
 const rail=document.querySelector(".rail-right");
 const widget=document.createElement("aside");
 widget.id="systemWidget";
 widget.className="system-widget";
 widget.innerHTML=`<div class="system-widget-head"><span>SYSTEM</span><button id="systemWidgetToggle" type="button">−</button></div><div class="system-widget-body"><div class="system-widget-charts"></div><div class="system-widget-meta"></div></div>`;
 document.body.appendChild(widget);
 const charts=widget.querySelector(".system-widget-charts");
 [cpu,memory].forEach(canvas=>{
  if(!canvas)return;
  const parent=canvas.closest(".tiny-chart");
  if(parent)charts.appendChild(parent);
 });
 if(rail)widget.querySelector(".system-widget-meta").appendChild(rail);
 const saved=JSON.parse(localStorage.getItem("veylith-system-widget")||"null");
 if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)){widget.style.left=`${saved.x}px`;widget.style.top=`${saved.y}px`;widget.style.right="auto";widget.style.bottom="auto"}
 let drag=null;
 const head=widget.querySelector(".system-widget-head");
 head.addEventListener("pointerdown",e=>{
  if(e.target.closest("button"))return;
  const r=widget.getBoundingClientRect();
  drag={dx:e.clientX-r.left,dy:e.clientY-r.top};
  head.setPointerCapture(e.pointerId);
 });
 head.addEventListener("pointermove",e=>{
  if(!drag)return;
  const x=Math.max(0,Math.min(innerWidth-widget.offsetWidth,e.clientX-drag.dx));
  const y=Math.max(0,Math.min(innerHeight-widget.offsetHeight,e.clientY-drag.dy));
  widget.style.left=`${x}px`;widget.style.top=`${y}px`;widget.style.right="auto";widget.style.bottom="auto";
 });
 head.addEventListener("pointerup",()=>{
  if(!drag)return;
  localStorage.setItem("veylith-system-widget",JSON.stringify({x:parseFloat(widget.style.left)||0,y:parseFloat(widget.style.top)||0}));
  drag=null;
 });
 $("systemWidgetToggle")?.addEventListener("click",()=>widget.classList.toggle("collapsed"));
}
export function renderProjectIntelligence(data){
 renderAllProjects(data);
 renderProjectExecutionOverview(data);
 ensureShell();
 moveMainPanels();
 makeSystemWidget();
 const project=currentProject(data);
 const teams=arr(data?.autonomousTeams);
 const team=teams.find(t=>projectId(t?.project)===projectId(project))||teams.find(t=>arr(t?.members).some(m=>["working","running"].includes(status(m.state))))||teams[0]||null;
 const c=counts(data);
 if($("piDonut"))$("piDonut").innerHTML=donut(c);
 if($("piLegend"))$("piLegend").innerHTML=[
  ["ACTIVE",c.active,"live"],["QUEUED",c.queued,"queued"],["COMPLETED",c.completed,"done"],["FAILED",c.failed,"failed"]
 ].map(x=>`<div><i class="${x[2]}"></i><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");
 if($("piVelocity"))$("piVelocity").innerHTML=svgLine(history(data,project));
 if($("piVelocityMeta"))$("piVelocityMeta").textContent=project?`${Math.round(projectProgress(project))}% CURRENT PROJECT`:"NO ACTIVE PROJECT";
 if($("piWorkload"))$("piWorkload").innerHTML=workload(team);
 if($("piRoadmapStages"))$("piRoadmapStages").innerHTML=roadmap(team);
 if($("piRoadmapProject"))$("piRoadmapProject").textContent=project?.name||project?.title||"WAITING";
 const progress=projectProgress(project);
 if($("piEta"))$("piEta").textContent=eta(project,data);
 if($("piForecastBar"))$("piForecastBar").style.width=`${progress}%`;
 if($("piForecastProgress"))$("piForecastProgress").textContent=`${Math.round(progress)}%`;
 if($("piForecastProject"))$("piForecastProject").textContent=project?.name||project?.title||"Waiting for project";
}




