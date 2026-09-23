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

export function renderEvents(data){
 const events=data.events||[];
 $("eventCount").textContent=`${events.length} EVENTS`;
 $("feed").innerHTML=events.slice().reverse().slice(0,100).map(event=>`
 <div class="event-row ${statusClass(event.level)}">
  <span>${new Date(event.created_at).toLocaleTimeString()}</span>
  <b>${escapeHtml(event.type)}</b>
  <span>${escapeHtml(event.message)}</span>
 </div>`).join("");
}

export function prependEvent(event){
 const row=document.createElement("div");
 row.className=`event-row ${statusClass(event.level)}`;
 row.innerHTML=`
 <span>${new Date(event.created_at).toLocaleTimeString()}</span>
 <b>${escapeHtml(event.type)}</b>
 <span>${escapeHtml(event.message)}</span>`;
 $("feed").prepend(row);
 while($("feed").children.length>100)$("feed").lastChild.remove();
}
