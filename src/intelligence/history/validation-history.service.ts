import type{FailureResolutionOutcome}from"./failure-history.types.js";
import{rememberFailureResolution}from"./failure-history.service.js";

function parse(value:any,fallback:any){
 if(value===null||value===undefined)return fallback;
 if(typeof value!=="string")return value;
 try{return JSON.parse(value);}catch{return fallback;}
}

export function recordValidationFailureHistory(input:{
 projectId:string;
 taskId?:string|null;
 fingerprint:string;
 failureKind:string;
 summary:string;
 diagnostic?:{
  summary?:string;
  rootCause?:string;
  relevantFiles?:string[];
  strategy?:string[];
  evidence?:string[];
 };
 repair?:{
  id?:string;
  files?:string[];
 };
 verification?:{
  id?:string;
  beforeRunId?:string;
  afterRunId?:string;
  status?:string;
  originalResolved?:boolean;
  regressionFree?:boolean;
 };
 blocked?:boolean;
}){
 let outcome:FailureResolutionOutcome="unresolved";
 if(input.blocked)outcome="blocked";
 else if(input.verification){
  if(input.verification.originalResolved&&input.verification.regressionFree)outcome="resolved";
  else if(input.verification.originalResolved&&!input.verification.regressionFree)outcome="regressed";
 }
 return rememberFailureResolution({
  projectId:input.projectId,
  taskId:input.taskId,
  fingerprint:input.fingerprint,
  failureKind:input.failureKind,
  summary:input.summary,
  rootCause:input.diagnostic?.rootCause||input.diagnostic?.summary||"",
  relevantFiles:parse(input.diagnostic?.relevantFiles,[]),
  repairFiles:parse(input.repair?.files,[]),
  strategy:parse(input.diagnostic?.strategy,[]),
  repairAttemptId:input.repair?.id||null,
  verificationId:input.verification?.id||null,
  beforeRunId:input.verification?.beforeRunId||null,
  afterRunId:input.verification?.afterRunId||null,
  outcome,
  evidence:parse(input.diagnostic?.evidence,[])
 });
}

