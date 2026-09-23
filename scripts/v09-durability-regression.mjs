import {db} from "../dist/database/database.js";
import {WORKER_ID} from "../dist/config/config.js";
import {
 RUNTIME_ID,
 registerRuntime,
 markRuntimeStopped,
 setRuntimeStatus
} from "../dist/runtime/runtime-instance.service.js";
import {
 recoverJobs,
 releaseRuntimeJobs
} from "../dist/jobs/job-recovery.service.js";

function assert(name,condition,detail=""){
 if(!condition){
  console.error(`FAIL ${name}${detail?` - ${detail}`:""}`);
  process.exitCode=1;
  return;
 }
 console.log(`PASS ${name}`);
}

const suffix=crypto.randomUUID().replaceAll("-","").slice(0,10);
const projectId=`reg_prj_${suffix}`;
const taskId=`reg_tsk_${suffix}`;
const jobId=`reg_job_${suffix}`;
const currentJobId=`reg_current_${suffix}`;
const oldRuntime=`rt_old_${suffix}`;
const oldOwner=`${WORKER_ID}-${oldRuntime}-slot-1`;
const time=new Date().toISOString();

function cleanup(){
 try{db.prepare("DELETE FROM jobs WHERE id IN (?,?)").run(jobId,currentJobId)}catch{}
 try{db.prepare("DELETE FROM tasks WHERE id=?").run(taskId)}catch{}
 try{db.prepare("DELETE FROM projects WHERE id=?").run(projectId)}catch{}
 try{db.prepare("DELETE FROM runtime_instances WHERE id IN (?,?)").run(oldRuntime,RUNTIME_ID)}catch{}
}

try{
 registerRuntime();

 db.prepare(`
  INSERT INTO projects(
   id,name,slug,workspace,status,phase,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?)
 `).run(
  projectId,
  "Recovery Regression",
  `recovery-${suffix}`,
  process.cwd(),
  "active",
  "development",
  time,
  time
 );

 db.prepare(`
  INSERT INTO tasks(
   id,project_id,title,prompt,status,phase,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?)
 `).run(
  taskId,
  projectId,
  "Recovery Regression",
  "Recovery regression",
  "running",
  "development",
  time,
  time
 );

 db.prepare(`
  INSERT INTO jobs(
   id,type,task_id,project_id,status,priority,attempts,max_attempts,
   available_at,claimed_by,claimed_at,lease_expires_at,heartbeat_at,
   last_error,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  jobId,
  "task",
  taskId,
  projectId,
  "running",
  0,
  1,
  3,
  time,
  oldOwner,
  time,
  new Date(Date.now()+60000).toISOString(),
  time,
  null,
  time,
  time
 );

 db.prepare(`
  INSERT INTO runtime_instances(
   id,worker_id,hostname,pid,status,started_at,heartbeat_at,
   stopped_at,stop_reason
  ) VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  oldRuntime,
  WORKER_ID,
  "regression",
  999999,
  "online",
  new Date(Date.now()-60000).toISOString(),
  new Date(Date.now()-60000).toISOString(),
  null,
  null
 );

 const before=db.prepare(
  "SELECT * FROM jobs WHERE id=?"
 ).get(jobId);

 assert(
  "simulated interrupted job is running",
  before?.status==="running"
 );

 const recovery=recoverJobs();

 const recovered=db.prepare(
  "SELECT * FROM jobs WHERE id=?"
 ).get(jobId);

 const recoveredTask=db.prepare(
  "SELECT * FROM tasks WHERE id=?"
 ).get(taskId);

 const oldRuntimeState=db.prepare(
  "SELECT * FROM runtime_instances WHERE id=?"
 ).get(oldRuntime);

 assert(
  "interrupted runtime detected",
  ["crashed","stale"].includes(oldRuntimeState?.status)
 );

 assert(
  "interrupted job reclaimed",
  recovered?.status==="queued"
 );

 assert(
  "recovered job ownership cleared",
  recovered?.claimed_by===null
 );

 assert(
  "recovered job lease cleared",
  recovered?.lease_expires_at===null
 );

 assert(
  "recovered task enters resuming phase",
  recoveredTask?.status==="queued"&&
  recoveredTask?.phase==="resuming"
 );

 assert(
  "recovery reports reclaimed work",
  recovery.local>=1
 );

 db.prepare(`
  UPDATE tasks
  SET status='running',phase='validation',updated_at=?
  WHERE id=?
 `).run(time,taskId);

 db.prepare(`
  UPDATE projects
  SET status='active',phase='validation',updated_at=?
  WHERE id=?
 `).run(time,projectId);

 db.prepare(`
  INSERT INTO jobs(
   id,type,task_id,project_id,status,priority,attempts,max_attempts,
   available_at,claimed_by,claimed_at,lease_expires_at,heartbeat_at,
   last_error,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  currentJobId,
  "task",
  taskId,
  projectId,
  "running",
  0,
  1,
  3,
  time,
  `${WORKER_ID}-${RUNTIME_ID}-slot-1`,
  time,
  new Date(Date.now()+60000).toISOString(),
  time,
  null,
  time,
  time
 );

 const released=releaseRuntimeJobs(
  RUNTIME_ID,
  "Regression graceful shutdown"
 );

 const graceful=db.prepare(
  "SELECT * FROM jobs WHERE id=?"
 ).get(currentJobId);

 const gracefulTask=db.prepare(
  "SELECT * FROM tasks WHERE id=?"
 ).get(taskId);

 assert(
  "graceful shutdown releases owned job",
  released>=1&&graceful?.status==="queued"
 );

 assert(
  "graceful shutdown clears ownership",
  graceful?.claimed_by===null
 );

 assert(
  "graceful shutdown clears lease",
  graceful?.lease_expires_at===null
 );

 assert(
  "graceful shutdown preserves resumability",
  gracefulTask?.status==="queued"&&
  gracefulTask?.phase==="resuming"
 );

 setRuntimeStatus("online");
 markRuntimeStopped("Regression complete");

 const runtime=db.prepare(
  "SELECT * FROM runtime_instances WHERE id=?"
 ).get(RUNTIME_ID);

 assert(
  "runtime records clean stop",
  runtime?.status==="stopped"&&
  runtime?.stopped_at!==null
 );

 if(!process.exitCode){
  console.log("");
  console.log("VEYLITH v0.9 BATCH 1 DURABILITY TEST PASSED");
 }
}catch(error){
 console.error(error);
 process.exitCode=1;
}finally{
 cleanup();
 try{db.close()}catch{}
}


