import fs from"node:fs";
import path from"node:path";
import{listFailureHistory}from"../../intelligence/history/failure-history.repository.js";
import{listProjectValidationEscalations}from"../../validation/escalation/validation-escalation.repository.js";

export function deliveryRepositoryAvailable(workspace:string){
 try{
  const resolved=path.resolve(workspace);
  return fs.existsSync(resolved)&&fs.statSync(resolved).isDirectory();
 }catch{
  return false;
 }
}

export function unresolvedProjectFailures(projectId:string){
 const records=listFailureHistory(projectId,10000);
 const latest=new Map<string,(typeof records)[number]>();
 for(const record of records){
  if(!latest.has(record.fingerprint))latest.set(record.fingerprint,record);
 }
 return[...latest.values()].filter(record=>
  record.outcome==="unresolved"||
  record.outcome==="regressed"||
  record.outcome==="blocked"
 );
}

export function unresolvedProjectEscalations(projectId:string){
 return listProjectValidationEscalations(projectId)
  .filter(item=>item.status==="open");
}

export function deliveryRuntimeAuthority(input:{
 projectId:string;
 workspace:string;
 totalWork:number;
 completedWork:number;
}){
 const failures=unresolvedProjectFailures(input.projectId);
 const escalations=unresolvedProjectEscalations(input.projectId);
 return{
  totalWork:input.totalWork,
  completedWork:input.completedWork,
  repositoryAvailable:deliveryRepositoryAvailable(input.workspace),
  unresolvedFailures:failures.length,
  unresolvedEscalations:escalations.length,
  failures,
  escalations
 };
}
