import {db} from "../src/database/database.js";

const ids={
 project:"prj_59e5737b2866ea25",
 goal:"gol_c258fc809510a809",
 recovery:"rcv_4b781ea4a12d7e3c",
 job:"job_ef6fd5f994644d1e",
 task:"tsk_067b81f72558ef83",
 work:"wrk_5de86314600ffcf5",
 assignment:"asg_12332071d557b2ec"
};

function one(sql:string,id:string){
 return db.prepare(sql).get(id) as any;
}

function columns(table:string){
 return db.prepare(`PRAGMA table_info(${table})`).all().map((x:any)=>x.name);
}

console.log("\n--- AUTHORITATIVE ROWS ---");

for(const [name,table,id] of [
 ["PROJECT","projects",ids.project],
 ["GOAL","goals",ids.goal],
 ["RECOVERY","team_recoveries",ids.recovery],
 ["JOB","jobs",ids.job],
 ["TASK","tasks",ids.task],
 ["WORK","goal_work_items",ids.work],
 ["ASSIGNMENT","agent_assignments",ids.assignment]
] as const){
 console.log(`\n### ${name} / ${table}`);
 console.log("COLUMNS:",columns(table).join(", "));
 console.log(JSON.stringify(
  one(`SELECT * FROM ${table} WHERE id=?`,id),
  null,
  2
 ));
}

console.log("\n--- RECOVERY ROWS FOR TESTER TASK ---");
console.log(JSON.stringify(
 db.prepare(`
  SELECT *
  FROM team_recoveries
  WHERE task_id=?
  ORDER BY rowid
 `).all(ids.task),
 null,
 2
));

console.log("\n--- JOBS FOR TESTER TASK ---");
console.log(JSON.stringify(
 db.prepare(`
  SELECT *
  FROM jobs
  WHERE task_id=?
  ORDER BY rowid
 `).all(ids.task),
 null,
 2
));

console.log("\n--- ASSIGNMENTS FOR TESTER WORK ---");
console.log(JSON.stringify(
 db.prepare(`
  SELECT *
  FROM agent_assignments
  WHERE work_item_id=?
  ORDER BY rowid
 `).all(ids.work),
 null,
 2
));

console.log("\n--- GOAL WORK SUMMARY ---");
console.log(JSON.stringify(
 db.prepare(`
  SELECT id,title,kind,status,error
  FROM goal_work_items
  WHERE goal_id=?
  ORDER BY rowid
 `).all(ids.goal),
 null,
 2
));

console.log("\n--- LIFECYCLE ---");
console.log(JSON.stringify(
 db.prepare(`
  SELECT *
  FROM autonomous_lifecycle_checkpoints
  WHERE goal_id=?
 `).get(ids.goal),
 null,
 2
));

console.log("\n============================================================");
console.log("DIAGNOSIS COMPLETE");
console.log("Database modified: NO");
console.log("Workspace modified: NO");
console.log("Recovery extended: NO");
console.log("AI calls: NONE");
console.log("GitHub calls: NONE");
console.log("Runtime: STOPPED");
console.log("============================================================");
