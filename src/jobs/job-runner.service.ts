import {synchronizeTaskDevelopment} from "../development/development-lifecycle.service.js";
import {JOB_HEARTBEAT_MS,JOB_RETRY_BASE_MS} from "../config/config.js";
import {db} from "../database/database.js";
import {event,setWorker} from "../core/telemetry.js";
import {executeTask,failTask} from "../core/task.service.js";
import {TaskControlError,assertTaskRunnable} from "../core/task-control.service.js";
import {cancelTaskSandboxes} from "../sandbox/sandbox-manager.service.js";
import {claimNextJob,completeJob,heartbeatJob,pauseJob,requeueJob,failJob,getJob,consumeJobAttempt,extendJobForAutonomousRecovery} from "./job.repository.js";
import {occupyWorkerSlot,pulseWorkerSlot,freeWorkerSlot} from "../workers/worker-slot.service.js";
import {runtimeOwner,RUNTIME_ID} from "../runtime/runtime-instance.service.js";
import {logger} from "../logging/logger.service.js";
import {classifyJobFailure} from "./job-failure-classifier.service.js";
import {isGoalManagedTask,failGoalTaskExecution} from "../team/goal-team-execution.service.js";
import {executeGoalTeamTask} from "../team/goal-role-executor.service.js";

const activeSlots=new Set<number>();
const controls=new Map<string,{cancelled:boolean;paused:boolean}>();

function errorMessage(error:unknown){
 return error instanceof Error?error.message:String(error);
}

