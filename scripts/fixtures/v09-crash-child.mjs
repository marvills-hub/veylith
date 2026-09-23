import {db} from "../../dist/database/database.js";
import {WORKER_ID,now} from "../../dist/config/config.js";
import {
 RUNTIME_ID,
 registerRuntime,
 setRuntimeStatus,
 startRuntimeHeartbeat
} from "../../dist/runtime/runtime-instance.service.js";
import {runtimeOwner} from "../../dist/runtime/runtime-instance.service.js";
import {registerSlot,setSlot} from "../../dist/workers/worker-slot.repository.js";

const suffix=process.env.VEYLITH_CRASH_FIXTURE;
if(!suffix)throw new Error("VEYLITH_CRASH_FIXTURE is required");

const projectId=`crash_prj_${suffix}`;
const taskId=`crash_tsk_${suffix}`;
const jobId=`crash_job_${suffix}`;
const time=now();

registerRuntime();
setRuntimeStatus("online");
startRuntimeHeartbeat(250);
registerSlot(1);

db.prepare(`
 INSERT INTO projects(
  id,name,slug,status,phase,progress,workspace,created_at,updated_at
 ) VALUES(?,?,?,?,?,?,?,?,?)
`).run(
 projectId,
 "Crash Recovery Fixture",
 `crash-recovery-${suffix}`,
 "active",
 "development",
 40,
 process.cwd(),
 time,
 time
);

db.prepare(`
 INSERT INTO tasks(
  id,project_id,title,prompt,status,phase,
  priority,attempts,repair_attempts,max_attempts,
  created_at,updated_at
 ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
`).run(
 taskId,
 projectId,
 "Crash Recovery Fixture",
 "Crash recovery fixture",
 "running",
 "development",
 0,
 1,
 0,
 3,
 time,
 time
);

db.prepare(`
 INSERT INTO jobs(
  id,type,task_id,project_id,status,priority,
  attempts,max_attempts,available_at,
  claimed_by,claimed_at,lease_expires_at,heartbeat_at,
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
 runtimeOwner(1),
 time,
 new Date(Date.now()+120000).toISOString(),
 time,
 null,
 time,
 time
);

setSlot(1,"busy","executing",jobId,taskId,projectId);

console.log(JSON.stringify({
 ready:true,
 pid:process.pid,
 runtimeId:RUNTIME_ID,
 workerId:WORKER_ID,
 projectId,
 taskId,
 jobId
}));

setInterval(()=>{},1000);
