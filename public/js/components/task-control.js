import {$,escapeHtml,statusClass} from "../core/utils.js";
import {api} from "../api/client.js";
import {getState,setState} from "../core/state.js";

let refreshCallback=null;

function currentData(){
 return getState().dashboard;
}

function findTask(id){
 return currentData()?.tasks?.find(task=>task.id===id)||null;
}

function findJob(taskId){
 const jobs=currentData()?.jobs||[];
 return jobs.find(job=>job.task_id===taskId)||null;
}

function findWorker(job){
 if(!job)return null;
 const slots=currentData()?.workerSlots||[];
 return slots.find(slot=>
  slot.id===job.worker_id||
  slot.worker_id===job.worker_id||
  slot.task_id===job.task_id
 )||null;
}

function phase(task,job,worker){
 return worker?.phase||
  job?.status||
  task?.phase||
  task?.status||
  "unknown";
}

function canPause(task){
 return ["queued","running","resuming","waiting_ai"].includes(task?.status);
}

function canResume(task){
 return ["paused","waiting_ai"].includes(task?.status);
}

function canCancel(task){
 return !["completed","failed","cancelled"].includes(task?.status);
}

export function closeTaskControl(){
 $("taskControl").classList.remove("open");
 setState({selectedTaskId:null});
}

export function renderTaskControl(id=getState().selectedTaskId){
 if(!id)return;

 const task=findTask(id);

 if(!task){
  closeTaskControl();
  return;
 }

 const job=findJob(id);
 const worker=findWorker(job);
 const priority=Number(job?.priority??task.priority??0);
 const attempts=Number(job?.attempts??task.attempts??0);
 const maxAttempts=Number(job?.max_attempts??task.max_attempts??0);
 const repairs=Number(task.repair_attempts)||0;
 const progress=Math.max(0,Math.min(100,Number(task.progress)||0));

 $("taskControl").classList.add("open");
 $("controlTaskName").textContent=task.name||task.id;
 $("controlTaskId").textContent=task.id;
 $("controlStatus").textContent=task.status||"unknown";
 $("controlStatus").className=`status large ${statusClass(task.status)}`;
 $("controlProgressText").textContent=`${progress}%`;
 $("controlProgressBar").style.width=`${progress}%`;
 $("controlPhase").textContent=phase(task,job,worker);
 $("controlWorker").textContent=job?.worker_id||worker?.id||"UNASSIGNED";
 $("controlJob").textContent=job?.id||"NO ACTIVE JOB";
 $("controlAttempts").textContent=maxAttempts?`${attempts} / ${maxAttempts}`:`${attempts}`;
 $("controlRepairs").textContent=`${repairs}`;
 $("controlPriority").value=`${priority}`;
 $("controlError").textContent=task.error||job?.last_error||"";
 $("controlErrorBox").style.display=task.error||job?.last_error?"block":"none";

 $("pauseTask").disabled=!canPause(task);
 $("resumeTask").disabled=!canResume(task);
 $("cancelTask").disabled=!canCancel(task);
 $("applyPriority").disabled=["completed","failed","cancelled"].includes(task.status);

 document.querySelectorAll(".task-row").forEach(row=>{
  row.classList.toggle("selected",row.dataset.task===task.id);
 });
}

async function action(button,work){
 const old=button.textContent;
 button.disabled=true;
 button.textContent="WORKING...";
 try{
  await work();
  await refreshCallback?.();
  renderTaskControl();
 }catch(error){
  alert(error.message);
 }finally{
  button.textContent=old;
  renderTaskControl();
 }
}

export function setupTaskControl(refresh){
 refreshCallback=refresh;

 $("closeTaskControl").onclick=closeTaskControl;

 $("pauseTask").onclick=()=>action(
  $("pauseTask"),
  ()=>api.pauseTask(getState().selectedTaskId)
 );

 $("resumeTask").onclick=()=>action(
  $("resumeTask"),
  ()=>api.resumeTask(getState().selectedTaskId)
 );

 $("cancelTask").onclick=async()=>{
  const id=getState().selectedTaskId;
  const task=findTask(id);
  if(!task)return;
  if(!confirm(`Cancel "${task.name||task.id}"?`))return;

  await action(
   $("cancelTask"),
   ()=>api.cancelTask(id)
  );
 };

 $("applyPriority").onclick=()=>{
  const priority=Number($("controlPriority").value);

  if(!Number.isFinite(priority)){
   alert("Priority must be numeric.");
   return;
  }

  action(
   $("applyPriority"),
   ()=>api.priority(getState().selectedTaskId,priority)
  );
 };

 $("taskControl").onclick=event=>{
  if(event.target===$("taskControl"))closeTaskControl();
 };
}
