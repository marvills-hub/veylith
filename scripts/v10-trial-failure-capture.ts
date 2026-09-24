import {DatabaseSync} from"node:sqlite";

const db=new DatabaseSync("data/veylith.db");
const projectId="prj_59e5737b2866ea25";
const taskId="tsk_067b81f72558ef83";
const workItemId="wrk_5de86314600ffcf5";

for(const table of[
 "goal_role_results",
 "agent_assignments",
 "goal_work_dispatches",
 "team_recoveries",
 "validation_runs",
 "validation_diagnostics",
 "validation_repairs"
]){
 try{
  const rows=db.prepare(
   `SELECT * FROM ${table} WHERE project_id=?`
  ).all(projectId);
  console.log(`\n=== ${table} ===`);
  console.log(JSON.stringify(rows,null,2));
 }catch(error){
  console.log(`\n=== ${table}: unavailable ===`);
  console.log(String(error));
 }
}

console.log("\n=== FAILED TASK ===");
console.log(JSON.stringify(
 db.prepare("SELECT * FROM tasks WHERE id=?").get(taskId),
 null,2
));

console.log("\n=== FAILED WORK ITEM ===");
console.log(JSON.stringify(
 db.prepare("SELECT * FROM goal_work_items WHERE id=?").get(workItemId),
 null,2
));

db.close();
