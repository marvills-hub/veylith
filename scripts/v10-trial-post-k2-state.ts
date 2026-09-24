import {db} from "../src/database/database.js";

const ids={
 recovery:"rcv_4b781ea4a12d7e3c",
 job:"job_ef6fd5f994644d1e",
 task:"tsk_067b81f72558ef83",
 work:"wrk_5de86314600ffcf5",
 assignment:"asg_12332071d557b2ec",
 roleResult:"rrs_612407fb05797ac4",
 lifecycle:"alc_55c5545406de9da3"
};

function one(table:string,id:string){
 return db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
}

console.log("\n--- CURRENT AUTHORITATIVE STATE ---");

console.log("\nRECOVERY");
console.log(JSON.stringify(one("team_recoveries",ids.recovery),null,2));

console.log("\nJOB");
console.log(JSON.stringify(one("jobs",ids.job),null,2));

console.log("\nTASK");
console.log(JSON.stringify(one("tasks",ids.task),null,2));

console.log("\nWORK");
console.log(JSON.stringify(one("goal_work_items",ids.work),null,2));

console.log("\nASSIGNMENT");
console.log(JSON.stringify(one("agent_assignments",ids.assignment),null,2));

console.log("\nROLE RESULT");
console.log(JSON.stringify(one("goal_role_results",ids.roleResult),null,2));

console.log("\nLIFECYCLE");
console.log(JSON.stringify(one("autonomous_lifecycle_checkpoints",ids.lifecycle),null,2));

console.log("\nDISPATCH");
console.log(JSON.stringify(
 db.prepare("SELECT * FROM goal_work_dispatches WHERE work_item_id=?")
   .get(ids.work),
 null,
 2
));

console.log("\n============================================================");
console.log("READ-ONLY CHECK COMPLETE");
console.log("Database modified: NO");
console.log("Workspace modified: NO");
console.log("Runtime: STOPPED");
console.log("============================================================");
