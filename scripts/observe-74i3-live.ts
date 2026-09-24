import {db} from "../src/database/database.js";

const projectId="prj_59e5737b2866ea25";
const goalId="gol_c258fc809510a809";
const taskId="tsk_067b81f72558ef83";
const recoveryId="rcv_4b781ea4a12d7e3c";
const jobId="job_ef6fd5f994644d1e";

const one=(sql:string,...args:any[])=>db.prepare(sql).get(...args) as any;
const all=(sql:string,...args:any[])=>db.prepare(sql).all(...args) as any[];

console.log("\n=== RECOVERY ===");
console.log(JSON.stringify(
 one(`
  SELECT id,status,attempts,max_attempts,fingerprint,
         diagnostic_json,validation_json,error,
         updated_at,completed_at
  FROM team_recoveries
  WHERE id=?
 `,recoveryId),
 null,2
));

console.log("\n=== TESTER TASK ===");
console.log(JSON.stringify(
 one(`
  SELECT id,status,phase,attempts,max_attempts,
         repair_attempts,result,error,
         updated_at,completed_at
  FROM tasks
  WHERE id=?
 `,taskId),
 null,2
));

console.log("\n=== OUTER JOB ===");
console.log(JSON.stringify(
 one(`
  SELECT id,status,attempts,max_attempts,
         claimed_by,claimed_at,lease_expires_at,
         heartbeat_at,last_error,updated_at,completed_at
  FROM jobs
  WHERE id=?
 `,jobId),
 null,2
));

console.log("\n=== GOAL WORK COUNTS ===");
console.log(JSON.stringify(
 all(`
  SELECT status,COUNT(*) AS count
  FROM goal_work_items
  WHERE goal_id=?
  GROUP BY status
  ORDER BY status
 `,goalId),
 null,2
));

console.log("\n=== GOAL WORK ITEMS ===");
console.log(JSON.stringify(
 all(`
  SELECT id,work_key,kind,title,status,
         created_at,updated_at
  FROM goal_work_items
  WHERE goal_id=?
  ORDER BY created_at
 `,goalId),
 null,2
));

console.log("\n=== LIFECYCLE ===");
console.log(JSON.stringify(
 one(`
  SELECT id,stage,status,task_id,work_item_id,
         delivery_plan_id,publication_id,
         verification_id,release_id,error,
         updated_at,completed_at
  FROM autonomous_lifecycle_checkpoints
  WHERE goal_id=?
 `,goalId),
 null,2
));

console.log("\n=== DEVELOPMENT SESSION ===");
console.log(JSON.stringify(
 one(`
  SELECT id,status,progress,recovery_count,
         pause_reason,failure,last_checkpoint_at,
         updated_at,completed_at
  FROM development_sessions
  WHERE goal_id=?
 `,goalId),
 null,2
));

console.log("\n=== PROJECT ===");
console.log(JSON.stringify(
 one(`
  SELECT id,status,phase,progress,error,
         github_repo,github_branch,github_commit,
         updated_at
  FROM projects
  WHERE id=?
 `,projectId),
 null,2
));
