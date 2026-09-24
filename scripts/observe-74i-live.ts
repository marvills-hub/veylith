import {db} from "../src/database/database.js";

const projectId="prj_59e5737b2866ea25";
const goalId="gol_c258fc809510a809";
const taskId="tsk_067b81f72558ef83";
const recoveryId="rcv_4b781ea4a12d7e3c";

const one=(sql:string,...args:any[])=>db.prepare(sql).get(...args) as any;
const all=(sql:string,...args:any[])=>db.prepare(sql).all(...args) as any[];

console.log("\n=== RECOVERY ===");
console.log(JSON.stringify(
 one("SELECT * FROM team_recoveries WHERE id=?",recoveryId),
 null,2
));

console.log("\n=== TESTER TASK ===");
console.log(JSON.stringify(
 one("SELECT * FROM tasks WHERE id=?",taskId),
 null,2
));

console.log("\n=== OUTER JOB ===");
console.log(JSON.stringify(
 one(`
  SELECT *
  FROM jobs
  WHERE task_id=?
  ORDER BY rowid DESC
  LIMIT 1
 `,taskId),
 null,2
));

console.log("\n=== GOAL WORK ===");
console.log(JSON.stringify(
 all(`
  SELECT id,kind,status,task_id
  FROM goal_work_items
  WHERE goal_id=?
  ORDER BY rowid
 `,goalId),
 null,2
));

console.log("\n=== LATEST REPAIR EVENTS ===");
console.log(JSON.stringify(
 all(`
  SELECT type,message,data,created_at
  FROM events
  WHERE task_id=?
    AND (
     type LIKE '%repair%'
     OR type LIKE '%recovery%'
     OR type LIKE '%role%'
    )
  ORDER BY rowid DESC
  LIMIT 40
 `,taskId),
 null,2
));

console.log("\n=== FAILURE HISTORY ===");
console.log(JSON.stringify(
 all(`
  SELECT *
  FROM failure_history
  WHERE project_id=?
  ORDER BY rowid DESC
  LIMIT 30
 `,projectId),
 null,2
));

console.log("\n=== RECENT TEAM REPAIR MEMORY ===");
console.log(JSON.stringify(
 all(`
  SELECT id,type,content,created_at
  FROM project_memory
  WHERE project_id=?
    AND type='team_repair'
  ORDER BY rowid DESC
  LIMIT 15
 `,projectId),
 null,2
));

console.log("\n=== PROJECT ===");
console.log(JSON.stringify(
 one("SELECT * FROM projects WHERE id=?",projectId),
 null,2
));
