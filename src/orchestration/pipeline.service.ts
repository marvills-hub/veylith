import {writeProjectFile} from "../runtime/filesystem.service.js";
import {runCommand} from "../runtime/command.service.js";
import {assertSafeGeneratedFiles} from "../security/generated-file-policy.service.js";
import {securityAllowed,securityRejected} from "../security/security-telemetry.service.js";
import {analyzeRepository} from "../intelligence/repository-intelligence.service.js";
import {analyzeChange} from "../intelligence/change-analysis.service.js";
import {assertChangeSetSafe} from "../intelligence/change-guard.service.js";
import {event} from "../core/telemetry.js";
import type {DevelopmentPlan,DevelopmentResult} from "./pipeline.types.js";

export async function applyDevelopment(result:DevelopmentResult,task:any,project:any,plan?:DevelopmentPlan){
 if(!Array.isArray(result.files))throw new Error("Developer returned an invalid files collection.");
 for(const file of result.files){
  if(!file||typeof file.path!=="string"||typeof file.content!=="string")throw new Error("Developer returned an invalid file.");
 }
 try{
  assertSafeGeneratedFiles(project.workspace,result.files);
  securityAllowed("Development file set accepted",task.id,project.id,{files:result.files.length});
 }catch(error){
  securityRejected("Development file set rejected",error,task.id,project.id,{files:result.files.length});
  throw error;
 }
 const profile=await analyzeRepository(project.workspace);
 const analysis=analyzeChange(profile,task.prompt);
 let changeValidation;
 try{
  changeValidation=assertChangeSetSafe(profile,analysis,plan,result);
  event("change.accepted","Change-aware guard accepted implementation",{
   taskId:task.id,
   projectId:project.id,
   data:{
    repositoryMode:analysis.repositoryMode,
    intent:analysis.intent,
    risk:analysis.risk,
    totalChanges:changeValidation.totalChanges,
    created:changeValidation.created,
    modified:changeValidation.modified,
    unplanned:changeValidation.unplanned,
    changes:changeValidation.changes
   }
  });
 }catch(error){
  event("change.rejected","Change-aware guard rejected implementation",{
   taskId:task.id,
   projectId:project.id,
   level:"error",
   data:{
    repositoryMode:analysis.repositoryMode,
    intent:analysis.intent,
    risk:analysis.risk,
    error:error instanceof Error?error.message:String(error)
   }
  });
  throw error;
 }
 for(const file of result.files){
  await writeProjectFile(project.workspace,file.path,file.content,task.id,project.id);
 }
}

export async function validateDevelopment(result:DevelopmentResult,task:any,project:any){
 if(!Array.isArray(result.commands)||!result.commands.length)throw new Error("Developer did not provide validation commands.");
 const results:any[]=[];
 for(const item of result.commands){
  if(!item||typeof item.command!=="string"||!Array.isArray(item.args)){
   const record={
    command:String(item?.command||"unknown"),
    args:Array.isArray(item?.args)?item.args:[],
    purpose:item?.purpose||null,
    code:-1,
    stdout:"",
    stderr:"Developer returned an invalid validation command."
   };
   results.push(record);
   return{success:false,results,failure:record};
  }
  let execution:{code:number;stdout:string;stderr:string};
  try{
   execution=await runCommand(item.command,item.args,project.workspace,task.id,project.id);
  }catch(error){
   execution={
    code:-1,
    stdout:"",
    stderr:`Validation runtime error: ${error instanceof Error?error.message:String(error)}`
   };
  }
  const record={
   command:item.command,
   args:item.args,
   purpose:item.purpose||null,
   code:execution.code,
   stdout:execution.stdout.slice(-6000),
   stderr:execution.stderr.slice(-6000)
  };
  results.push(record);
  if(execution.code!==0){
   return{success:false,results,failure:record};
  }
 }
 return{success:true,results,failure:null};
}
