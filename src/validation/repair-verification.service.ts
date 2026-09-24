import{db,memory}from"../database/database.js";
import{getValidationRepairAttempt}from"./validation-repair.repository.js";
import{
 createRepairVerification,
 completeRepairVerification,
 getRepairAttemptVerification
}from"./repair-verification.repository.js";
import type{
 RepairVerificationAnalysis
}from"./repair-verification.types.js";

interface Evidence{
 id:string;
 commandId:string;
 stage:string;
 status:string;
 fingerprint:string|null;
}

function run(runId:string){
 return db.prepare(`
  SELECT * FROM validation_runs WHERE id=?
 `).get(runId) as any;
}

function evidence(runId:string):Evidence[]{
 return(db.prepare(`
  SELECT *
  FROM validation_results
  WHERE run_id=?
  ORDER BY created_at ASC
 `).all(runId) as any[]).map(row=>({
  id:String(row.id),
  commandId:String(row.command_id||row.stage||row.command||row.id),
  stage:String(row.stage||"unknown"),
  status:String(row.status||""),
  fingerprint:row.fingerprint?String(row.fingerprint):null
 }));
}

function key(item:Evidence){
 return item.commandId;
}

export function analyzeRepairVerification(
 beforeRunId:string,
 afterRunId:string,
 originalFingerprint:string
):RepairVerificationAnalysis{
 const before=evidence(beforeRunId);
 const after=evidence(afterRunId);

 if(!before.length)
  throw new Error(`Before validation run ${beforeRunId} has no evidence.`);
 if(!after.length)
  throw new Error(`After validation run ${afterRunId} has no evidence.`);

 const beforePassing=before
  .filter(item=>item.status==="passed")
  .map(key);

 const afterPassing=after
  .filter(item=>item.status==="passed")
  .map(key);

 const afterFailures=after
  .filter(item=>item.status==="failed")
  .map(item=>item.fingerprint||key(item));

 const originalResolved=!after.some(item=>
  item.status==="failed"&&
  item.fingerprint===originalFingerprint
 );

 const afterByKey=new Map(
  after.map(item=>[key(item),item])
 );

 const regressions=beforePassing.filter(commandId=>{
  const result=afterByKey.get(commandId);
  return !result||result.status!=="passed";
 });

 return{
  originalResolved,
  regressionFree:regressions.length===0,
  regressions,
  beforePassing,
  afterPassing,
  afterFailures
 };
}

export function verifyValidationRepair(input:{
 repairAttemptId:string;
 afterRunId:string;
}){
 const repair=getValidationRepairAttempt(input.repairAttemptId);

 if(!repair)
  throw new Error(
   `Validation repair attempt not found: ${input.repairAttemptId}`
  );

 if(repair.status!=="applied")
  throw new Error(
   `Validation repair ${repair.id} is not applied and cannot be verified.`
  );

 const beforeRun=run(repair.runId);
 const afterRun=run(input.afterRunId);

 if(!beforeRun)
  throw new Error(`Before validation run not found: ${repair.runId}`);

 if(!afterRun)
  throw new Error(`After validation run not found: ${input.afterRunId}`);

 if(String(beforeRun.project_id)!==repair.projectId)
  throw new Error("Repair project does not match before validation run.");

 if(String(afterRun.project_id)!==repair.projectId)
  throw new Error("After validation run belongs to a different project.");

 if(
  repair.taskId&&
  afterRun.task_id&&
  String(afterRun.task_id)!==repair.taskId
 ){
  throw new Error("After validation run belongs to a different task.");
 }

 const existing=getRepairAttemptVerification(repair.id);
 if(existing&&existing.status!=="pending")
  return existing;

 const verification=existing||createRepairVerification({
  repairAttemptId:repair.id,
  projectId:repair.projectId,
  taskId:repair.taskId,
  beforeRunId:repair.runId,
  afterRunId:input.afterRunId,
  originalFingerprint:repair.fingerprint
 });

 const analysis=analyzeRepairVerification(
  repair.runId,
  input.afterRunId,
  repair.fingerprint
 );

 let status:"verified"|"regressed"|"failed";

 if(!analysis.originalResolved){
  status="failed";
 }else if(!analysis.regressionFree){
  status="regressed";
 }else{
  status="verified";
 }

 const summary=
  status==="verified"
   ?"Original validation failure resolved with no regression."
   :status==="regressed"
    ?`Original failure resolved but ${analysis.regressions.length} previously passing validation check(s) regressed.`
    :"Original validation failure remains after repair.";

 const completed=completeRepairVerification(
  verification.id,
  {
   status,
   originalResolved:analysis.originalResolved,
   regressionFree:analysis.regressionFree,
   regressions:analysis.regressions,
   beforePassing:analysis.beforePassing,
   afterPassing:analysis.afterPassing,
   afterFailures:analysis.afterFailures,
   summary
  }
 );

 memory(
  repair.projectId,
  "repair_verification",
  JSON.stringify({
   repairAttemptId:repair.id,
   beforeRunId:repair.runId,
   afterRunId:input.afterRunId,
   status,
   originalFingerprint:repair.fingerprint,
   originalResolved:analysis.originalResolved,
   regressionFree:analysis.regressionFree,
   regressions:analysis.regressions,
   afterFailures:analysis.afterFailures
  })
 );

 return completed;
}
