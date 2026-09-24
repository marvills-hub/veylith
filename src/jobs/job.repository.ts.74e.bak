import {db} from "../database/database.js";
import {JOB_LEASE_MS,now} from "../config/config.js";
import type {JobRecord,QueueStats} from "./job.types.js";

const makeJobId=()=>`job_${crypto.randomUUID().replace(/-/g,"").slice(0,16)}`;

function job(id:string){
 return db.prepare("SELECT * FROM jobs WHERE id=?").get(id) as unknown as JobRecord|undefined;
}

export function getJob(id:string){return job(id)}

export function getTaskJob(taskId:string){
 return db.prepare("SELECT * FROM jobs WHERE task_id=? ORDER BY created_at DESC LIMIT 1").get(taskId) as unknown as JobRecord|undefined;
}

export function createJob(task:any,availableAt=now()){
 const existing=db.prepare("SELECT * FROM jobs WHERE task_id=? AND status IN ('queued','running','paused','retry_wait') ORDER BY created_at DESC LIMIT 1").get(task.id) as unknown as JobRecord|undefined;
 if(existing)return existing;
 const id=makeJobId(),time=now();
 db.prepare(`INSERT INTO jobs(id,type,task_id,project_id,status,priority,attempts,max_attempts,available_at,created_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id,"task",task.id,task.project_id,"queued",task.priority||0,0,task.max_attempts||3,availableAt,time,time);
 return job(id)!;
}

export function claimNextJob(workerId:string){
 const time=now(),lease=new Date(Date.now()+JOB_LEASE_MS).toISOString();
 db.exec("BEGIN IMMEDIATE");
 try{
  const candidate=db.prepare(`
   SELECT * FROM jobs
   WHERE status IN ('queued','retry_wait')
   AND available_at<=?
   AND attempts<max_attempts
   ORDER BY priority DESC,available_at ASC,created_at ASC
   LIMIT 1
  `).get(time) as any;
  if(!candidate){
   db.exec("COMMIT");
   return undefined;
  }
  const result=db.prepare(`
   UPDATE jobs SET status='running',claimed_by=?,claimed_at=?,lease_expires_at=?,heartbeat_at=?,updated_at=?
   WHERE id=? AND status IN ('queued','retry_wait') AND available_at<=?
  `).run(workerId,time,lease,time,time,candidate.id,time);
  if(Number(result.changes)!==1){
   db.exec("ROLLBACK");
   return undefined;
  }
  const claimed=job(candidate.id);
  db.exec("COMMIT");
  return claimed;
 }catch(error){
  try{db.exec("ROLLBACK")}catch{}
  throw error;
 }
}


export function consumeJobAttempt(jobId:string,workerId:string){
 const time=now();
 const result=db.prepare(`
  UPDATE jobs
  SET attempts=attempts+1,updated_at=?
  WHERE id=? AND status='running' AND claimed_by=? AND attempts<max_attempts
 `).run(time,jobId,workerId);
 return Number(result.changes)===1?getJob(jobId):null;
}
export function heartbeatJob(jobId:string,workerId:string){
 const lease=new Date(Date.now()+JOB_LEASE_MS).toISOString(),time=now();
 const result=db.prepare("UPDATE jobs SET heartbeat_at=?,lease_expires_at=?,updated_at=? WHERE id=? AND status='running' AND claimed_by=?").run(time,lease,time,jobId,workerId);
 return Number(result.changes)===1;
}

export function completeJob(jobId:string,workerId:string){
 const time=now();
 const result=db.prepare(`UPDATE jobs SET status='completed',claimed_by=NULL,claimed_at=NULL,lease_expires_at=NULL,heartbeat_at=NULL,last_error=NULL,completed_at=?,updated_at=? WHERE id=? AND status='running' AND claimed_by=?`).run(time,time,jobId,workerId);
 if(Number(result.changes)!==1)throw new Error(`Job ${jobId} is no longer owned by ${workerId}.`);
 return job(jobId)!;
}

export function pauseJob(jobId:string,reason:string|null=null){
 const time=now();
 db.prepare(`UPDATE jobs SET status='paused',claimed_by=NULL,claimed_at=NULL,lease_expires_at=NULL,heartbeat_at=NULL,last_error=?,updated_at=? WHERE id=? AND status NOT IN ('completed','failed','cancelled')`).run(reason,time,jobId);
 return job(jobId);
}

export function resumeJob(jobId:string,availableAt=now()){
 const time=now();
 db.prepare(`UPDATE jobs SET status='queued',available_at=?,claimed_by=NULL,claimed_at=NULL,lease_expires_at=NULL,heartbeat_at=NULL,last_error=NULL,completed_at=NULL,updated_at=? WHERE id=? AND status IN ('paused','failed','cancelled','retry_wait')`).run(availableAt,time,jobId);
 return job(jobId);
}

export function requeueJob(jobId:string,delayMs:number,error:string|null=null){
 const availableAt=new Date(Date.now()+Math.max(0,delayMs)).toISOString(),time=now();
 const current=job(jobId);
 if(!current)return undefined;
 if(current.attempts>=current.max_attempts)return failJob(jobId,error||"Maximum job attempts reached.");
 db.prepare(`UPDATE jobs SET status='retry_wait',available_at=?,claimed_by=NULL,claimed_at=NULL,lease_expires_at=NULL,heartbeat_at=NULL,last_error=?,updated_at=? WHERE id=? AND status NOT IN ('completed','cancelled')`).run(availableAt,error,time,jobId);
 return job(jobId);
}

export function failJob(jobId:string,error:string){
 const time=now();
 db.prepare(`UPDATE jobs SET status='failed',claimed_by=NULL,claimed_at=NULL,lease_expires_at=NULL,heartbeat_at=NULL,last_error=?,completed_at=?,updated_at=? WHERE id=? AND status NOT IN ('completed','cancelled')`).run(error,time,time,jobId);
 return job(jobId);
}

export function cancelJob(jobId:string,reason="Cancelled by user"){
 const current=job(jobId);
 if(!current)throw new Error("Job not found.");
 if(current.status==="completed")throw new Error("Completed jobs cannot be cancelled.");
 if(current.status==="failed")throw new Error("Failed jobs cannot be cancelled.");
 const time=now();
 db.prepare(`UPDATE jobs SET status='cancelled',claimed_by=NULL,claimed_at=NULL,lease_expires_at=NULL,heartbeat_at=NULL,last_error=?,completed_at=?,updated_at=? WHERE id=?`).run(reason,time,time,jobId);
 return job(jobId)!;
}

export function setJobPriority(jobId:string,priority:number){
 const value=Math.max(-1000,Math.min(1000,Math.trunc(priority)));
 const current=job(jobId);
 if(!current)throw new Error("Job not found.");
 if(["completed","failed","cancelled"].includes(current.status))throw new Error("Terminal jobs cannot change priority.");
 db.prepare("UPDATE jobs SET priority=?,updated_at=? WHERE id=?").run(value,now(),jobId);
 db.prepare("UPDATE tasks SET priority=?,updated_at=? WHERE id=?").run(value,now(),current.task_id);
 return job(jobId)!;
}

export function scheduleJob(jobId:string,availableAt:string){
 const date=new Date(availableAt);
 if(Number.isNaN(date.getTime()))throw new Error("Invalid schedule date.");
 const current=job(jobId);
 if(!current)throw new Error("Job not found.");
 if(current.status==="running")throw new Error("Running jobs cannot be rescheduled.");
 if(["completed","failed","cancelled"].includes(current.status))throw new Error("Terminal jobs cannot be rescheduled.");
 const value=date.toISOString(),time=now();
 db.prepare("UPDATE jobs SET status='queued',available_at=?,updated_at=? WHERE id=?").run(value,time,jobId);
 return job(jobId)!;
}

export function recoverExpiredJobs(){
 const time=now();
 const expired=db.prepare("SELECT * FROM jobs WHERE status='running' AND lease_expires_at IS NOT NULL AND lease_expires_at<=?").all(time) as unknown as JobRecord[];
 for(const item of expired){
  if(item.attempts>=item.max_attempts){
   const reason="Recovered expired worker lease after recorded failure exhausted maximum attempts";
   db.prepare(`
    UPDATE jobs
    SET status='failed',
        claimed_by=NULL,
        claimed_at=NULL,
        lease_expires_at=NULL,
        heartbeat_at=NULL,
        last_error=?,
        completed_at=?,
        updated_at=?
    WHERE id=? AND status='running'
   `).run(reason,time,time,item.id);
   db.prepare(`
    UPDATE tasks
    SET status='failed',phase='failed',error=?,updated_at=?
    WHERE id=?
   `).run(reason,time,item.task_id);
   db.prepare(`
    UPDATE projects
    SET status='failed',phase='failed',updated_at=?
    WHERE id=?
   `).run(time,item.project_id);
  }else{
   db.prepare(`
    UPDATE jobs
    SET status='queued',
        available_at=?,
        claimed_by=NULL,
        claimed_at=NULL,
        lease_expires_at=NULL,
        heartbeat_at=NULL,
        last_error='Recovered expired worker lease',
        updated_at=?
    WHERE id=? AND status='running'
   `).run(time,time,item.id);
   db.prepare(`
    UPDATE tasks
    SET status='queued',phase='resuming',error=NULL,updated_at=?
    WHERE id=? AND status='running'
   `).run(time,item.task_id);
   db.prepare(`
    UPDATE projects
    SET status='queued',phase='resuming',updated_at=?
    WHERE id=? AND status='active'
   `).run(time,item.project_id);
  }
 }
 return expired;
}
export function queueStats(){
 const time=now();
 return db.prepare(`
  SELECT
   COUNT(*) total,
   COALESCE(SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END),0) queued,
   COALESCE(SUM(CASE WHEN status='running' THEN 1 ELSE 0 END),0) running,
   COALESCE(SUM(CASE WHEN status='paused' THEN 1 ELSE 0 END),0) paused,
   COALESCE(SUM(CASE WHEN status='retry_wait' THEN 1 ELSE 0 END),0) retry_wait,
   COALESCE(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END),0) completed,
   COALESCE(SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END),0) failed,
   COALESCE(SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END),0) cancelled,
   COALESCE(SUM(CASE WHEN status='queued' AND available_at>? THEN 1 ELSE 0 END),0) scheduled
  FROM jobs
 `).get(time) as unknown as QueueStats;
}

export function listJobs(limit=200){
 return db.prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?").all(limit) as unknown as JobRecord[];
}






