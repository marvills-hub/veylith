import{memory}from"../database/database.js";
import{event}from"../core/telemetry.js";
import{captureRepositoryEvolution}from"./repository-evolution.service.js";
import{learnRepositoryConventions}from"../conventions/repository-convention.service.js";
import{rememberFailureResolution}from"../intelligence/history/failure-history.service.js";
import type{AgentRole}from"../team/team.types.js";

export interface RepositoryLearningSyncInput{
 projectId:string;
 taskId:string;
 workspace:string;
 role:AgentRole;
 summary?:string|null;
 files?:string[];
 evidence?:string[];
}

function evolutionType(role:AgentRole){
 if(role==="architect")return"architecture" as const;
 if(role==="developer")return"implementation" as const;
 if(role==="documentation")return"documentation" as const;
 if(role==="delivery")return"delivery" as const;
 if(role==="repair")return"repair" as const;
 if(role==="tester")return"test" as const;
 return"other" as const;
}

function repositoryChangingRole(role:AgentRole){
 return["developer","documentation","delivery"].includes(role);
}

export function synchronizeRepositoryLearning(input:RepositoryLearningSyncInput){
 if(!repositoryChangingRole(input.role)){
  return{
   checked:false,
   changed:false,
   snapshot:null,
   evolutionEvent:null,
   conventions:null
  };
 }
 const evolution=captureRepositoryEvolution({
  projectId:input.projectId,
  taskId:input.taskId,
  workspace:input.workspace,
  type:evolutionType(input.role),
  title:`${input.role} repository state`,
  summary:input.summary||`${input.role} work synchronized with repository evolution.`,
  evidence:input.evidence||[],
  metadata:{
   role:input.role,
   files:input.files||[]
  }
 });
 const conventions=evolution.changed
  ?learnRepositoryConventions({
    projectId:input.projectId,
    workspace:input.workspace
   })
  :null;
 memory(
  input.projectId,
  "repository_learning_sync",
  JSON.stringify({
   taskId:input.taskId,
   role:input.role,
   changed:evolution.changed,
   snapshotId:evolution.snapshot?.id||null,
   evolutionEventId:evolution.event?.id||null,
   conventionRefresh:Boolean(conventions)
  })
 );
 event(
  "repository.learning_synchronized",
  evolution.changed
   ?`Repository learning refreshed after ${input.role} work.`
   :`Repository unchanged after ${input.role} work.`,
  {
   taskId:input.taskId,
   projectId:input.projectId,
   component:"repository-learning",
   data:{
    role:input.role,
    changed:evolution.changed,
    snapshotId:evolution.snapshot?.id||null,
    evolutionEventId:evolution.event?.id||null
   }
  }
 );
 return{
  checked:true,
  changed:evolution.changed,
  snapshot:evolution.snapshot,
  evolutionEvent:evolution.event,
  conventions
 };
}

export function synchronizeRepairEvolution(input:{
 projectId:string;
 taskId:string;
 workspace:string;
 summary:string;
 files:string[];
 evidence?:string[];
}){
 const evolution=captureRepositoryEvolution({
  projectId:input.projectId,
  taskId:input.taskId,
  workspace:input.workspace,
  type:"repair",
  title:"Autonomous repair applied",
  summary:input.summary,
  evidence:input.evidence||[],
  metadata:{
   files:input.files
  }
 });
 const conventions=evolution.changed
  ?learnRepositoryConventions({
    projectId:input.projectId,
    workspace:input.workspace
   })
  :null;
 return{
  changed:evolution.changed,
  snapshot:evolution.snapshot,
  evolutionEvent:evolution.event,
  conventions
 };
}

export function rememberRecoveryOutcome(input:{
 projectId:string;
 taskId:string;
 fingerprint:string;
 failureKind?:string;
 summary:string;
 rootCause?:string;
 relevantFiles?:string[];
 repairFiles?:string[];
 strategy?:string[];
 outcome:"resolved"|"unresolved"|"regressed"|"blocked";
 evidence?:string[];
}){
 return rememberFailureResolution({
  projectId:input.projectId,
  taskId:input.taskId,
  fingerprint:input.fingerprint,
  failureKind:input.failureKind||"unknown",
  summary:input.summary,
  rootCause:input.rootCause||"",
  relevantFiles:input.relevantFiles||[],
  repairFiles:input.repairFiles||[],
  strategy:input.strategy||[],
  outcome:input.outcome,
  evidence:input.evidence||[]
 });
}
