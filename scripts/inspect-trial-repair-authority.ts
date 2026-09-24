import {db} from "../src/database/database.js";

const projectId="prj_59e5737b2866ea25";
const taskId="tsk_067b81f72558ef83";

function columns(table:string){
 return new Set(
  (db.prepare(`PRAGMA table_info(${table})`).all() as any[])
   .map(row=>String(row.name))
 );
}

function rows(table:string){
 const names=columns(table);
 if(names.has("task_id")){
  return db.prepare(
   `SELECT * FROM ${table} WHERE task_id=? ORDER BY rowid DESC LIMIT 50`
  ).all(taskId);
 }
 if(names.has("project_id")){
  return db.prepare(
   `SELECT * FROM ${table} WHERE project_id=? ORDER BY rowid DESC LIMIT 50`
  ).all(projectId);
 }
 return[];
}

for(const table of[
 "tasks",
 "goal_work_items",
 "goal_work_dispatches",
 "agent_assignments",
 "goal_role_results",
 "team_recoveries",
 "failure_history",
 "project_memory"
]){
 console.log(`\n============================================================`);
 console.log(table);
 console.log(`============================================================`);
 try{
  console.log(JSON.stringify(rows(table),null,2));
 }catch(error:any){
  console.log("READ ERROR:",error?.message||String(error));
 }
}

console.log("\n============================================================");
console.log("TESTER TASK");
console.log("============================================================");
console.log(JSON.stringify(
 db.prepare("SELECT * FROM tasks WHERE id=?").get(taskId),
 null,
 2
));

console.log("\n============================================================");
console.log("TESTER DISPATCH + WORK ITEM");
console.log("============================================================");
console.log(JSON.stringify(
 db.prepare(`
  SELECT
   gwd.*,
   gwi.kind,
   gwi.title,
   gwi.description,
   gwi.status AS work_status,
   gwi.metadata_json AS work_metadata
  FROM goal_work_dispatches gwd
  JOIN goal_work_items gwi ON gwi.id=gwd.work_item_id
  WHERE gwd.task_id=?
 `).all(taskId),
 null,
 2
));
