import{db,memory}from"../database/database.js";
import{diagnoseFailure,type DiagnosticResult}from"../agent/diagnostic.service.js";
import{
 createValidationDiagnostic,
 getRunValidationDiagnostic,
 latestCompletedFingerprintDiagnostic,
 listFingerprintDiagnostics,
 setValidationDiagnosticState
}from"./validation-diagnostic.repository.js";
import type{DiagnosticDecision,ValidationDiagnostic}from"./validation-diagnostic.types.js";

function parse(value:any,fallback:any=null){
 if(value===null||value===undefined||value==="")return fallback;
 if(typeof value==="object")return value;
 try{return JSON.parse(String(value));}catch{return fallback;}
}

function runRow(runId:string){
 return db.prepare("SELECT * FROM validation_runs WHERE id=?").get(runId) as any;
}

function results(runId:string){
 return db.prepare(`
  SELECT *
  FROM validation_results
  WHERE run_id=?
  ORDER BY created_at ASC
 `).all(runId) as any[];
}

function failureResult(runId:string){
 const rows=results(runId);
 return rows.find(row=>String(row.status)==="failed"||Number(row.exit_code||0)!==0)||null;
}

function fingerprintFor(row:any){
 return String(row?.fingerprint||"").trim();
}

function failureKindFor(row:any){
 return String(row?.failure_kind||"unknown").trim()||"unknown";
}

function retryableFor(row:any){
 if(row?.retryable!==undefined&&row?.retryable!==null)
  return Boolean(Number(row.retryable));
 const kind=failureKindFor(row);
 return kind==="infrastructure"||kind==="timeout";
}

export function validationDiagnosticDecision(runId:string):DiagnosticDecision{
 const run=runRow(runId);
 if(!run)throw new Error(`Validation run not found: ${runId}`);
 const failure=failureResult(runId);
 if(!failure)throw new Error(`Validation run ${runId} has no failed validation evidence.`);
 const fingerprint=fingerprintFor(failure);
 if(!fingerprint)throw new Error(`Validation failure ${failure.id} has no deterministic fingerprint.`);
 const history=listFingerprintDiagnostics(String(run.project_id),fingerprint,100);
 const previous=latestCompletedFingerprintDiagnostic(String(run.project_id),fingerprint);
 const repeatedCount=history.filter(item=>item.status==="diagnosed"||item.status==="reused").length;
 const retryable=retryableFor(failure);

 if(retryable){
  return{
   action:"blocked",
   fingerprint,
   failureKind:failureKindFor(failure),
   repeatedCount,
   retryable:true,
   reason:"Retryable infrastructure failure should be retried before AI diagnosis.",
   previous
  };
 }

 if(previous?.diagnostic){
  return{
   action:"reuse",
   fingerprint,
   failureKind:failureKindFor(failure),
   repeatedCount,
   retryable:false,
   reason:"An evidence-equivalent failure fingerprint already has a completed diagnosis.",
   previous
  };
 }

 return{
  action:"diagnose",
  fingerprint,
  failureKind:failureKindFor(failure),
  repeatedCount,
  retryable:false,
  reason:"No completed diagnosis exists for this deterministic failure fingerprint.",
  previous:null
 };
}

function diagnosticValidation(runId:string){
 const run=runRow(runId);
 if(!run)throw new Error(`Validation run not found: ${runId}`);
 const rows=results(runId);
 const failure=failureResult(runId);
 if(!failure)throw new Error(`Validation run ${runId} has no failed validation evidence.`);
 return{
  success:false,
  runId,
  failure:{
   id:String(failure.id),
   stage:String(failure.stage||failure.command_id||"validation"),
   command:String(failure.command||""),
   args:parse(failure.args_json,[]),
   exitCode:Number(failure.exit_code||1),
   stdout:String(failure.stdout||""),
   stderr:String(failure.stderr||""),
   timedOut:Boolean(Number(failure.timed_out||0)),
   spawnError:failure.spawn_error?String(failure.spawn_error):null,
   failureKind:failureKindFor(failure),
   fingerprint:fingerprintFor(failure),
   retryable:retryableFor(failure)
  },
  results:rows.map(row=>({
   id:String(row.id),
   commandId:String(row.command_id||""),
   stage:String(row.stage||""),
   status:String(row.status||""),
   exitCode:Number(row.exit_code||0),
   stdout:String(row.stdout||""),
   stderr:String(row.stderr||""),
   failureKind:row.failure_kind?String(row.failure_kind):null,
   fingerprint:row.fingerprint?String(row.fingerprint):null
  }))
 };
}

