process.env.DATABASE_PATH=`data/v10-terminal-role-engine-recovery-${Date.now()}.db`;
process.env.AI_PROVIDER="none";

const {db}=await import("../src/database/database.js");
await import("../src/goals/goal.repository.js");
await import("../src/goals/goal-task-graph.repository.js");
await import("../src/goals/goal-work-dispatch.repository.js");
await import("../src/orchestration/v1/lifecycle/lifecycle.repository.js");
await import("../src/team/goal-role-executor.service.js");
const {
 recoverExhaustedTerminalRole
}=await import("../src/orchestration/v1/recovery/terminal-role-recovery.service.js");

const suffix=Date.now().toString(36);
const projectId=`prj_terminal_recovery_${suffix}`;
const goalId=`gol_terminal_recovery_${suffix}`;
const workId=`wrk_terminal_recovery_${suffix}`;
const taskId=`tsk_terminal_recovery_${suffix}`;
const jobId=`job_terminal_recovery_${suffix}`;
const assignmentId=`asg_terminal_recovery_${suffix}`;
const roleResultId=`grr_terminal_recovery_${suffix}`;
const lifecycleId=`alc_terminal_recovery_${suffix}`;
const time=new Date().toISOString();

let passed=0;
let failed=0;

function check(name,condition,detail=""){
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
  "Terminal Role Recovery",
  `terminal-role-recovery-${suffix}`,
  "failed",
  80,
  `workspaces/terminal-role-recovery-${suffix}`,
  time,
  time,
  "failed"
 );

 db.prepare(`
  INSERT INTO project_goals(
   id,project_id,title,objective,status,requirements_json,
   acceptance_criteria_json,constraints_json,
   created_at,updated_at,activated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  goalId,
  projectId,
  "Terminal recovery",
  "Recover an exhausted reviewer.",
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
   id,project_id,title,prompt,status,phase,priority,created_at,updated_at,
   max_attempts,error
  )VALUES(?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  taskId,
  projectId,
  "Final Autonomous Review",
  "Review the project.",
  "failed",
  "failed",
  100,
  time,
  time,
  3,
  "old review failure"
 );

 db.prepare(`
  INSERT INTO jobs(
   id,type,task_id,project_id,status,priority,attempts,max_attempts,
   available_at,last_error,created_at,updated_at,completed_at
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
  "old review failure",
  time,
  time,
  time
 );

 db.prepare(`
  INSERT INTO goal_work_dispatches(
   work_item_id,goal_id,project_id,task_id,job_id,status,created_at,updated_at
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

 const assignmentTable=db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type='table' AND name='agent_assignments'
 `).get();

 if(assignmentTable){
  db.prepare(`
   INSERT INTO agent_assignments(
    id,goal_id,project_id,work_item_id,role,status,
    created_at,updated_at
   )VALUES(?,?,?,?,?,?,?,?)
  `).run(
   assignmentId,
   goalId,
   projectId,
   workId,
   "reviewer",
   "failed",
   time,
   time
  );
 }

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
  "old deterministic evidence failure",
  time,
  time
 );

 db.prepare(`
  INSERT INTO autonomous_lifecycle_checkpoints(
   id,project_id,goal_id,stage,status,task_id,work_item_id,error,
   metadata_json,created_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  lifecycleId,
  projectId,
  goalId,
  "development",
  "failed",
  taskId,
  workId,
  "old deterministic evidence failure",
  "{}",
  time,
  time
 );

 const result=recoverExhaustedTerminalRole(taskId);

 check("recovery accepted exhausted reviewer",result.recovered);
 check("recovery reports recovered",result.reason==="recovered");
 check("same job retained",result.jobId===jobId);

 const job=db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId);
 const task=db.prepare("SELECT * FROM tasks WHERE id=?").get(taskId);
 const work=db.prepare("SELECT * FROM goal_work_items WHERE id=?").get(workId);
 const dispatch=db.prepare(
  "SELECT * FROM goal_work_dispatches WHERE work_item_id=?"
 ).get(workId);
 const role=db.prepare(
  "SELECT * FROM goal_role_results WHERE id=?"
 ).get(roleResultId);
 const lifecycle=db.prepare(
  "SELECT * FROM autonomous_lifecycle_checkpoints WHERE goal_id=?"
 ).get(goalId);
 const project=db.prepare("SELECT * FROM projects WHERE id=?").get(projectId);

 check("job queued",job.status==="queued",job.status);
 check("job keeps historical attempts",Number(job.attempts)===3,String(job.attempts));
 check("job receives exactly one new attempt",Number(job.max_attempts)===4,String(job.max_attempts));
 check("job old error cleared",job.last_error===null,String(job.last_error));
 check("job completion cleared",job.completed_at===null,String(job.completed_at));

 check("task queued",task.status==="queued",task.status);
 check("task phase queued",task.phase==="queued",task.phase);
 check("task error cleared",task.error===null,String(task.error));

 check("work reopened",work.status==="running",work.status);
 check("dispatch reopened",dispatch.status==="queued",dispatch.status);

 check("role result reopened",role.status==="running",role.status);
 check("role result error cleared",role.error===null,String(role.error));
 check("role result result cleared",role.result_json===null,String(role.result_json));

 check("lifecycle running",lifecycle.status==="running",lifecycle.status);
 check("lifecycle error cleared",lifecycle.error===null,String(lifecycle.error));

 check("project active",project.status==="active",project.status);
 check("project phase reopened",project.phase==="autonomous_development",project.phase);

 const second=recoverExhaustedTerminalRole(taskId);
 check("second recovery is idempotently rejected",!second.recovered);
 check("second recovery sees non-exhausted job",second.reason==="job-not-exhausted",second.reason);

 const finalJob=db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId);
 check("second recovery does not add another attempt",Number(finalJob.max_attempts)===4,String(finalJob.max_attempts));

 console.log(`TERMINAL ROLE ENGINE RECOVERY: ${passed}/${passed+failed}`);
 if(failed)process.exitCode=1;
}finally{
 try{db.close()}catch{}
}



