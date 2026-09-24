import crypto from"node:crypto";
import type{
 ValidationFailureClassification
}from"./validation-evidence.types.js";
import type{ValidationStage}from"./validation-strategy.types.js";

function clean(value:string){
 return value
  .replace(/\x1b\[[0-9;]*m/g,"")
  .replace(/[A-Za-z]:\\[^\s:]+/g,"<path>")
  .replace(/\/[^\s:]+/g,"<path>")
  .replace(/\b\d+(?:\.\d+)?(?:ms|s)?\b/g,"<n>")
  .replace(/\s+/g," ")
  .trim()
  .toLowerCase();
}

function fingerprint(
 stage:ValidationStage,
 kind:string,
 output:string
){
 const normalized=clean(output).slice(0,4000);
 return crypto
  .createHash("sha256")
  .update(`${stage}\n${kind}\n${normalized}`)
  .digest("hex")
  .slice(0,24);
}

function result(
 stage:ValidationStage,
 kind:ValidationFailureClassification["kind"],
 reason:string,
 retryable:boolean,
 output:string
):ValidationFailureClassification{
 return{
  kind,
  reason,
  retryable,
  fingerprint:fingerprint(stage,kind,output)
 };
}

export function classifyValidationFailure(input:{
 stage:ValidationStage;
 exitCode:number|null;
 stdout?:string;
 stderr?:string;
 timedOut?:boolean;
 spawnError?:string|null;
}):ValidationFailureClassification{
 const stdout=input.stdout??"";
 const stderr=input.stderr??"";
 const output=`${stderr}\n${stdout}`.trim();
 const lower=output.toLowerCase();

 if(input.timedOut){
  return result(
   input.stage,
   "timeout",
   "Validation command exceeded its execution deadline.",
   true,
   output||"timeout"
  );
 }

 if(input.spawnError){
  return result(
   input.stage,
   "infrastructure",
   "Validation command could not be started.",
   true,
   input.spawnError
  );
 }

 if(
  /econnreset|econnrefused|etimedout|enotfound|network error|socket hang up/.test(lower)
 ){
  return result(
   input.stage,
   "infrastructure",
   "Validation failed because of a transient network or runtime infrastructure error.",
   true,
   output
  );
 }

 if(
  /npm err! code e(?:404|401|403)|unable to resolve dependency tree|eresolve|could not resolve dependency|module not found|cannot find module|failed to resolve import/.test(lower)
 ){
  return result(
   input.stage,
   "dependency",
   "Validation failed because a required dependency could not be installed or resolved.",
   false,
   output
  );
 }

 if(input.stage==="build"){
  return result(
   input.stage,
   "build",
   "Repository build failed.",
   false,
   output
  );
 }

 if(input.stage==="typecheck"){
  return result(
   input.stage,
   "typecheck",
   "Static type validation failed.",
   false,
   output
  );
 }

 if(input.stage==="lint"){
  return result(
   input.stage,
   "lint",
   "Lint validation failed.",
   false,
   output
  );
 }

 if(input.stage==="test"){
  return result(
   input.stage,
   "test",
   "Automated tests failed.",
   false,
   output
  );
 }

 if(input.exitCode!==0){
  return result(
   input.stage,
   "command",
   "Validation command returned a non-zero exit code.",
   false,
   output
  );
 }

 return result(
  input.stage,
  "unknown",
  "Validation failure could not be classified.",
  false,
  output
 );
}
