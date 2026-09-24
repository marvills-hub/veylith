import {db} from "../src/database/database.js";

const projectId="prj_59e5737b2866ea25";
const taskId="tsk_067b81f72558ef83";
const recoveryId="rcv_4b781ea4a12d7e3c";

function columns(table:string){
 return db.prepare(`PRAGMA table_info(${table})`).all() as any[];
}
function rows(table:string){
 const cols=columns(table);
 const names=new Set(cols.map((x:any)=>String(x.name)));
 let sql=`SELECT * FROM ${table}`;
 const args:any[]=[];
 if(names.has("task_id")){
  sql+=" WHERE task_id=?";
  args.push(taskId);
 }else if(names.has("project_id")){
  sql+=" WHERE project_id=?";
  args.push(projectId);
 }else if(names.has("recovery_id")){
  sql+=" WHERE recovery_id=?";
  args.push(recoveryId);
 }
 sql+=" ORDER BY rowid DESC LIMIT 30";
 return db.prepare(sql).all(...args);
}

for(const table of [
 "team_recoveries",
 "repair_attempts",
 "failure_history",
 "goal_role_results",
 "project_memory",
 "events"
]){
 console.log(`\n=== ${table} ===`);
 try{
  console.log("COLUMNS:");
  console.log(JSON.stringify(columns(table),null,2));
  console.log("ROWS:");
  console.log(JSON.stringify(rows(table),null,2));
 }catch(error:any){
  console.log("READ ERROR:",error?.message||String(error));
 }
}

console.log("\n=== TESTER TASK ===");
console.log(JSON.stringify(
 db.prepare("SELECT * FROM tasks WHERE id=?").get(taskId),
 null,2
));

console.log("\n=== TESTER JOBS ===");
console.log(JSON.stringify(
 db.prepare(`
  SELECT *
  FROM jobs
  WHERE task_id=?
  ORDER BY rowid DESC
 `).all(taskId),
 null,2
));

console.log("\n=== TESTER WORK ===");
console.log(JSON.stringify(
 db.prepare(`
  SELECT *
  FROM goal_work_items
  WHERE id='wrk_5de86314600ffcf5'
 `).get(),
 null,2
));

console.log("\n=== TESTER ASSIGNMENT ===");
console.log(JSON.stringify(
 db.prepare(`
  SELECT *
  FROM agent_assignments
  WHERE id='asg_12332071d557b2ec'
 `).get(),
 null,2
));
