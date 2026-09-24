import{db,memory}from"../../database/database.js";
import{MAX_REPAIR_ATTEMPTS}from"../../config/config.js";
import{
 createValidationEscalation,
 getOpenValidationEscalation
}from"./validation-escalation.repository.js";
import type{
 EscalationDecision,
 ValidationEscalationReason
}from"./validation-escalation.types.js";

const UNCHANGED_FAILURE_LIMIT=3;
const REGRESSION_LIMIT=2;

function scalar(sql:string,args:any[]){
 const row=db.prepare(sql).get(...args) as any;
 return Number(row?.total||0);
}

function latestFailure(projectId:string,taskId:string|null){
 return db.prepare(`
  SELECT vr.*
  FROM validation_results vr
  JOIN validation_runs r ON r.id=vr.run_id
  WHERE r.project_id=?
   AND COALESCE(r.task_id,'')=COALESCE(?,'')
   AND vr.status='failed'
  ORDER BY vr.created_at DESC
  LIMIT 1
 `).get(projectId,taskId) as any;
}

function latestRun(projectId:string,taskId:string|null){
 return db.prepare(`
  SELECT *
  FROM validation_runs
  WHERE project_id=?
   AND COALESCE(task_id,'')=COALESCE(?,'')
  ORDER BY created_at DESC
  LIMIT 1
 `).get(projectId,taskId) as any;
}

function repairAttempts(
 projectId:string,
 taskId:string|null,
 fingerprint:string|null
){
 if(fingerprint){
  return scalar(`
   SELECT COUNT(*) total
   FROM validation_repair_attempts
   WHERE project_id=?
    AND COALESCE(task_id,'')=COALESCE(?,'')
    AND fingerprint=?
    AND status IN('applied','failed')
  `,[projectId,taskId,fingerprint]);
 }

 return scalar(`
  SELECT COUNT(*) total
  FROM validation_repair_attempts
  WHERE project_id=?
   AND COALESCE(task_id,'')=COALESCE(?,'')
   AND status IN('applied','failed')
 `,[projectId,taskId]);
}

function unchangedFailures(
 projectId:string,
 taskId:string|null,
 fingerprint:string|null
){
 if(!fingerprint)return 0;

 return scalar(`
  SELECT COUNT(*) total
  FROM validation_results vr
  JOIN validation_runs r ON r.id=vr.run_id
  WHERE r.project_id=?
   AND COALESCE(r.task_id,'')=COALESCE(?,'')
   AND vr.status='failed'
   AND vr.fingerprint=?
 `,[projectId,taskId,fingerprint]);
}

function regressionCount(
 projectId:string,
 taskId:string|null
){
 return scalar(`
  SELECT COUNT(*) total
  FROM repair_verifications
  WHERE project_id=?
   AND COALESCE(task_id,'')=COALESCE(?,'')
   AND status='regressed'
 `,[projectId,taskId]);
}

function blockedFailureKind(kind:string|null){
 return kind==="infrastructure"||
  kind==="timeout";
}

export function evaluateValidationEscalation(input:{
 projectId:string;
 taskId?:string|null;
 providerBlocked?:boolean;
}):EscalationDecision{
 const taskId=input.taskId||null;

 if(input.providerBlocked){
  return{
   action:"blocked",
   reason:"provider_blocked",
   severity:"blocked",
   repairAttempts:0,
   unchangedFailures:0,
   regressions:0,
   summary:"AI provider is unavailable; source repair is suspended."
  };
 }

 const failure=latestFailure(input.projectId,taskId);
 const run=latestRun(input.projectId,taskId);

 if(!failure){
  return{
   action:"continue",
   reason:null,
   severity:null,
   repairAttempts:0,
   unchangedFailures:0,
   regressions:0,
   summary:"No unresolved validation failure requires escalation."
  };
 }

 const fingerprint=failure.fingerprint
  ?String(failure.fingerprint)
  :null;

 const failureKind=failure.failure_kind
  ?String(failure.failure_kind)
  :null;

 const attempts=repairAttempts(
  input.projectId,
  taskId,
  fingerprint
 );

 const unchanged=unchangedFailures(
  input.projectId,
  taskId,
  fingerprint
 );

 const regressions=regressionCount(
  input.projectId,
  taskId
 );

 if(blockedFailureKind(failureKind)){
  return{
   action:"blocked",
   reason:"infrastructure_blocked",
   severity:"blocked",
   repairAttempts:attempts,
   unchangedFailures:unchanged,
   regressions,
   summary:`Validation is blocked by ${failureKind}; source repair is suppressed.`
  };
 }

 if(attempts>=MAX_REPAIR_ATTEMPTS){
  return{
   action:"escalate",
   reason:"repair_budget_exhausted",
   severity:"terminal",
   repairAttempts:attempts,
   unchangedFailures:unchanged,
   regressions,
   summary:`Repair budget exhausted after ${attempts} attempt(s).`
  };
 }

 if(unchanged>=UNCHANGED_FAILURE_LIMIT){
  return{
   action:"escalate",
   reason:"unchanged_failure_loop",
   severity:"terminal",
   repairAttempts:attempts,
   unchangedFailures:unchanged,
   regressions,
   summary:`Failure fingerprint persisted across ${unchanged} validation failure(s).`
  };
 }

 if(regressions>=REGRESSION_LIMIT){
  return{
   action:"escalate",
   reason:"regression_loop",
   severity:"terminal",
   repairAttempts:attempts,
   unchangedFailures:unchanged,
   regressions,
   summary:`Repair cycle introduced regressions ${regressions} time(s).`
  };
 }

 return{
  action:"continue",
  reason:null,
  severity:null,
  repairAttempts:attempts,
  unchangedFailures:unchanged,
  regressions,
  summary:"Repair remains within autonomous recovery limits."
 };
}

export function enforceValidationEscalation(input:{
 projectId:string;
 taskId?:string|null;
 providerBlocked?:boolean;
}){
 const taskId=input.taskId||null;
 const decision=evaluateValidationEscalation(input);

 if(decision.action==="continue")return{
  decision,
  escalation:null
 };

 const failure=latestFailure(input.projectId,taskId);
 const run=latestRun(input.projectId,taskId);

 const fingerprint=failure?.fingerprint
  ?String(failure.fingerprint)
  :null;

 const reason=decision.reason as ValidationEscalationReason;

 const existing=getOpenValidationEscalation(
  input.projectId,
  taskId,
  reason,
  fingerprint
 );

 const escalation=existing||createValidationEscalation({
  projectId:input.projectId,
  taskId,
  runId:run?.id?String(run.id):null,
  reason,
  severity:decision.severity!,
  fingerprint,
  repairAttempts:decision.repairAttempts,
  unchangedFailures:decision.unchangedFailures,
  regressions:decision.regressions,
  summary:decision.summary,
  metadata:{
   providerBlocked:Boolean(input.providerBlocked),
   failureKind:failure?.failure_kind||null
  }
 });

 if(!existing){
  memory(
   input.projectId,
   "validation_escalation",
   JSON.stringify({
    escalationId:escalation.id,
    taskId,
    reason:escalation.reason,
    severity:escalation.severity,
    fingerprint:escalation.fingerprint,
    repairAttempts:escalation.repairAttempts,
    unchangedFailures:escalation.unchangedFailures,
    regressions:escalation.regressions
   })
  );
 }

 return{
  decision,
  escalation
 };
}
