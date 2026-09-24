import{memory}from"../../database/database.js";
import{
 createRepositoryEvolutionEvent,
 latestRepositoryEvolutionSnapshot
}from"../../evolution/repository-evolution.repository.js";
import{
 findFailureHistory,
 listFailureHistory,
 upsertFailureHistory
}from"./failure-history.repository.js";
import type{
 FailureHistoryMatch,
 FailureHistoryState,
 FailureResolutionOutcome
}from"./failure-history.types.js";

export function rememberFailureResolution(input:{
 projectId:string;
 taskId?:string|null;
 fingerprint:string;
 failureKind:string;
 summary:string;
 rootCause?:string;
 relevantFiles?:string[];
 repairFiles?:string[];
 strategy?:string[];
 repairAttemptId?:string|null;
 verificationId?:string|null;
 beforeRunId?:string|null;
 afterRunId?:string|null;
 outcome:FailureResolutionOutcome;
 evidence?:string[];
 metadata?:Record<string,unknown>;
}){
 if(!input.fingerprint.trim())throw new Error("Failure fingerprint is required.");
 if(!input.summary.trim())throw new Error("Failure summary is required.");
 const snapshot=latestRepositoryEvolutionSnapshot(input.projectId);
 const event=snapshot?createRepositoryEvolutionEvent({
  projectId:input.projectId,
  taskId:input.taskId||null,
  snapshotId:snapshot.id,
  type:input.outcome==="resolved"?"repair":"decision",
  title:input.outcome==="resolved"?"Historical repair recorded":"Historical failure recorded",
  summary:input.summary,
  files:[...new Set([...(input.relevantFiles||[]),...(input.repairFiles||[])])].sort(),
  evidence:input.evidence||[],
  metadata:{
   fingerprint:input.fingerprint,
   failureKind:input.failureKind,
   outcome:input.outcome,
   repairAttemptId:input.repairAttemptId||null,
   verificationId:input.verificationId||null
  }
 }):null;
 const record=upsertFailureHistory({
  ...input,
  snapshotId:snapshot?.id||null,
  evolutionEventId:event?.id||null
 });
 memory(input.projectId,"failure_history",JSON.stringify({
  historyId:record.id,
  fingerprint:record.fingerprint,
  failureKind:record.failureKind,
  outcome:record.outcome,
  occurrences:record.occurrences,
  repairFiles:record.repairFiles
 }));
 return record;
}

export function recallFailureHistory(
 projectId:string,
 fingerprint:string
):FailureHistoryMatch|null{
 const record=findFailureHistory(projectId,fingerprint);
 if(!record)return null;
 return{
  record,
  exact:true,
  useful:record.outcome==="resolved"&&record.rootCause.length>0
 };
}

export function failureHistoryState(projectId:string):FailureHistoryState{
 const records=listFailureHistory(projectId,10000);
 return{
  projectId,
  total:records.length,
  resolved:records.filter(item=>item.outcome==="resolved").length,
  unresolved:records.filter(item=>item.outcome==="unresolved").length,
  regressed:records.filter(item=>item.outcome==="regressed").length,
  blocked:records.filter(item=>item.outcome==="blocked").length,
  records
 };
}

export function failureHistoryPrompt(projectId:string,limit=20){
 const records=listFailureHistory(projectId,limit);
 if(!records.length)return"HISTORICAL FAILURE INTELLIGENCE\nNo historical failures recorded.";
 return[
  "HISTORICAL FAILURE INTELLIGENCE",
  ...records.map(item=>[
   `[${item.outcome.toUpperCase()}] ${item.failureKind} — ${item.summary}`,
   `Fingerprint: ${item.fingerprint}`,
   item.rootCause?`Previous root cause: ${item.rootCause}`:"",
   item.repairFiles.length?`Previous repair files: ${item.repairFiles.join(", ")}`:"",
   item.strategy.length?`Previous strategy: ${item.strategy.join("; ")}`:"",
   `Occurrences: ${item.occurrences}`
  ].filter(Boolean).join("\n"))
 ].join("\n\n");
}
