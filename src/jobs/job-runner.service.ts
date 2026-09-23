import {JOB_HEARTBEAT_MS,JOB_RETRY_BASE_MS} from "../config/config.js";
import {db} from "../database/database.js";
import {event,setWorker} from "../core/telemetry.js";
import {executeTask,failTask} from "../core/task.service.js";
import {TaskControlError,assertTaskRunnable} from "../core/task-control.service.js";
import {cancelTaskSandboxes} from "../sandbox/sandbox-manager.service.js";
import {claimNextJob,completeJob,heartbeatJob,pauseJob,requeueJob,failJob,getJob} from "./job.repository.js";
import {occupyWorkerSlot,pulseWorkerSlot,freeWorkerSlot} from "../workers/worker-slot.service.js";
import {runtimeOwner,RUNTIME_ID} from "../runtime/runtime-instance.service.js";
import {logger} from "../logging/logger.service.js";

const activeSlots=new Set<number>();
const controls=new Map<string,{cancelled:boolean;paused:boolean}>();

function errorMessage(error:unknown){
 return error instanceof Error?error.message:String(error);
}

function retryDelay(attempts:number){
 return Math.min(
  300000,
  JOB_RETRY_BASE_MS*Math.pow(2,Math.max(0,attempts-1))
 );
}

export function requestRunningTaskControl(taskId:string,action:"cancel"|"pause"){
 const state=controls.get(taskId)||{cancelled:false,paused:false};

 if(action==="cancel")state.cancelled=true;
 if(action==="pause")state.paused=true;

 controls.set(taskId,state);

 void cancelTaskSandboxes(taskId,action).then(result=>{
  if(result.requested>0){
   event(
    "sandbox.task_terminated",
    `${action} terminated ${result.terminated}/${result.requested} active sandbox process trees`,
    {
     taskId,
     level:"warn",
     component:"sandbox",
     data:result
    }
   );
  }
 }).catch(error=>{
  event(
   "sandbox.termination_failed",
   errorMessage(error),
   {
    taskId,
    level:"error",
    component:"sandbox",
    data:{action}
   }
  );
 });
}

function assertControl(taskId:string){
 const state=controls.get(taskId);

 if(state?.cancelled){
  throw new TaskControlError("cancel","Task cancelled.");
 }

 if(state?.paused){
  throw new TaskControlError("pause","Task paused.");
 }

 assertTaskRunnable(taskId);
}

export async function runJobSlot(slot:number){
 if(activeSlots.has(slot))return false;

 const owner=runtimeOwner(slot);
 const job=claimNextJob(owner);

 if(!job)return false;

 const context={
  runtimeId:RUNTIME_ID,
  jobId:job.id,
  taskId:job.task_id,
  projectId:job.project_id,
  component:"job-runner",
  operation:"execute"
 };

 const started=Date.now();

 activeSlots.add(slot);
 controls.set(job.task_id,{cancelled:false,paused:false});
 occupyWorkerSlot(slot,job);
 setWorker("busy","executing",job.task_id,job.project_id);

 event(
  "job.claimed",
  `Claimed ${job.id}`,
  {
   jobId:job.id,
   taskId:job.task_id,
   projectId:job.project_id,
   phase:"executing",
   component:"job-runner",
   data:{
    slot,
    owner,
    attempt:job.attempts,
    runtimeId:RUNTIME_ID
   }
  }
 );

 logger.debug(
  "Job execution context established",
  context,
  {
   slot,
   owner,
   attempt:job.attempts
  }
 );

 const heartbeat=setInterval(()=>{
  try{
   const current=getJob(job.id);
   if(!current||current.status!=="running")return;
   heartbeatJob(job.id,owner);
   pulseWorkerSlot(slot);
  }catch(error){
   logger.warn(
    "Job heartbeat failed",
    {...context,operation:"heartbeat"},
    {slot,error:errorMessage(error)}
   );
  }
 },JOB_HEARTBEAT_MS);

 heartbeat.unref();

 try{
  assertControl(job.task_id);

  const task=db.prepare(
   "SELECT * FROM tasks WHERE id=?"
  ).get(job.task_id) as any;

  if(!task){
   throw new Error(`Task ${job.task_id} not found.`);
  }

  await executeTask(task);
  assertControl(job.task_id);
  completeJob(job.id,owner);

  event(
   "job.completed",
   `Job ${job.id} completed`,
   {
    jobId:job.id,
    taskId:job.task_id,
    projectId:job.project_id,
    phase:"completed",
    component:"job-runner",
    data:{
     slot,
     owner,
     durationMs:Date.now()-started
    }
   }
  );
 }catch(error){
  const currentTask=db.prepare(
   "SELECT * FROM tasks WHERE id=?"
  ).get(job.task_id) as any;

  if(
   error instanceof TaskControlError||
   currentTask?.status==="cancelled"||
   currentTask?.status==="paused"
  ){
   const action=
    currentTask?.status==="cancelled"||
    error instanceof TaskControlError&&error.action==="cancel"
     ?"cancel"
     :"pause";

   await cancelTaskSandboxes(job.task_id,action);

   event(
    `job.${action}led`,
    action==="cancel"
     ?"Running job cancelled with process containment"
     :"Running job paused with process containment",
    {
     jobId:job.id,
     taskId:job.task_id,
     projectId:job.project_id,
     phase:action==="cancel"?"cancelled":"paused",
     component:"job-runner",
     level:"warn",
     data:{
      slot,
      owner,
      durationMs:Date.now()-started
     }
    }
   );
  }else{
   const message=errorMessage(error);

   if(currentTask){
    try{
     await failTask(currentTask,error);
    }catch(failError){
     event(
      "job.failure_handler_error",
      errorMessage(failError),
      {
       jobId:job.id,
       taskId:job.task_id,
       projectId:job.project_id,
       component:"job-runner",
       level:"error",
       data:{slot}
      }
     );
    }
   }

   const current=db.prepare(
    "SELECT * FROM tasks WHERE id=?"
   ).get(job.task_id) as any;

   if(current?.status==="paused"){
    pauseJob(job.id,message);
   }else if(current?.status==="queued"){
    const delay=retryDelay(job.attempts);

    requeueJob(job.id,delay,message);

    event(
     "job.retry_scheduled",
     `Job ${job.id} retry scheduled`,
     {
      jobId:job.id,
      taskId:job.task_id,
      projectId:job.project_id,
      phase:"queued",
      component:"job-runner",
      level:"warn",
      data:{
       slot,
       delay,
       attempt:job.attempts
      }
     }
    );
   }else{
    failJob(job.id,message);
   }

   logger.error(
    message,
    {...context,operation:"execute"},
    {
     slot,
     owner,
     durationMs:Date.now()-started
    },
    error
   );

   event(
    "job.execution_error",
    message,
    {
     jobId:job.id,
     taskId:job.task_id,
     projectId:job.project_id,
     phase:"failed",
     component:"job-runner",
     level:"error",
     data:{
      slot,
      owner,
      durationMs:Date.now()-started
     }
    }
   );
  }
 }finally{
  clearInterval(heartbeat);

  await cancelTaskSandboxes(
   job.task_id,
   "shutdown"
  ).catch(()=>{});

  controls.delete(job.task_id);
  activeSlots.delete(slot);
  freeWorkerSlot(slot);

  if(activeSlots.size===0){
   setWorker("online","idle");
  }
 }

 return true;
}

export function activeJobSlots(){
 return [...activeSlots].sort((a,b)=>a-b);
}

export function activeJobCount(){
 return activeSlots.size;
}