export async function diagnoseValidationRun(input:{
 runId:string;
 task:any;
 project:any;
 architecture:any;
 plan:any;
 review?:any;
 diagnose?:typeof diagnoseFailure;
}):Promise<ValidationDiagnostic>{
 const run=runRow(input.runId);
 if(!run)throw new Error(`Validation run not found: ${input.runId}`);
 if(String(run.project_id)!==String(input.project.id))
  throw new Error(`Validation run ${input.runId} does not belong to project ${input.project.id}.`);
 if(run.task_id&&String(run.task_id)!==String(input.task.id))
  throw new Error(`Validation run ${input.runId} does not belong to task ${input.task.id}.`);

 const existing=getRunValidationDiagnostic(input.runId);
 if(existing&&["diagnosed","reused","blocked"].includes(existing.status))return existing;

 const decision=validationDiagnosticDecision(input.runId);
 const record=existing||createValidationDiagnostic({
  runId:input.runId,
  projectId:String(run.project_id),
  taskId:run.task_id?String(run.task_id):null,
  fingerprint:decision.fingerprint,
  failureKind:decision.failureKind,
  repeatedCount:decision.repeatedCount
 });

 if(decision.action==="blocked"){
  return setValidationDiagnosticState(record.id,"blocked",{
   repeatedCount:decision.repeatedCount,
   error:decision.reason
  });
 }

 if(decision.action==="reuse"&&decision.previous?.diagnostic){
  const reused:DiagnosticResult={
   ...decision.previous.diagnostic,
   fingerprint:decision.fingerprint,
   previousAttempts:[
    ...(decision.previous.diagnostic.previousAttempts||[]),
    `Diagnosis reused for repeated deterministic fingerprint ${decision.fingerprint}.`
   ]
  };
  memory(
   String(run.project_id),
   "diagnostic_reused",
   JSON.stringify({
    runId:input.runId,
    fingerprint:decision.fingerprint,
    sourceDiagnosticId:decision.previous.id
   })
  );
  return setValidationDiagnosticState(record.id,"reused",{
   repeatedCount:decision.repeatedCount,
   diagnostic:reused,
   error:null
  });
 }

 setValidationDiagnosticState(record.id,"diagnosing",{
  repeatedCount:decision.repeatedCount,
  error:null
 });

 try{
  const diagnose=input.diagnose||diagnoseFailure;
  const diagnostic=await diagnose(
   input.task,
   input.project,
   input.architecture,
   input.plan,
   diagnosticValidation(input.runId),
   input.review
  );
  const normalized:DiagnosticResult={
   ...diagnostic,
   fingerprint:decision.fingerprint
  };
  memory(
   String(run.project_id),
   "validation_diagnostic",
   JSON.stringify({
    runId:input.runId,
    fingerprint:decision.fingerprint,
    failureKind:decision.failureKind,
    repeatedCount:decision.repeatedCount,
    diagnostic:normalized
   })
  );
  return setValidationDiagnosticState(record.id,"diagnosed",{
   repeatedCount:decision.repeatedCount,
   diagnostic:normalized,
   error:null
  });
 }catch(error){
  const message=error instanceof Error?error.message:String(error);
  setValidationDiagnosticState(record.id,"pending",{
   repeatedCount:decision.repeatedCount,
   error:message
  });
  throw error;
 }
}

