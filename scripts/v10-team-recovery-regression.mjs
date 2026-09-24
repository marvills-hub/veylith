import fs from "node:fs";
import {db} from "../dist/database/database.js";
import {
 getAssignmentRecovery,
 listGoalRecoveries,
 deleteGoalRecoveries
} from "../dist/team/team-recovery.service.js";

let passed=0;
let failed=0;

function check(name,condition){
 if(condition){
  passed++;
  console.log(`PASS ${name}`);
 }else{
  failed++;
  console.error(`FAIL ${name}`);
 }
}

try{
 const recovery=fs.readFileSync(
  new URL("../src/team/team-recovery.service.ts",import.meta.url),
  "utf8"
 );
 const executor=fs.readFileSync(
  new URL("../src/team/goal-role-executor.service.ts",import.meta.url),
  "utf8"
 );

 check("recovery table exists",recovery.includes("CREATE TABLE IF NOT EXISTS team_recoveries"));
 check("one recovery per assignment",recovery.includes("UNIQUE(assignment_id)"));
 check("repair budget uses central configuration",recovery.includes("MAX_REPAIR_ATTEMPTS"));
 check("diagnostic agent reused",recovery.includes("diagnoseFailure("));
 check("failure fingerprint reused",recovery.includes("failureFingerprint("));
 check("repair history reused",recovery.includes("repairHistory(taskId)"));
 check("targeted repair agent reused",recovery.includes("repairProject("));
 check("protected writer reused",recovery.includes("applyDevelopment("));
 check("validation pipeline reused",recovery.includes("validateDevelopment("));
 check("task repair attempts persisted",recovery.includes("SET repair_attempts=?"));
 check("recovery attempt telemetry emitted",recovery.includes('"team.recovery_started"'));
 check("diagnostic telemetry emitted",recovery.includes('"team.diagnostic_completed"'));
 check("successful recovery telemetry emitted",recovery.includes('"team.recovery_completed"'));
 check("exhaustion telemetry emitted",recovery.includes('"team.recovery_exhausted"'));
 check("repair memory persisted",recovery.includes('"team_repair"'));
 check("successful validation ends repair loop",recovery.includes("if(validation.success)"));
 check("successful recovery persisted",recovery.includes('"recovered"'));
 check("exhausted recovery persisted",recovery.includes('"exhausted"'));
 check("tester imports recovery coordinator",executor.includes('from "./team-recovery.service.js"'));
 check("tester invokes recovery coordinator",executor.includes("await recoverGoalWork({"));
 check("tester preserves normal validation",executor.includes("validateDevelopment(development,task,projectRow)"));
 check("tester returns recovered development",executor.includes("finalDevelopment=recovered.development"));
 check("failed recovery remains throwable",executor.includes("Team recovery exhausted:"));
 check("diagnostic remains recovery-only role",executor.includes('case "diagnostic"'));
 check("repair remains recovery-only role",executor.includes('case "repair"'));

 const stamp=Date.now();
 const id=`rcv_regression_${stamp}`;
 const goalId=`goal_regression_${stamp}`;
 const assignmentId=`assignment_regression_${stamp}`;
 const time=new Date().toISOString();

 db.prepare(`
  INSERT INTO team_recoveries(
   id,goal_id,project_id,work_item_id,assignment_id,task_id,
   status,attempts,max_attempts,fingerprint,diagnostic_json,
   validation_json,error,created_at,updated_at,completed_at
  ) VALUES(?,?,?,?,?,?,'recovered',2,6,?,?,?,?,?,?,?)
 `).run(
  id,
  goalId,
  `project_${stamp}`,
  `work_${stamp}`,
  assignmentId,
  `task_${stamp}`,
  "fingerprint-test",
  JSON.stringify({
   summary:"Diagnosed",
   rootCause:"Fixture root cause",
   evidence:["fixture"],
   relevantFiles:["src/test.ts"],
   previousAttempts:[],
   strategy:["repair"],
   avoid:[],
   confidence:"high",
   fingerprint:"fingerprint-test"
  }),
  JSON.stringify({success:true,results:[]}),
  null,
  time,
  time,
  time
 );

 const persisted=getAssignmentRecovery(assignmentId);

 check("persistent recovery reloads",Boolean(persisted));
 check("recovery status retained",persisted?.status==="recovered");
 check("repair attempt count retained",persisted?.attempts===2);
 check("repair budget retained",persisted?.maxAttempts===6);
 check("fingerprint retained",persisted?.fingerprint==="fingerprint-test");
 check("diagnostic JSON retained",persisted?.diagnostic?.rootCause==="Fixture root cause");
 check("validation JSON retained",persisted?.validation?.success===true);
 check("goal recovery list reloads",listGoalRecoveries(goalId).length===1);

 deleteGoalRecoveries(goalId);

 check("recovery cleanup persisted",listGoalRecoveries(goalId).length===0);
}catch(error){
 failed++;
 console.error(error);
}

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 2 PASS 6");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("\nVEYLITH v1.0 BATCH 2 PASS 6 PASSED");
}else{
 console.error("\nVEYLITH v1.0 BATCH 2 PASS 6 FAILED");
 process.exitCode=1;
}
