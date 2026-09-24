import{db,memory}from"../database/database.js";
import{repairProject}from"../agent/repair.service.js";
import{applyDevelopment}from"../orchestration/pipeline.service.js";
import type{DevelopmentResult}from"../orchestration/pipeline.types.js";
import{
 createValidationRepairAttempt,
 getLatestDiagnosticRepairAttempt,
 listFingerprintValidationRepairs,
 setValidationRepairAttemptState
}from"./validation-repair.repository.js";
import{getRunValidationDiagnostic}from"./validation-diagnostic.repository.js";
import type{
 ValidationRepairAttempt,
 ValidationRepairDecision
}from"./validation-repair.types.js";

type RepairFn=(
 task:any,
 project:any,
 architecture:any,
 plan:any,
 failure:any,
 review?:any,
 diagnostic?:any,
 history?:any[]
)=>Promise<DevelopmentResult>;

type ApplyFn=(
 result:DevelopmentResult,
 task:any,
 project:any,
 plan?:any
)=>Promise<any>;

function runRow(runId:string){
 return db.prepare(`
  SELECT * FROM validation_runs WHERE id=?
 `).get(runId) as any;
}

function validationEvidence(runId:string){
 const rows=db.prepare(`
  SELECT *
  FROM validation_results
  WHERE run_id=?
  ORDER BY created_at ASC
 `).all(runId) as any[];
 const failure=rows.find(row=>
  String(row.status)==="failed"||
  (row.exit_code!==null&&Number(row.exit_code)!==0)
 )||null;
 return{
  success:false,
  runId,
  failure:failure?{
   id:String(failure.id),
   stage:String(failure.stage||""),
   command:String(failure.command||""),
   args:(()=>{
    try{return JSON.parse(String(failure.args_json||"[]"));}catch{return[];}
   })(),
   exitCode:failure.exit_code===null?null:Number(failure.exit_code),
   stdout:String(failure.stdout||""),
   stderr:String(failure.stderr||""),
   failureKind:String(failure.failure_kind||"unknown"),
   fingerprint:String(failure.fingerprint||"")
  }:null,
  results:rows
 };
}

function scopeFor(appliedSameFingerprint:number,confidence:string){
 if(appliedSameFingerprint>=2||confidence==="low")return"broad" as const;
 if(appliedSameFingerprint>=1||confidence==="medium")return"expanded" as const;
 return"focused" as const;
}

export function validationRepairDecision(runId:string):ValidationRepairDecision{
 const run=runRow(runId);
 if(!run)throw new Error(`Validation run not found: ${runId}`);
 const diagnostic=getRunValidationDiagnostic(runId);
 if(!diagnostic)
  throw new Error(`Validation run ${runId} has no diagnostic evidence.`);

 if(diagnostic.status==="blocked"){
  return{
   action:"blocked",
   reason:diagnostic.error||"Diagnostic evidence blocks source repair.",
   attempt:0,
   scope:"focused",
   previous:null
  };
 }

 if(!["diagnosed","reused"].includes(diagnostic.status)||!diagnostic.diagnostic){
  throw new Error(`Validation diagnostic ${diagnostic.id} is not ready for repair.`);
 }

 if(
  diagnostic.failureKind==="infrastructure"||
  diagnostic.failureKind==="timeout"
 ){
  return{
   action:"blocked",
   reason:`${diagnostic.failureKind} failures must be retried without source modification.`,
   attempt:0,
   scope:"focused",
   previous:null
  };
 }

 const previous=getLatestDiagnosticRepairAttempt(diagnostic.id);
 if(previous&&["pending","repairing","applied"].includes(previous.status)){
  return{
   action:"resume",
   reason:"Existing repair attempt must be resumed instead of duplicated.",
   attempt:previous.attempt,
   scope:previous.scope,
   previous
  };
 }

 const history=listFingerprintValidationRepairs(
  String(run.project_id),
  diagnostic.fingerprint,
  100
 );
 const applied=history.filter(item=>item.status==="applied").length;
 const attempt=(previous?.attempt||0)+1;
 const scope=scopeFor(
  applied,
  String(diagnostic.diagnostic.confidence||"low")
 );

 return{
  action:"repair",
  reason:"Diagnostic evidence is ready for targeted source repair.",
  attempt,
  scope,
  previous
 };
}

