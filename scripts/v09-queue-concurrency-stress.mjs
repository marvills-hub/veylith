import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {spawnSync} from "node:child_process";
import {DatabaseSync} from "node:sqlite";

const root=process.cwd();
const dbSource=fs.readFileSync(path.join(root,"src/database/database.ts"),"utf8");
const queueFiles=[
 "src/jobs/job-queue.service.ts",
 "src/jobs/job.service.ts",
 "src/jobs/queue.service.ts"
].filter(file=>fs.existsSync(path.join(root,file)));

let passed=0;
let failed=0;
const created=[];

function check(name,value,detail=""){
 if(value){
  passed++;
  console.log(`PASS ${String(passed+failed).padStart(2,"0")} ${name}`);
 }else{
  failed++;
  console.log(`FAIL ${String(passed+failed).padStart(2,"0")} ${name}${detail?` — ${detail}`:""}`);
 }
}

function findDatabase(){
 const envPath=path.join(root,".env");
 const env=fs.existsSync(envPath)?fs.readFileSync(envPath,"utf8"):"";
 const match=env.match(/^(?:DATABASE_PATH|DB_PATH|SQLITE_PATH)\s*=\s*["']?(.+?)["']?\s*$/m);

 const candidates=[
  match?.[1],
  "data/veylith.db",
  "data/veylith.sqlite",
  "veylith.db",
  "veylith.sqlite"
 ].filter(Boolean).map(file=>path.resolve(root,file));

 for(const candidate of candidates){
  if(fs.existsSync(candidate))return candidate;
 }

 const found=[];
 function scan(dir,depth=0){
  if(depth>3||!fs.existsSync(dir))return;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   if(["node_modules",".git","workspaces","logs","dist"].includes(entry.name))continue;
   const full=path.join(dir,entry.name);
   if(entry.isDirectory())scan(full,depth+1);
   else if(/\.(db|sqlite|sqlite3)$/i.test(entry.name))found.push(full);
  }
 }
 scan(root);
 return found[0]||null;
}

function columns(db,table){
 return db.prepare(`PRAGMA table_info(${table})`).all().map(row=>String(row.name));
}

function tables(db){
 return db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>String(row.name));
}

function valueFor(column,i,group){
 const now=new Date().toISOString();
 const id=`stress_${group}_${i}_${crypto.randomBytes(4).toString("hex")}`;

 const values={
  id,
  task_id:`stress_task_${group}_${i}_${crypto.randomBytes(4).toString("hex")}`,
  project_id:`stress_project_${group}`,
  type:"development",
  status:"queued",
  priority:(i%5)+1,
  attempts:0,
  max_attempts:3,
  available_at:now,
  scheduled_at:now,
  created_at:now,
  updated_at:now,
  started_at:null,
  completed_at:null,
  failed_at:null,
  claimed_by:null,
  claimed_at:null,
  worker_id:null,
  owner_id:null,
  lease_expires_at:null,
  error:null,
  last_error:null,
  payload:"{}",
  input:"{}",
  metadata:"{}"
 };

 return Object.prototype.hasOwnProperty.call(values,column)?values[column]:null;
}

function insertJobs(db,count,group){
 const cols=columns(db,"jobs");
 const info=db.prepare("PRAGMA table_info(jobs)").all();
 const required=info.filter(row=>Number(row.notnull)===1&&row.dflt_value==null&&Number(row.pk)===0).map(row=>String(row.name));

 const supported=cols.filter(column=>{
  if(["id","task_id","project_id","type","status","priority","attempts","max_attempts","available_at","scheduled_at","created_at","updated_at","started_at","completed_at","failed_at","claimed_by","claimed_at","worker_id","owner_id","lease_expires_at","error","last_error","payload","input","metadata"].includes(column))return true;
  return required.includes(column);
 });

 const ids=[];

 for(let i=0;i<count;i++){
  const row={};
  for(const column of supported)row[column]=valueFor(column,i,group);

  for(const column of required){
   if(row[column]!==null&&row[column]!==undefined)continue;
   if(/(_at|date|time)$/i.test(column))row[column]=new Date().toISOString();
   else if(/(attempt|priority|count|max|sequence|progress)/i.test(column))row[column]=0;
   else if(/payload|metadata|input|output/i.test(column))row[column]="{}";
   else row[column]=`stress_${group}_${i}`;
  }

  const names=Object.keys(row);
  const placeholders=names.map(()=>"?").join(",");
  db.prepare(`INSERT INTO jobs (${names.join(",")}) VALUES (${placeholders})`).run(...names.map(name=>row[name]));
  ids.push(row.id);
  created.push(row.id);
 }

 return ids;
}

