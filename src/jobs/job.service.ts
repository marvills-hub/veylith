import {db} from "../database/database.js";
import {now} from "../config/config.js";
import {event} from "../core/telemetry.js";
import {createJob,getTaskJob,pauseJob,resumeJob,requeueJob,cancelJob,setJobPriority,scheduleJob} from "./job.repository.js";
import {requestRunningTaskControl} from "./job-runner.service.js";

export function enqueueTask(taskId:string,availableAt=now()){
 const task=db.prepare("SELECT * FROM tasks WHERE id=?").get(taskId) as any;
 if(!task)throw new Error("Task not found.");
 const job=createJob(task,availableAt);
 event("job.queued",`Queued ${job.id}`,{taskId:task.id,projectId:task.project_id,data:{jobId:job.id,priority:job.priority,availableAt:job.available_at}});
 return job;
}

export function pauseTaskJob(taskId:string,reason:string|null=null){
 const job=getTaskJob(taskId);
 if(!job)return undefined;
 return pauseJob(job.id,reason);
}

export function resumeTaskJob(taskId:string){
 const existing=getTaskJob(taskId);
 if(existing){
  if(existing.status==="queued"||existing.status==="running")return existing;
  const resumed=resumeJob(existing.id);
  if(resumed)return resumed;
 }
 return enqueueTask(taskId);
}

export function scheduleJobRetry(taskId:string,delayMs:number,error:string){
 const job=getTaskJob(taskId);
 if(!job)throw new Error("Job not found.");
 return requeueJob(job.id,delayMs,error);
}

export function cancelTaskJob(taskId:string,reason="Cancelled by user"){
 const task=db.prepare("SELECT * FROM tasks WHERE id=?").get(taskId) as any;
 if(!task)throw new Error("Task not found.");
 if(task.status==="completed")throw new Error("Completed tasks cannot be cancelled.");
 const job=getTaskJob(taskId);
 const time=now();
 db.prepare("UPDATE tasks SET status='cancelled',phase='cancelled',error=?,completed_at=?,updated_at=? WHERE id=?").run(reason,time,time,taskId);
 db.prepare("UPDATE projects SET status='cancelled',phase='cancelled',updated_at=? WHERE id=?").run(time,task.project_id);
 const updatedJob=job?cancelJob(job.id,reason):undefined;
 event("task.cancelled",reason,{taskId,projectId:task.project_id,level:"warn",data:{jobId:updatedJob?.id||null}});
 return{id:taskId,projectId:task.project_id,jobId:updatedJob?.id||null,status:"cancelled"};
}

export function pauseTask(taskId:string,reason="Paused by user"){
 const task=db.prepare("SELECT * FROM tasks WHERE id=?").get(taskId) as any;
 if(!task)throw new Error("Task not found.");
 if(task.status==="completed"||task.status==="failed"||task.status==="cancelled")throw new Error("Terminal tasks cannot be paused.");
 const time=now();
 db.prepare("UPDATE tasks SET status='paused',phase='paused',error=NULL,updated_at=? WHERE id=?").run(time,taskId);
 db.prepare("UPDATE projects SET status='paused',phase='paused',updated_at=? WHERE id=?").run(time,task.project_id);
 const updated=pauseTaskJob(taskId,reason);
 event("task.paused",reason,{taskId,projectId:task.project_id,data:{jobId:updated?.id||null,manual:true}});
 return{id:taskId,projectId:task.project_id,jobId:updated?.id||null,status:"paused"};
}

export function changeTaskPriority(taskId:string,priority:number){
 const task=db.prepare("SELECT * FROM tasks WHERE id=?").get(taskId) as any;
 if(!task)throw new Error("Task not found.");
 const job=getTaskJob(taskId);
 if(!job)throw new Error("Active job not found.");
 const updated=setJobPriority(job.id,priority);
 event("job.priority",`Priority changed to ${updated.priority}`,{taskId,projectId:task.project_id,data:{jobId:job.id,priority:updated.priority}});
 return updated;
}

export function scheduleTask(taskId:string,availableAt:string){
 const task=db.prepare("SELECT * FROM tasks WHERE id=?").get(taskId) as any;
 if(!task)throw new Error("Task not found.");
 const job=getTaskJob(taskId);
 if(!job)throw new Error("Active job not found.");
 const updated=scheduleJob(job.id,availableAt);
 db.prepare("UPDATE tasks SET status='queued',phase='scheduled',updated_at=? WHERE id=?").run(now(),taskId);
 db.prepare("UPDATE projects SET status='queued',phase='scheduled',updated_at=? WHERE id=?").run(now(),task.project_id);
 event("job.scheduled",`Job scheduled for ${updated.available_at}`,{taskId,projectId:task.project_id,data:{jobId:job.id,availableAt:updated.available_at}});
 return updated;
}

