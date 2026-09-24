import fs from "node:fs";
import {db} from "../dist/database/database.js";
import {
 getAssignmentRoleResult,
 listGoalRoleResults,
 deleteGoalRoleResults
} from "../dist/team/goal-role-executor.service.js";

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
 const worker=fs.readFileSync(
  new URL("../src/jobs/job-runner.service.ts",import.meta.url),
  "utf8"
 );
 const executor=fs.readFileSync(
  new URL("../src/team/goal-role-executor.service.ts",import.meta.url),
  "utf8"
 );

 const checks=[
  ["worker detects graph managed tasks",worker.includes("isGoalManagedTask(task.id)")],
  ["worker routes graph tasks to team executor",worker.includes("await executeGoalTeamTask(task)")],
  ["legacy tasks retain executeTask path",worker.includes("await executeTask(task)")],
  ["worker preserves job completion",worker.includes("completeJob(job.id,owner)")],
  ["worker preserves failure classifier",worker.includes("classifyJobFailure(error,currentTask)")],
  ["worker preserves provider retry wait",worker.includes('classification.kind==="provider_retryable"')],
  ["worker preserves attempt consumption",worker.includes("consumeJobAttempt(job.id,owner)")],
  ["worker preserves retry backoff",worker.includes("requeueJob(job.id,delay,message)")],
  ["worker preserves heartbeat",worker.includes("heartbeatJob(job.id,owner)")],
  ["worker preserves sandbox cancellation",worker.includes("cancelTaskSandboxes")],
  ["terminal graph failure synchronizes DAG",worker.includes('failGoalTaskExecution(job.task_id,"failed")')],
  ["role executor prepares graph execution",executor.includes("prepareGoalTaskExecution(task.id)")],
  ["role executor builds shared context",executor.includes("buildSharedProjectContext")],
  ["shared context injected into role prompt",executor.includes("VEYLITH SHARED PROJECT CONTEXT:")],
  ["incoming handoffs consumed",executor.includes("consumeIncomingHandoffs")],
  ["architect routed",executor.includes('case "architect"')],
  ["planner routed",executor.includes('case "planner"')],
  ["developer routed",executor.includes('case "developer"')],
  ["tester routed",executor.includes('case "tester"')],
  ["reviewer routed",executor.includes('case "reviewer"')],
  ["documentation routed",executor.includes('case "documentation"')],
  ["delivery routed",executor.includes('case "delivery"')],
  ["architect uses existing architect agent",executor.includes("designArchitecture(task,projectRow)")],
  ["planner uses existing development planner",executor.includes("createDevelopmentPlan")],
  ["developer uses existing developer agent",executor.includes("developProject")],
  ["developer uses protected development writer",executor.includes("applyDevelopment")],
  ["tester uses existing validation pipeline",executor.includes("validateDevelopment")],
  ["reviewer uses existing reviewer",executor.includes("reviewProject")],
  ["delivery uses existing git initialization",executor.includes("initializeGit")],
  ["delivery uses existing GitHub publisher",executor.includes("publishToGitHub")],
  ["role result table exists",executor.includes("CREATE TABLE IF NOT EXISTS goal_role_results")],
  ["role result assignment uniqueness exists",executor.includes("UNIQUE(assignment_id)")],
  ["completed role result reusable",executor.includes('if(roleResult.status==="completed")')],
  ["role result persisted to project memory",executor.includes('"team_role_result"')],
  ["dependency handoffs generated",executor.includes("createDependencyHandoffs")],
  ["graph completion advances next work",executor.includes("completeGoalTaskExecution(task.id)")],
  ["diagnostic role protected",executor.includes('case "diagnostic"')],
  ["repair role protected",executor.includes('case "repair"')]
 ];

 for(const [name,condition] of checks)check(name,condition);

 const stamp=Date.now();
 const id=`rrs_regression_${stamp}`;
 const goalId=`goal_regression_${stamp}`;
 const assignmentId=`assignment_regression_${stamp}`;
 const time=new Date().toISOString();

 db.prepare(`
  INSERT INTO goal_role_results(
   id,goal_id,project_id,work_item_id,assignment_id,task_id,
   role,status,summary,result_json,error,started_at,completed_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,'completed',?,?,NULL,?,?,?)
 `).run(
  id,goalId,`project_${stamp}`,`work_${stamp}`,assignmentId,`task_${stamp}`,
  "architect","Architecture complete",
  JSON.stringify({
   architecture:{
    summary:"Architecture complete",
    stack:["TypeScript"],
    structure:["src"],
    decisions:["Keep modules separated"],
    risks:[]
   }
  }),
  time,time,time
 );

 const persisted=getAssignmentRoleResult(assignmentId);
 check("persistent role result reloads",Boolean(persisted));
 check("persistent role retained",persisted?.role==="architect");
 check("persistent status retained",persisted?.status==="completed");
 check("persistent JSON retained",persisted?.result?.architecture?.stack?.[0]==="TypeScript");
 check("goal role result list reloads",listGoalRoleResults(goalId).length===1);

 deleteGoalRoleResults(goalId);
 check("role result cleanup persisted",listGoalRoleResults(goalId).length===0);
}catch(error){
 failed++;
 console.error(error);
}

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 2 PASS 5");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("\nVEYLITH v1.0 BATCH 2 PASS 5 PASSED");
}else{
 console.error("\nVEYLITH v1.0 BATCH 2 PASS 5 FAILED");
 process.exitCode=1;
}