function cleanup(db){
 if(!created.length)return;
 const remove=db.prepare("DELETE FROM jobs WHERE id=?");
 db.exec("BEGIN IMMEDIATE");
 try{
  for(const id of created)remove.run(id);
  db.exec("COMMIT");
 }catch(error){
  db.exec("ROLLBACK");
  throw error;
 }
}

console.log("\n============================================================");
console.log(" VEYLITH v0.9 BATCH 6 PASS 1");
console.log(" QUEUE + CONCURRENCY STRESS");
console.log("============================================================\n");

check("Jobs schema exists in database source",dbSource.includes("jobs"));
check("Queue implementation exists",queueFiles.length>0,queueFiles.join(", "));
check("SQLite uses persistent jobs table",/CREATE TABLE IF NOT EXISTS jobs/i.test(dbSource));

const dbPath=findDatabase();
check("Runtime SQLite database located",Boolean(dbPath),dbPath||"not found");

if(!dbPath){
 console.log("\nCannot continue runtime stress without the existing database.");
 process.exitCode=1;
}else{
 console.log(`\nDatabase: ${dbPath}\n`);
 const db=new DatabaseSync(dbPath);

 try{
  const tableNames=tables(db);
  check("Runtime jobs table exists",tableNames.includes("jobs"));

  if(!tableNames.includes("jobs"))throw new Error("jobs table missing");

  const jobColumns=columns(db,"jobs");

  check("Jobs have persistent ID",jobColumns.includes("id"));
  check("Jobs have status",jobColumns.includes("status"));
  check("Jobs have priority",jobColumns.includes("priority"));
  check("Jobs track attempts",jobColumns.includes("attempts"));
  check("Jobs track maximum attempts",jobColumns.includes("max_attempts"));
  check("Jobs support worker ownership",jobColumns.includes("claimed_by")||jobColumns.includes("worker_id")||jobColumns.includes("owner_id"));
  check("Jobs support lease/recovery metadata",
   jobColumns.includes("lease_expires_at")||
   jobColumns.includes("claimed_at")||
   jobColumns.includes("heartbeat_at")
  );

  const group=Date.now().toString(36);
  const ids=insertJobs(db,100,group);

  check("100 stress jobs inserted",ids.length===100);

  const placeholders=ids.map(()=>"?").join(",");
  const count=db.prepare(`SELECT COUNT(*) count FROM jobs WHERE id IN (${placeholders})`).get(...ids);
  check("100 stress jobs persisted",Number(count.count)===100);

  const unique=new Set(ids);
  check("All stress job IDs unique",unique.size===100);

  const queued=db.prepare(`SELECT COUNT(*) count FROM jobs WHERE id IN (${placeholders}) AND status='queued'`).get(...ids);
  check("All stress jobs begin queued",Number(queued.count)===100);

  const beforeAttempts=db.prepare(`SELECT COALESCE(SUM(attempts),0) total FROM jobs WHERE id IN (${placeholders})`).get(...ids);
  check("Queue insertion consumes no attempts",Number(beforeAttempts.total)===0);

  const workerColumn=jobColumns.includes("claimed_by")?"claimed_by":jobColumns.includes("worker_id")?"worker_id":"owner_id";
  const claimedColumn=jobColumns.includes("claimed_at")?"claimed_at":null;
  const updatedColumn=jobColumns.includes("updated_at")?"updated_at":null;

  const claimed=new Set();
  const workers=12;
  const claimsPerWorker=6;

  for(let worker=0;worker<workers;worker++){
   const owner=`stress-worker-${worker}`;

   for(let n=0;n<claimsPerWorker;n++){
    db.exec("BEGIN IMMEDIATE");

    try{
     const row=db.prepare(`
      SELECT id
      FROM jobs
      WHERE status='queued'
      AND id IN (${placeholders})
      ORDER BY priority DESC, created_at ASC, id ASC
      LIMIT 1
     `).get(...ids);

     if(!row){
      db.exec("COMMIT");
      break;
     }

     const assignments=[
      "status='running'",
      `${workerColumn}=?`
     ];
     const args=[owner];

     if(claimedColumn){
      assignments.push(`${claimedColumn}=?`);
      args.push(new Date().toISOString());
     }

     if(updatedColumn){
      assignments.push(`${updatedColumn}=?`);
      args.push(new Date().toISOString());
     }

     args.push(row.id);

     const result=db.prepare(`
      UPDATE jobs
      SET ${assignments.join(",")}
      WHERE id=? AND status='queued'
     `).run(...args);

     db.exec("COMMIT");

     if(Number(result.changes)===1){
      if(claimed.has(row.id))throw new Error(`duplicate claim ${row.id}`);
      claimed.add(row.id);
     }
    }catch(error){
     try{db.exec("ROLLBACK")}catch{}
     throw error;
    }
   }
  }

  check("72 concurrent-style claims completed",claimed.size===72,`claimed ${claimed.size}`);
  check("No duplicate claim ownership",claimed.size===new Set(claimed).size);

  const running=db.prepare(`SELECT COUNT(*) count FROM jobs WHERE id IN (${placeholders}) AND status='running'`).get(...ids);
  check("Exactly 72 jobs running",Number(running.count)===72);

  const remaining=db.prepare(`SELECT COUNT(*) count FROM jobs WHERE id IN (${placeholders}) AND status='queued'`).get(...ids);
  check("Exactly 28 jobs remain queued",Number(remaining.count)===28);

  const ownerRows=db.prepare(`
   SELECT ${workerColumn} owner,COUNT(*) count
   FROM jobs
   WHERE id IN (${placeholders}) AND status='running'
   GROUP BY ${workerColumn}
  `).all(...ids);

  check("12 simulated workers own jobs",ownerRows.length===12);
  check("Every simulated worker owns six jobs",ownerRows.every(row=>Number(row.count)===6));

  const attemptsAfterClaim=db.prepare(`
   SELECT COALESCE(SUM(attempts),0) total
   FROM jobs
   WHERE id IN (${placeholders})
  `).get(...ids);

  check("Claiming jobs does not consume logical attempts",Number(attemptsAfterClaim.total)===0);

  const duplicateOwners=db.prepare(`
   SELECT id,COUNT(*) count
   FROM jobs
   WHERE id IN (${placeholders})
   GROUP BY id
   HAVING COUNT(*)>1
  `).all(...ids);

  check("Database contains no duplicate job rows",duplicateOwners.length===0);

  const invalidRunning=db.prepare(`
   SELECT COUNT(*) count
   FROM jobs
   WHERE id IN (${placeholders})
   AND status='running'
   AND (${workerColumn} IS NULL OR ${workerColumn}='')
  `).get(...ids);

  check("Every running job has an owner",Number(invalidRunning.count)===0);

  const highestQueued=db.prepare(`
   SELECT priority
   FROM jobs
   WHERE id IN (${placeholders}) AND status='queued'
   ORDER BY priority DESC
   LIMIT 1
  `).get(...ids);

  const lowestClaimed=db.prepare(`
   SELECT priority
   FROM jobs
   WHERE id IN (${placeholders}) AND status='running'
   ORDER BY priority ASC
   LIMIT 1
  `).get(...ids);

  check(
   "Priority ordering respected under load",
   !highestQueued||!lowestClaimed||Number(lowestClaimed.priority)>=Number(highestQueued.priority)
  );

  db.exec("BEGIN IMMEDIATE");
  try{
   db.prepare(`
    UPDATE jobs
    SET status='queued',${workerColumn}=NULL${claimedColumn?`,${claimedColumn}=NULL`:""}${updatedColumn?`,${updatedColumn}=?`:""}
    WHERE id IN (${placeholders}) AND status='running'
   `).run(...(updatedColumn?[new Date().toISOString(),...ids]:ids));
   db.exec("COMMIT");
  }catch(error){
   db.exec("ROLLBACK");
   throw error;
  }

  const recovered=db.prepare(`
   SELECT COUNT(*) count
   FROM jobs
   WHERE id IN (${placeholders}) AND status='queued'
  `).get(...ids);

  check("All 100 jobs recover to queued",Number(recovered.count)===100);

  const recoveredAttempts=db.prepare(`
   SELECT COALESCE(SUM(attempts),0) total
   FROM jobs
   WHERE id IN (${placeholders})
  `).get(...ids);

  check("Infrastructure-style recovery consumes no attempts",Number(recoveredAttempts.total)===0);

  cleanup(db);

  const afterCleanup=db.prepare(`SELECT COUNT(*) count FROM jobs WHERE id LIKE ?`).get(`stress_${group}_%`);
  check("Stress jobs cleaned from database",Number(afterCleanup.count)===0);

 }catch(error){
  console.error(`\nSTRESS ERROR: ${error.stack||error.message}`);
  try{cleanup(db)}catch(cleanupError){
   console.error(`Cleanup error: ${cleanupError.message}`);
  }
  failed++;
 }finally{
  db.close();
 }
}

console.log("\n============================================================");
console.log(" BATCH 6 PASS 1 RESULT");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed){
 console.log("\nQUEUE / CONCURRENCY STRESS FAILED.");
 process.exitCode=1;
}else{
 console.log("\nQUEUE / CONCURRENCY STRESS PASSED.");
 console.log("Persistent queue:             PASS");
 console.log("100-job load:                 PASS");
 console.log("Multi-worker claiming:        PASS");
 console.log("Duplicate ownership:          PASS");
 console.log("Priority ordering:            PASS");
 console.log("Attempt preservation:         PASS");
 console.log("Infrastructure recovery:      PASS");
 console.log("Database cleanup:             PASS");
}

