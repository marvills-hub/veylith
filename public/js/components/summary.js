import {$,escapeHtml,statusClass} from "../core/utils.js";
export function renderStats(data){
 const stats=data.stats||{};
 $("workersCount").textContent=data.workerSlots?.length||data.workers?.length||0;
 $("running").textContent=stats.running||0;
 $("queued").textContent=stats.queued||0;
 $("completed").textContent=stats.completed||0;
 $("failed").textContent=stats.failed||0;
 $("paused").textContent=stats.paused||0;
}
export function renderWorkers(data){
 const slots=data.workerSlots||[];
 $("workerCount").textContent=`${slots.length} SLOTS`;
 $("workers").innerHTML=slots.length?slots.map(slot=>`
 <div class="worker-row">
  <div class="worker-main">
   <span class="state-indicator ${statusClass(slot.status)}"></span>
   <div>
    <strong>${escapeHtml(slot.id)}</strong>
    <small>${escapeHtml(slot.task_id||slot.taskId||slot.status||"idle")}</small>
   </div>
  </div>
  <span class="status ${statusClass(slot.status)}">${escapeHtml(slot.status||"unknown")}</span>
 </div>`).join(""):`<div class="empty">No worker slots.</div>`;
}
export function renderProjects(data){
 const projects=data.projects||[];
 $("projectCount").textContent=`${projects.length} PROJECTS`;
 $("projects").innerHTML=projects.length?projects.map(project=>`
 <div class="project-row">
  <div class="project-head">
   <strong>${escapeHtml(project.name)}</strong>
   <span class="status ${statusClass(project.status)}">${escapeHtml(project.status)}</span>
  </div>
  <div class="project-meta">
   <span>${Number(project.progress)||0}%</span>
   <span>${escapeHtml(project.github_repo||"LOCAL")}</span>
  </div>
  <div class="progress"><span style="width:${Math.max(0,Math.min(100,Number(project.progress)||0))}%"></span></div>
 </div>`).join(""):`<div class="empty">No projects yet.</div>`;
}
