import fs from "node:fs";

const dbPath=`data/v10-terminal-role-startup-recovery-${process.pid}-${Date.now()}.db`;

for(const suffix of ["","-wal","-shm"]){
 try{fs.rmSync(`${dbPath}${suffix}`,{force:true});}catch{}
}

process.env.DB_PATH=dbPath;
process.env.AI_PROVIDER="none";

const {db}=await import("../src/database/database.js");
const {
 recoverExhaustedTerminalRoles
}=await import("../src/orchestration/v1/recovery/terminal-role-recovery.service.js");

const suffix=`${process.pid}_${Date.now().toString(36)}`;
const projectId=`prj_startup_recovery_${suffix}`;
const goalId=`gol_startup_recovery_${suffix}`;
const workId=`wrk_startup_recovery_${suffix}`;
const taskId=`tsk_startup_recovery_${suffix}`;
const jobId=`job_startup_recovery_${suffix}`;
const assignmentId=`asg_startup_recovery_${suffix}`;
const roleResultId=`grr_startup_recovery_${suffix}`;
const lifecycleId=`alc_startup_recovery_${suffix}`;
const time=new Date().toISOString();

let passed=0;
let failed=0;

function check(name:string,condition:boolean,detail=""){
 if(condition){
  passed++;
  console.log(`PASS ${name}`);
 }else{
  failed++;
  console.log(`FAIL ${name}${detail?`: ${detail}`:""}`);
 }
}

try{
 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,progress,workspace,created_at,updated_at,phase
  )VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,
  "Startup Terminal Recovery",
  `startup-terminal-recovery-${suffix}`,
  "failed",
  80,
  `workspaces/startup-terminal-recovery-${suffix}`,
  time,
  time,
  "failed"
 );

 db.prepare(`
  INSERT INTO project_goals(
   id,project_id,title,objective,status,
   requirements_json,acceptance_criteria_json,constraints_json,
   created_at,updated_at,activated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  goalId,
  projectId,
  "Startup recovery",
  "Automatically recover an exhausted final reviewer.",
  "active",
  "[]",
  "[]",
  "[]",
  time,
  time,
  time
 );

 db.prepare(`
  INSERT INTO goal_work_items(
   id,goal_id,project_id,work_key,title,description,kind,status,
   priority,dependencies_json,requirement_ids_json,acceptance_ids_json,
   created_at,updated_at,started_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  workId,
  goalId,
  projectId,
  "v1-final-review",
  "Final Autonomous Review",
  "Review completed implementation.",
  "review",
  "failed",
  100,
  "[]",
  "[]",
  "[]",
  time,
  time,
  time
 );

 db.prepare(`
  INSERT INTO tasks(
   id,project_id,title,prompt,status,phase,priority,
   created_at,updated_at,max_attempts,error
  )VALUES(?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  taskId,
  projectId,
  "Final Autonomous Review",
  "Review project.",
  "failed",
  "failed",
  100,
  time,
  time,
  3,
  "old engine defect"
 );

 db.prepare(`
  INSERT INTO jobs(
   id,type,task_id,project_id,status,priority,
   attempts,max_attempts,available_at,last_error,
   created_at,updated_at,completed_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  jobId,
  "task",
  taskId,
  projectId,
  "failed",
  100,
  3,
  3,
  time,
  "old engine defect",
  time,
  time,
  time
 );

 db.prepare(`
  INSERT INTO goal_work_dispatches(
   work_item_id,goal_id,project_id,task_id,job_id,
   status,created_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?)
 `).run(
  workId,
  goalId,
  projectId,
  taskId,
  jobId,
  "failed",
  time,
  time
 );

 db.prepare(`
  INSERT INTO goal_role_results(
   id,goal_id,project_id,work_item_id,assignment_id,task_id,
   role,status,error,started_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  roleResultId,
  goalId,
  projectId,
  workId,
  assignmentId,
  taskId,
  "reviewer",
  "failed",
  "old engine defect",
  time,
  time
 );

 db.prepare(`
  INSERT INTO autonomous_lifecycle_checkpoints(
   id,project_id,goal_id,stage,status,task_id,work_item_id,
   error,metadata_json,created_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  lifecycleId,
  projectId,
  goalId,
  "development",
  "failed",
  taskId,
  workId,
  "old engine defect",
  "{}",
  time,
  time
 );

 const first=recoverExhaustedTerminalRoles();

 const ourResult=first.results.find(
  (result:any)=>result.taskId===taskId
 );

 check(
  "fixture reviewer discovered",
  Boolean(ourResult),
  JSON.stringify(first.results)
 );

 check(
  "fixture reviewer recovered",
  ourResult?.recovered===true,
  JSON.stringify(ourResult)
 );

 const job=db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId) as any;
 const task=db.prepare("SELECT * FROM tasks WHERE id=?").get(taskId) as any;
 const work=db.prepare("SELECT * FROM goal_work_items WHERE id=?").get(workId) as any;
 const dispatch=db.prepare(
  "SELECT * FROM goal_work_dispatches WHERE work_item_id=?"
 ).get(workId) as any;
 const role=db.prepare(
  "SELECT * FROM goal_role_results WHERE id=?"
 ).get(roleResultId) as any;
 const lifecycle=db.prepare(
  "SELECT * FROM autonomous_lifecycle_checkpoints WHERE goal_id=?"
 ).get(goalId) as any;

 check("job queued automatically",job.status==="queued",job.status);
 check("historical attempts preserved",Number(job.attempts)===3,String(job.attempts));
 check("exactly one new attempt granted",Number(job.max_attempts)===4,String(job.max_attempts));
 check("old job error cleared",job.last_error===null,String(job.last_error));
 check("job completion cleared",job.completed_at===null,String(job.completed_at));

 check("task reopened",task.status==="queued",task.status);
 check("task phase reopened",task.phase==="queued",task.phase);
 check("task error cleared",task.error===null,String(task.error));

 check("work reopened",work.status==="running",work.status);
 check("dispatch reopened",dispatch.status==="queued",dispatch.status);

 check("role result reopened",role.status==="running",role.status);
 check("role error cleared",role.error===null,String(role.error));
 check("role payload cleared",role.result_json===null,String(role.result_json));

 check("lifecycle reopened",lifecycle.status==="running",lifecycle.status);
 check("lifecycle error cleared",lifecycle.error===null,String(lifecycle.error));

 const second=recoverExhaustedTerminalRoles();

 const secondOurResult=second.results.find(
  (result:any)=>result.taskId===taskId
 );

 check("fixture absent from second discovery",!secondOurResult);

 const finalJob=db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId) as any;
 check(
  "second pass grants no fifth attempt",
  Number(finalJob.max_attempts)===4,
  String(finalJob.max_attempts)
 );

 console.log(`TERMINAL ROLE STARTUP RECOVERY: ${passed}/${passed+failed}`);

 if(failed)process.exitCode=1;
}finally{
 try{db.close()}catch{}

 for(const suffix of ["","-wal","-shm"]){
  try{fs.rmSync(`${dbPath}${suffix}`,{force:true});}catch{}
 }
}