function recoverableTeamRepair(taskId:string){
 const row=db.prepare(`
  SELECT tr.id,tr.status,tr.attempts,tr.max_attempts
  FROM team_recoveries tr
  JOIN goal_work_dispatches gwd ON gwd.work_item_id=tr.work_item_id
  WHERE gwd.task_id=?
  ORDER BY tr.updated_at DESC
  LIMIT 1
 `).get(taskId) as any;
 if(!row)return null;
 const status=String(row.status||"");
 const attempts=Number(row.attempts||0);
 const maxAttempts=Number(row.max_attempts||0);
 if(["recovered","failed","blocked","exhausted"].includes(status))return null;
 if(attempts>=maxAttempts)return null;
 return{
  id:String(row.id),
  status,
  attempts,
  maxAttempts
 };
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

  const goalManaged=isGoalManagedTask(task.id);

  if(goalManaged){

   await executeGoalTeamTask(task);

  }else{

   await executeTask(task);

  }

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

  const classification=classifyJobFailure(error,currentTask);
  const message=errorMessage(error);

  if(classification.cancel||classification.pause){
   const action=classification.cancel?"cancel":"pause";

   await cancelTaskSandboxes(job.task_id,action);

   event(
    classification.cancel?"job.cancelled":"job.paused",
    classification.cancel
     ?"Running job cancelled with process containment"
     :"Running job paused with process containment",
    {
     jobId:job.id,
     taskId:job.task_id,
     projectId:job.project_id,
     phase:classification.cancel?"cancelled":"paused",
     component:"job-runner",
     level:"warn",
     data:{
      slot,
      owner,
      failureKind:classification.kind,
      durationMs:Date.now()-started
     }
    }
   );
  }else{
   let currentJob=getJob(job.id)||job;

   if(classification.consumeAttempt){
    currentJob=
     consumeJobAttempt(job.id,owner)||
     getJob(job.id)||
     job;
   }

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
       data:{
        slot,
        failureKind:classification.kind
       }
      }
     );
    }
   }

   const current=db.prepare(
    "SELECT * FROM tasks WHERE id=?"
   ).get(job.task_id) as any;

   currentJob=getJob(job.id)||currentJob;

   const exhausted=
    currentJob.attempts>=currentJob.max_attempts;

   if(
    classification.kind==="provider_retryable"||
    current?.status==="paused"
   ){
    pauseJob(job.id,message);

    event(
     "job.provider_wait",
     `Job ${job.id} paused while waiting for provider`,
     {
      jobId:job.id,
      taskId:job.task_id,
      projectId:job.project_id,
      phase:"waiting_ai",
      component:"job-runner",
      level:"warn",
      data:{
       slot,
       failureKind:classification.kind,
       attempt:currentJob.attempts,
       maxAttempts:currentJob.max_attempts
      }
     }
    );
   }else if(
        exhausted&&
        isGoalManagedTask(job.task_id)&&
        recoverableTeamRepair(job.task_id)
      ){
        const recovery=recoverableTeamRepair(job.task_id)!;
        const extended=extendJobForAutonomousRecovery(job.id,1);
        const time=new Date().toISOString();
   
        db.prepare(`
         UPDATE tasks
         SET status='queued',phase='recovering',error=NULL,updated_at=?
         WHERE id=?
        `).run(time,job.task_id);
   
        db.prepare(`
         UPDATE projects
         SET status='active',phase='autonomous_development',updated_at=?
         WHERE id=?
        `).run(time,job.project_id);
   
        event(
         "job.autonomous_recovery_extended",
         `Extended ${job.id} because autonomous team recovery still has repair budget`,
         {
          jobId:job.id,
          taskId:job.task_id,
          projectId:job.project_id,
          phase:"recovering",
          component:"job-runner",
          level:"warn",
          data:{
           recoveryId:recovery.id,
           repairAttempts:recovery.attempts,
           repairMaxAttempts:recovery.maxAttempts,
           attempts:extended?.attempts??currentJob.attempts,
           maxAttempts:extended?.max_attempts??currentJob.max_attempts
          }
         }
        );
   
        currentJob=extended||currentJob;
       }else if(
        classification.kind==="provider_permanent"||
    classification.terminal||
    exhausted
   ){
    const terminalMessage=exhausted
     ?`${message}; maximum execution attempts reached`
     :message;

    failJob(job.id,terminalMessage);


    if(isGoalManagedTask(job.task_id)){
     const time=new Date().toISOString();

     db.prepare(`
      UPDATE tasks
      SET status='failed',phase='failed',error=?,updated_at=?
      WHERE id=?
     `).run(
      terminalMessage,
      time,
      job.task_id
     );

     failGoalTaskExecution(job.task_id,"failed");
     synchronizeTaskDevelopment(job.task_id);

    }else if(current?.status!=="failed"){
     const time=new Date().toISOString();

     db.prepare(`
      UPDATE tasks
      SET status='failed',phase='failed',error=?,updated_at=?
      WHERE id=?
     `).run(
      terminalMessage,
      time,
      job.task_id
     );

     db.prepare(`
      UPDATE projects
      SET status='failed',phase='failed',updated_at=?
      WHERE id=?
     `).run(
      time,
      job.project_id
     );
    }

    event(
     exhausted
      ?"job.attempt_exhausted"
      :"job.terminal_failure",
     terminalMessage,
     {
      jobId:job.id,
      taskId:job.task_id,
      projectId:job.project_id,
      phase:"failed",
      component:"job-runner",
      level:"error",
      data:{
       slot,
       failureKind:classification.kind,
       attempt:currentJob.attempts,
       maxAttempts:currentJob.max_attempts
      }
     }
    );
   }else if(current?.status==="queued"){
    const delay=retryDelay(currentJob.attempts);

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
       failureKind:classification.kind,
       attempt:currentJob.attempts,
       maxAttempts:currentJob.max_attempts
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
     failureKind:classification.kind,
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
     phase:
      classification.kind==="provider_retryable"
       ?"waiting_ai"
       :"failed",
     component:"job-runner",
     level:"error",
     data:{
      slot,
      owner,
      failureKind:classification.kind,
      attempt:currentJob.attempts,
      maxAttempts:currentJob.max_attempts,
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







