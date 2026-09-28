const $=id=>document.getElementById(id);
let dashboard=null;
let runtime=[];
let reconnectTimer=null;

function esc(value){
 const div=document.createElement("div");
 div.textContent=String(value??"");
 return div.innerHTML;
}
function array(value){return Array.isArray(value)?value:[]}
function state(value){return String(value||"").toLowerCase()}
function pct(value){
 const number=Number(value);
 if(!Number.isFinite(number))return 0;
 return Math.max(0,Math.min(100,number));
}
function progress(item){
 const direct=Number(item?.progress??item?.progress_percent??item?.progressPercent);
 if(Number.isFinite(direct))return pct(direct);
 const s=state(item?.status||item?.state);
 if(["completed","done","published"].includes(s))return 100;
 if(["running","working","active","executing"].includes(s))return 50;
 return 0;
}
function name(item,fallback="UNKNOWN"){
 return String(item?.name||item?.title||item?.id||fallback);
}
function activeStatus(value){
 return ["running","working","active","executing","claimed","in_progress"].includes(state(value));
}
function completedStatus(value){
 return ["completed","done","published","success","succeeded"].includes(state(value));
}
function failedStatus(value){
 return ["failed","error","cancelled","canceled"].includes(state(value));
}
function teamMembers(data){
 const teams=array(data?.autonomousTeams);
 const active=teams.find(team=>{
  const members=array(team?.team?.length?team.team:team?.members);
  return members.some(member=>activeStatus(member?.state||member?.status));
 })||teams[0];
 return {team:active,members:array(active?.team?.length?active.team:active?.members)};
}
function renderHeader(data){
 const projects=array(data.projects);
 const tasks=array(data.tasks);
 const activeTask=tasks.find(task=>activeStatus(task.status||task.state));
 const activeProject=projects.find(project=>project.id===activeTask?.project_id)||projects.find(project=>activeStatus(project.status||project.state));
 $("activeProject").textContent=activeProject?name(activeProject):"NO ACTIVE PROJECT";
}
function renderStats(data){
 const stats=data.stats||{};
 $("running").textContent=stats.running??0;
 $("queued").textContent=stats.queued??0;
 $("completed").textContent=stats.completed??0;
 $("failed").textContent=stats.failed??0;
}
function renderProjects(data){
 const projects=array(data.projects);
 $("projectCount").textContent=`${projects.length} PROJECTS`;
 $("portfolioTotal").textContent=projects.length;
 $("portfolioActive").textContent=projects.filter(p=>activeStatus(p.status||p.state)).length;
 $("portfolioDone").textContent=projects.filter(p=>completedStatus(p.status||p.state)).length;
 $("portfolioFailed").textContent=projects.filter(p=>failedStatus(p.status||p.state)).length;
 $("projects").innerHTML=projects.slice(0,7).map(project=>{
  const value=progress(project);
  return `<div class="project"><div class="project-top"><strong>${esc(name(project))}</strong><b>${value}%</b></div><div class="project-meta"><span>${esc(project.status||project.state||"UNKNOWN")}</span><span>${esc(project.id||"")}</span></div><div class="progress"><i style="width:${value}%"></i></div></div>`;
 }).join("")||'<div class="empty">No Veylith projects yet.</div>';
}
function renderAgents(data){
 const {members}=teamMembers(data);
 $("agentCount").textContent=`${members.length} AGENTS`;
 $("agents").innerHTML=members.map(member=>{
  const s=state(member.state||member.status);
  const cls=activeStatus(s)?"working":completedStatus(s)?"done":"";
  return `<div class="agent ${cls}"><i class="agent-dot"></i><strong>${esc(member.role||member.name||member.id||"AGENT")}</strong><span>${esc(s||"idle")}</span></div>`;
 }).join("")||'<div class="empty">No active autonomous team.</div>';
 const working=members.find(member=>activeStatus(member.state||member.status));
 $("currentAgent").textContent=working?String(working.role||working.name||working.id||"VEYlITH").toUpperCase():"VEYlITH";
 $("currentPhase").textContent=working?String(working.phase||working.state||"WORKING").toUpperCase():"AWAITING AUTONOMOUS WORK";
 $("developerState").textContent=working?"WORKING":"STANDBY";
}
function renderWorkload(data){
 const {members}=teamMembers(data);
 const active=members.filter(member=>activeStatus(member.state||member.status));
 $("workloadState").textContent=active.length?`${active.length} ACTIVE`:"IDLE";
 $("workload").innerHTML=members.slice(0,9).map(member=>{
  const s=state(member.state||member.status);
  const value=activeStatus(s)?100:completedStatus(s)?100:s==="queued"?25:8;
  return `<div class="work-row"><strong>${esc(member.role||member.name||member.id||"AGENT")}</strong><div class="work-bar"><i style="width:${value}%"></i></div><span>${esc(s||"idle")}</span></div>`;
 }).join("")||'<div class="empty">Waiting for agent workload.</div>';
}
function renderVelocity(data){
 const tasks=array(data.tasks);
 const completed=tasks.filter(task=>completedStatus(task.status||task.state)).length;
 $("velocityValue").textContent=completed;
 const metrics=array(data.metrics).slice(-12);
 const values=metrics.length?metrics.map(metric=>Math.max(5,Math.min(100,Number(metric.value||metric.cpu||metric.memory||20)))):[12,20,18,34,28,45,38,52,48,64,58,72];
 $("velocityBars").innerHTML=values.map(value=>`<i style="height:${value}%"></i>`).join("");
}
function renderForecast(data){
 const projects=array(data.projects);
 const tasks=array(data.tasks);
 const activeTask=tasks.find(task=>activeStatus(task.status||task.state));
 const project=projects.find(p=>p.id===activeTask?.project_id)||projects.find(p=>activeStatus(p.status||p.state))||projects[0];
 const projectTasks=project?tasks.filter(task=>task.project_id===project.id):[];
 const completed=projectTasks.filter(task=>completedStatus(task.status||task.state)).length;
 const value=projectTasks.length?Math.round(completed/projectTasks.length*100):project?progress(project):0;
 $("forecastPercent").textContent=`${value}%`;
 $("forecastProject").textContent=project?name(project):"NO ACTIVE PROJECT";
 $("forecastDetail").textContent=projectTasks.length?`${completed} of ${projectTasks.length} project tasks completed.`:"Waiting for project execution data.";
}
function renderRoadmap(data){
 const phases=["Architecture","Planning","Development","Validation","Review","Repair","Versioning","Publish"];
 const {members}=teamMembers(data);
 const activeIndex=Math.max(0,phases.findIndex(phase=>members.some(member=>activeStatus(member.state||member.status)&&String(member.role||member.name||member.id||"").toLowerCase().includes(phase.toLowerCase().replace("development","develop").replace("validation","valid").replace("versioning","version")))));
 $("roadmap").innerHTML=phases.map((phase,index)=>`<div class="road-step ${index<activeIndex?"done":index===activeIndex&&members.length?"active":""}"><i class="road-dot"></i><strong>${phase}</strong></div>`).join("");
}
function lineText(event){
 return String(event?.message||event?.text||event?.type||event?.event||"Runtime activity");
}
function addRuntime(text,type="SYSTEM"){
 const time=new Date().toLocaleTimeString();
 runtime.push({time,type,text:String(text)});
 if(runtime.length>80)runtime=runtime.slice(-80);
 $("runtimeTerminal").innerHTML=runtime.slice(-14).map(line=>`<div class="terminal-line"><span class="terminal-time">${esc(line.time)}</span><b class="terminal-type">${esc(line.type)}</b><span class="terminal-message">${esc(line.text)}</span></div>`).join("");
 $("runtimeState").textContent="LIVE";
}
function seedRuntime(data){
 if(runtime.length)return;
 array(data.events).slice(-30).forEach(event=>addRuntime(lineText(event),String(event.type||"EVENT").split(".")[0].toUpperCase()));
}
function renderDevelopment(data){
 const steps=array(data.developmentSteps).slice(-30);
 $("developmentFeed").innerHTML=steps.slice(-12).reverse().map(step=>{
  const time=new Date(step.created_at||step.createdAt||Date.now()).toLocaleTimeString();
  const role=step.agent||step.role||step.worker_role||step.phase||"VEYlITH";
  const message=step.message||step.description||step.action||step.status||"Development activity";
  return `<div class="dev-line"><span class="dev-time">${esc(time)}</span><b class="dev-role">${esc(role)}</b><span class="dev-message">${esc(message)}</span></div>`;
 }).join("")||'<div class="empty">Waiting for development activity...</div>';
}
function render(data){
 dashboard=data;
 renderHeader(data);
 renderStats(data);
 renderProjects(data);
 renderAgents(data);
 renderWorkload(data);
 renderVelocity(data);
 renderForecast(data);
 renderRoadmap(data);
 renderDevelopment(data);
 seedRuntime(data);
}
function connection(live){
 const status=$("systemStatus");
 const pill=$("connectionPill");
 if(live){
  status.textContent="SYSTEM LIVE";
  status.parentElement.classList.add("live");
  pill.classList.add("live");
  pill.querySelector("span").textContent="LIVE CONNECTION";
 }else{
  status.textContent="RECONNECTING";
  status.parentElement.classList.remove("live");
  pill.classList.remove("live");
  pill.querySelector("span").textContent="RECONNECTING TO VEYLITH";
 }
}
async function refresh(){
 try{
  const response=await fetch("/api/dashboard",{cache:"no-store"});
  if(!response.ok)throw new Error(`Dashboard ${response.status}`);
  render(await response.json());
  connection(true);
 }catch(error){
  console.error(error);
  connection(false);
 }
}
function connect(){
 const events=new EventSource("/api/events");
 events.onopen=()=>connection(true);
 events.onmessage=event=>{
  try{
   const message=JSON.parse(event.data);
   const channel=String(message.channel||"EVENT").toUpperCase();
   const payload=message.payload||{};
   if(channel!=="CONNECTED")addRuntime(lineText(payload),channel);
   if(["EVENT","WORKER","WORKER_SLOTS","PHASE","TASK","JOB","METRIC"].includes(channel))refresh();
  }catch{}
 };
 events.onerror=()=>{
  connection(false);
  events.close();
  clearTimeout(reconnectTimer);
  reconnectTimer=setTimeout(connect,3000);
 };
}
await refresh();
connect();
setInterval(refresh,15000);
