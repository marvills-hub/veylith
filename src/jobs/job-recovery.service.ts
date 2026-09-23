import {db} from "../database/database.js";
import {now} from "../config/config.js";
import {event} from "../core/telemetry.js";
import {recoverExpiredJobs} from "./job.repository.js";
import {enqueueTask} from "./job.service.js";
import {clearStaleRuntimeSlots} from "../workers/worker-slot.repository.js";
import {
 RUNTIME_ID,
 detectStaleRuntimes,
 runtimeOwnerToken
} from "../runtime/runtime-instance.service.js";

function runtimeJobs(runtimeId:string){
 return db.prepare(`
  SELECT * FROM jobs
  WHERE status='running'
  AND instr(claimed_by,?)>0
 `).all(runtimeOwnerToken(runtimeId)) as any[];
}

function recoverRuntimeJobs(runtimeId:string,reason:string){
 const time=now();
 const jobs=runtimeJobs(runtimeId);
 for(const job of jobs){
  if(job.attempts>=job.max_attempts){
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
   `).run(`${reason}; maximum attempts reached`,time,time,job.id);
   db.prepare(`
    UPDATE tasks
    SET status='failed',phase='failed',error=?,updated_at=?
    WHERE id=?
   `).run(`${reason}; maximum attempts reached`,time,job.task_id);
   db.prepare(`
    UPDATE projects
    SET status='failed',phase='failed',updated_at=?
    WHERE id=?
   `).run(time,job.project_id);
  }else{
   db.prepare(`
    UPDATE jobs
    SET status='queued',
        available_at=?,
        claimed_by=NULL,
        claimed_at=NULL,
        lease_expires_at=NULL,
        heartbeat_at=NULL,
        last_error=?,
        updated_at=?
    WHERE id=? AND status='running'
   `).run(time,reason,time,job.id);
   db.prepare(`
    UPDATE tasks
    SET status='queued',phase='resuming',error=NULL,updated_at=?
    WHERE id=? AND status='running'
   `).run(time,job.task_id);
   db.prepare(`
    UPDATE projects
    SET status='queued',phase='resuming',updated_at=?
    WHERE id=? AND status='active'
   `).run(time,job.project_id);
  }
  event("job.recovered",reason,{
   taskId:job.task_id,
   projectId:job.project_id,
   level:"warn",
   data:{
    jobId:job.id,
    previousWorker:job.claimed_by,
    runtimeId
   }
  });
 }
 return jobs.length;
}

export function recoverJobs(){
 const stale=detectStaleRuntimes();
 const runtimeIds=new Set(stale.map(item=>item.id));
 const staleSlotsRemoved=clearStaleRuntimeSlots([...runtimeIds]);
 let runtimeRecovered=0;

 for(const runtimeId of runtimeIds){
  runtimeRecovered+=recoverRuntimeJobs(
   runtimeId,
   "Recovered after interrupted Veylith runtime"
  );
 }

 const time=now();
 const legacyRunning=db.prepare(`
  SELECT * FROM jobs
  WHERE status='running'
  AND claimed_by IS NOT NULL
  AND instr(claimed_by,'-rt_')=0
  AND (
   lease_expires_at IS NULL
   OR lease_expires_at<=?
  )
 `).all(time) as any[];

 for(const job of legacyRunning){
  db.prepare(`
   UPDATE jobs
   SET status='queued',
       available_at=?,
       claimed_by=NULL,
       claimed_at=NULL,
       lease_expires_at=NULL,
       heartbeat_at=NULL,
       last_error='Recovered expired legacy pre-v0.9 running job',
       updated_at=?
   WHERE id=? AND status='running'
  `).run(time,time,job.id);
  db.prepare(`
   UPDATE tasks
   SET status='queued',phase='resuming',error=NULL,updated_at=?
   WHERE id=? AND status='running'
  `).run(time,job.task_id);
  db.prepare(`
   UPDATE projects
   SET status='queued',phase='resuming',updated_at=?
   WHERE id=? AND status='active'
  `).run(time,job.project_id);
  event("job.recovered","Expired legacy running job recovered during v0.9 startup",{
   taskId:job.task_id,
   projectId:job.project_id,
   level:"warn",
   data:{jobId:job.id,previousWorker:job.claimed_by}
  });
 }

 const expired=recoverExpiredJobs();
 for(const job of expired){
  event("job.recovered","Expired job lease recovered",{
   taskId:job.task_id,
   projectId:job.project_id,
   level:"warn",
   data:{jobId:job.id,previousWorker:job.claimed_by}
  });
 }

 const orphaned=db.prepare(`
  SELECT t.*
  FROM tasks t
  LEFT JOIN jobs j
   ON j.task_id=t.id
   AND j.status IN ('queued','running','paused','retry_wait')
  WHERE t.status='queued'
  AND j.id IS NULL
  ORDER BY t.priority DESC,t.created_at ASC
 `).all() as any[];

 for(const task of orphaned){
  const job=enqueueTask(task.id);
  event("job.reconciled","Queued task had no active job; persistent job created",{
   taskId:task.id,
   projectId:task.project_id,
   level:"warn",
   data:{jobId:job.id}
  });
 }

 event("recovery.completed","Startup recovery completed",{
  data:{
   runtimeId:RUNTIME_ID,
   staleRuntimes:runtimeIds.size,
   staleSlotsRemoved,
   runtimeRecovered,
   legacyRecovered:legacyRunning.length,
   expired:expired.length,
   reconciled:orphaned.length
  }
 });

 return{
  local:runtimeRecovered+legacyRunning.length,
  runtime:runtimeRecovered,
  legacy:legacyRunning.length,
  expired:expired.length,
  reconciled:orphaned.length,
  staleRuntimes:runtimeIds.size
 };
}

export function releaseRuntimeJobs(runtimeId=RUNTIME_ID,reason="Graceful Veylith shutdown"){
 const time=now();
 const jobs=runtimeJobs(runtimeId);
 for(const job of jobs){
  db.prepare(`
   UPDATE jobs
   SET status='queued',
       available_at=?,
       claimed_by=NULL,
       claimed_at=NULL,
       lease_expires_at=NULL,
       heartbeat_at=NULL,
       last_error=?,
       updated_at=?
   WHERE id=? AND status='running'
  `).run(time,reason,time,job.id);
  db.prepare(`
   UPDATE tasks
   SET status='queued',phase='resuming',error=NULL,updated_at=?
   WHERE id=? AND status='running'
  `).run(time,job.task_id);
  db.prepare(`
   UPDATE projects
   SET status='queued',phase='resuming',updated_at=?
   WHERE id=? AND status='active'
  `).run(time,job.project_id);
 }
 if(jobs.length){
  event("runtime.jobs_released",`${jobs.length} running job${jobs.length===1?"":"s"} released for restart`,{
   level:"warn",
   data:{runtimeId,count:jobs.length,reason}
  });
 }
 return jobs.length;
}