function repairHistory(projectId:string,fingerprint:string){
 return listFingerprintValidationRepairs(projectId,fingerprint,100).map(item=>({
  attempt:item.attempt,
  fingerprint:item.fingerprint,
  summary:item.repair?.summary||item.error||`Validation repair attempt ${item.attempt}`,
  files:item.files,
  validation:{
   success:item.status==="applied",
   failure:item.status==="failed"?{
    type:"repair",
    message:item.error||"Repair attempt failed.",
    fingerprint:item.fingerprint
   }:undefined
  }
 }));
}

export async function executeTargetedValidationRepair(input:{
 runId:string;
 task:any;
 project:any;
 architecture:any;
 plan:any;
 review?:any;
 repair?:RepairFn;
 apply?:ApplyFn;
}):Promise<ValidationRepairAttempt>{
 const run=runRow(input.runId);
 if(!run)throw new Error(`Validation run not found: ${input.runId}`);
 if(String(run.project_id)!==String(input.project.id))
  throw new Error(`Validation run ${input.runId} does not belong to project ${input.project.id}.`);
 if(run.task_id&&String(run.task_id)!==String(input.task.id))
  throw new Error(`Validation run ${input.runId} does not belong to task ${input.task.id}.`);

 const diagnostic=getRunValidationDiagnostic(input.runId);
 if(!diagnostic)
  throw new Error(`Validation run ${input.runId} has no diagnostic evidence.`);

 const decision=validationRepairDecision(input.runId);
 const diagnosticResult=diagnostic.diagnostic;

 if(decision.action!=="blocked"&&!diagnosticResult)
  throw new Error(`Validation diagnostic ${diagnostic.id} has no diagnostic result.`);

 if(decision.action==="blocked"){
  const blocked=createValidationRepairAttempt({
   runId:input.runId,
   diagnosticId:diagnostic.id,
   projectId:String(run.project_id),
   taskId:run.task_id?String(run.task_id):null,
   attempt:1,
   fingerprint:diagnostic.fingerprint,
   failureKind:diagnostic.failureKind,
   scope:"focused",
   status:"blocked"
  });
  return setValidationRepairAttemptState(blocked.id,"blocked",{
   error:decision.reason
  });
 }

 if(decision.action==="resume"&&decision.previous){
  return decision.previous;
 }

 const attempt=createValidationRepairAttempt({
  runId:input.runId,
  diagnosticId:diagnostic.id,
  projectId:String(run.project_id),
  taskId:run.task_id?String(run.task_id):null,
  attempt:decision.attempt,
  fingerprint:diagnostic.fingerprint,
  failureKind:diagnostic.failureKind,
  scope:decision.scope
 });

 setValidationRepairAttemptState(attempt.id,"repairing",{error:null});

 try{
  const repair=input.repair||repairProject;
  const apply=input.apply||applyDevelopment;
  const evidence=validationEvidence(input.runId);
  const history=repairHistory(
   String(run.project_id),
   diagnostic.fingerprint
  );

  const repairResult=await repair(
   input.task,
   input.project,
   input.architecture,
   input.plan,
   evidence,
   input.review,
   diagnosticResult!,
   history
  );

  if(!repairResult||!Array.isArray(repairResult.files))
   throw new Error("Repair agent returned an invalid development result.");


  await apply(
   repairResult,
   input.task,
   input.project,
   input.plan
  );

  const files=repairResult.files.map(file=>file.path);

  memory(
   String(run.project_id),
   "validation_repair",
   JSON.stringify({
    runId:input.runId,
    diagnosticId:diagnostic.id,
    fingerprint:diagnostic.fingerprint,
    attempt:decision.attempt,
    scope:decision.scope,
    files
   })
  );

  return setValidationRepairAttemptState(attempt.id,"applied",{
   repair:repairResult,
   files,
   error:null
  });
 }catch(error){
  const message=error instanceof Error?error.message:String(error);
  setValidationRepairAttemptState(attempt.id,"failed",{
   error:message
  });
  throw error;
 }
}



