import {spawn} from "node:child_process";
import {db} from "../dist/database/database.js";

const CYCLES=5;
let passed=0,failed=0;

function check(name,value,detail=""){
 if(value){
  passed++;
  console.log(`PASS ${String(passed+failed).padStart(2,"0")} ${name}`);
 }else{
  failed++;
  console.log(`FAIL ${String(passed+failed).padStart(2,"0")} ${name}${detail?` — ${detail}`:""}`);
 }
}

function runCrashCycle(index){
 return new Promise(resolve=>{
  console.log(`\n--- FORCE-KILL / RESTART CYCLE ${index}/${CYCLES} ---`);

  const child=spawn(
   process.execPath,
   ["scripts/v09-live-crash-regression.mjs"],
   {
    cwd:process.cwd(),
    env:{...process.env},
    stdio:["ignore","pipe","pipe"],
    windowsHide:true
   }
  );

  let output="";
  let errorOutput="";

  child.stdout.on("data",chunk=>{
   const text=chunk.toString();
   output+=text;
   process.stdout.write(text);
  });

  child.stderr.on("data",chunk=>{
   const text=chunk.toString();
   errorOutput+=text;
   process.stderr.write(text);
  });

  child.on("error",error=>{
   resolve({code:1,output,errorOutput:`${errorOutput}\n${error.stack||error.message}`});
  });

  child.on("exit",code=>{
   resolve({code:code??1,output,errorOutput});
  });
 });
}

function scalar(sql,...args){
 return Number(db.prepare(sql).get(...args)?.count||0);
}

console.log("\n============================================================");
console.log(" VEYLITH v0.9 BATCH 6 PASS 3");
console.log(" RUNTIME FORCE-KILL + RESTART CONTINUITY");
console.log("============================================================");

try{
 const baseline={
  running:scalar("SELECT COUNT(*) count FROM jobs WHERE status='running'"),
  slots:scalar("SELECT COUNT(*) count FROM worker_slots"),
  activeRuntimes:scalar(`
   SELECT COUNT(*) count
   FROM runtime_instances
   WHERE status IN ('starting','online','stopping')
  `)
 };

 console.log("\nBaseline:");
 console.log(baseline);

 for(let i=1;i<=CYCLES;i++){
  const result=await runCrashCycle(i);

  check(`Cycle ${i} crash regression exits cleanly`,result.code===0,`exit=${result.code}`);

  check(
   `Cycle ${i} performed real force kill`,
   result.output.includes("PASS child process force-killed without graceful shutdown")
  );

  check(
   `Cycle ${i} detected stale runtime`,
   result.output.includes("PASS force-killed runtime becomes stale")
  );

  check(
   `Cycle ${i} reclaimed crashed job exactly once`,
   result.output.includes("PASS crashed job reclaimed exactly once")
  );

  check(
   `Cycle ${i} removed stale worker slots`,
   result.output.includes("PASS stale runtime worker slots removed")
  );

  check(
   `Cycle ${i} replacement runtime reclaimed job`,
   result.output.includes("PASS replacement runtime can reclaim job")
  );

  check(
   `Cycle ${i} prevented duplicate claim`,
   result.output.includes("PASS job cannot be claimed twice")
  );

  check(
   `Cycle ${i} retained single active owner`,
   result.output.includes("PASS single active owner remains")
  );

  check(
   `Cycle ${i} completed existing live crash gate`,
   result.output.includes("VEYLITH v0.9 BATCH 1 LIVE CRASH/RESTART TEST PASSED")
  );

  const leakedFixtures=scalar(`
   SELECT COUNT(*) count
   FROM jobs
   WHERE id LIKE 'reg_job_%'
      OR id LIKE 'reg_current_%'
  `);

  check(
   `Cycle ${i} leaves no crash-test jobs`,
   leakedFixtures===0,
   `remaining=${leakedFixtures}`
  );

  const leakedProjects=scalar(`
   SELECT COUNT(*) count
   FROM projects
   WHERE id LIKE 'reg_prj_%'
  `);

  check(
   `Cycle ${i} leaves no crash-test projects`,
   leakedProjects===0,
   `remaining=${leakedProjects}`
  );

  const leakedTasks=scalar(`
   SELECT COUNT(*) count
   FROM tasks
   WHERE id LIKE 'reg_tsk_%'
  `);

  check(
   `Cycle ${i} leaves no crash-test tasks`,
   leakedTasks===0,
   `remaining=${leakedTasks}`
  );
 }

 const duplicateOwners=db.prepare(`
  SELECT claimed_by,COUNT(*) count
  FROM jobs
  WHERE status='running'
    AND claimed_by IS NOT NULL
  GROUP BY claimed_by
  HAVING COUNT(*)>1
 `).all();

 check(
  "No duplicate active job ownership after stress",
  duplicateOwners.length===0,
  `duplicates=${duplicateOwners.length}`
 );

 const invalidRunning=scalar(`
  SELECT COUNT(*) count
  FROM jobs
  WHERE status='running'
    AND (
     claimed_by IS NULL
     OR lease_expires_at IS NULL
     OR heartbeat_at IS NULL
    )
 `);

 check(
  "No running jobs missing ownership/lease metadata",
  invalidRunning===0,
  `invalid=${invalidRunning}`
 );

 const orphanStressSlots=scalar(`
  SELECT COUNT(*) count
  FROM worker_slots
  WHERE job_id LIKE 'reg_job_%'
     OR task_id LIKE 'reg_tsk_%'
     OR project_id LIKE 'reg_prj_%'
 `);

 check(
  "No crash-test worker slots remain",
  orphanStressSlots===0,
  `remaining=${orphanStressSlots}`
 );

 const leakedRuntimeFixtures=scalar(`
  SELECT COUNT(*) count
  FROM runtime_instances
  WHERE id LIKE 'rt_old_%'
 `);

 check(
  "No synthetic durability runtimes remain",
  leakedRuntimeFixtures===0,
  `remaining=${leakedRuntimeFixtures}`
 );

 const finalRunning=scalar(
  "SELECT COUNT(*) count FROM jobs WHERE status='running'"
 );

 check(
  "Stress test does not create permanent running jobs",
  finalRunning===baseline.running,
  `before=${baseline.running}, after=${finalRunning}`
 );

}catch(error){
 console.error(`\nPASS 3 ERROR: ${error.stack||error.message}`);
 failed++;
}

console.log("\n============================================================");
console.log(" BATCH 6 PASS 3 RESULT");
console.log("============================================================");
console.log(`Crash cycles: ${CYCLES}`);
console.log(`Passed:       ${passed}`);
console.log(`Failed:       ${failed}`);
console.log(`Total:        ${passed+failed}`);

if(failed){
 console.log("\nRUNTIME FORCE-KILL / RESTART STRESS FAILED.");
 process.exitCode=1;
}else{
 console.log("\nRUNTIME FORCE-KILL / RESTART STRESS PASSED.");
 console.log("Real process force-kill:       PASS");
 console.log("Heartbeat loss detection:      PASS");
 console.log("30-second stale detection:     PASS");
 console.log("Runtime-owned job recovery:    PASS");
 console.log("Stale slot cleanup:            PASS");
 console.log("Replacement runtime reclaim:   PASS");
 console.log("Duplicate claim prevention:    PASS");
 console.log("Repeated restart continuity:   PASS");
 console.log("Database integrity:            PASS");
}
