import fs from "node:fs";
import path from "node:path";
import {db} from "../src/database/database.js";

const I={
 project:"prj_59e5737b2866ea25",
 goal:"gol_c258fc809510a809",
 recovery:"rcv_4b781ea4a12d7e3c",
 job:"job_ef6fd5f994644d1e",
 task:"tsk_067b81f72558ef83",
 work:"wrk_5de86314600ffcf5"
};

function one(sql:string,...args:any[]){
 return db.prepare(sql).get(...args) as any;
}

const project=one("SELECT * FROM projects WHERE id=?",I.project);
const recovery=one("SELECT * FROM team_recoveries WHERE id=?",I.recovery);
const job=one("SELECT * FROM jobs WHERE id=?",I.job);
const task=one("SELECT * FROM tasks WHERE id=?",I.task);
const work=one("SELECT * FROM goal_work_items WHERE id=?",I.work);
const lifecycle=one(
 "SELECT * FROM autonomous_lifecycle_checkpoints WHERE goal_id=?",
 I.goal
);

const workspace=String(project?.workspace??"");
const packageFile=path.join(workspace,"package.json");
const lockFile=path.join(workspace,"package-lock.json");
const modules=path.join(workspace,"node_modules");
const jest=path.join(modules,"jest");
const supertest=path.join(modules,"supertest");
const marker=path.join(modules,".veylith-dependencies");

console.log("\n--- RECOVERY ---");
console.log(JSON.stringify(recovery,null,2));

console.log("\n--- OUTER JOB ---");
console.log(JSON.stringify(job,null,2));

console.log("\n--- TESTER ---");
console.log(JSON.stringify({
 task,
 work
},null,2));

console.log("\n--- DEPENDENCY PROVISIONING EVIDENCE ---");
console.log(JSON.stringify({
 workspace,
 packageJson:fs.existsSync(packageFile),
 packageLock:fs.existsSync(lockFile),
 nodeModules:fs.existsSync(modules),
 jestInstalled:fs.existsSync(jest),
 supertestInstalled:fs.existsSync(supertest),
 marker:fs.existsSync(marker),
 markerValue:fs.existsSync(marker)
  ?fs.readFileSync(marker,"utf8").trim()
  :null
},null,2));

if(fs.existsSync(packageFile)){
 console.log("\n--- PACKAGE.JSON ---");
 console.log(fs.readFileSync(packageFile,"utf8"));
}

console.log("\n--- TEST FILES ---");
const tests=path.join(workspace,"tests");
if(fs.existsSync(tests)){
 for(const file of fs.readdirSync(tests)){
  console.log(file);
 }
}else{
 console.log("tests directory missing");
}

console.log("\n--- GOAL WORK ---");
console.log(JSON.stringify(
 db.prepare(`
  SELECT id,work_key,title,kind,status
  FROM goal_work_items
  WHERE goal_id=?
  ORDER BY rowid
 `).all(I.goal),
 null,
 2
));

console.log("\n--- LIFECYCLE ---");
console.log(JSON.stringify(lifecycle,null,2));

console.log("\n--- DELIVERY AUTHORITY ---");
console.log(JSON.stringify({
 deliveryPlan:lifecycle?.delivery_plan_id??null,
 publication:lifecycle?.publication_id??null,
 verification:lifecycle?.verification_id??null,
 release:lifecycle?.release_id??null
},null,2));

console.log("\n============================================================");
console.log("OBSERVATION COMPLETE");
console.log("Database modified:       NO");
console.log("Workspace manually edited:NO");
console.log("Recovery extended:       NO");
console.log("Manual npm install:      NO");
console.log("GitHub calls by script:  NONE");
console.log("============================================================");
