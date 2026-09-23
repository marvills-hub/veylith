import {writeProjectFile} from "../runtime/filesystem.service.js";
import {runCommand} from "../runtime/command.service.js";
import type {DevelopmentResult} from "./pipeline.types.js";

export async function applyDevelopment(result:DevelopmentResult,task:any,project:any){
 if(!Array.isArray(result.files))throw new Error("Developer returned an invalid files collection.");
 for(const file of result.files){
  if(!file||typeof file.path!=="string"||typeof file.content!=="string")throw new Error("Developer returned an invalid file.");
  await writeProjectFile(project.workspace,file.path,file.content,task.id,project.id);
 }
}

export async function validateDevelopment(result:DevelopmentResult,task:any,project:any){
 if(!Array.isArray(result.commands)||!result.commands.length)throw new Error("Developer did not provide validation commands.");
 const results:any[]=[];
 for(const item of result.commands){
  if(!item||typeof item.command!=="string"||!Array.isArray(item.args))throw new Error("Developer returned an invalid command.");
  const execution=await runCommand(item.command,item.args,project.workspace,task.id,project.id);
  const record={
   command:item.command,
   args:item.args,
   purpose:item.purpose||null,
   code:execution.code,
   stdout:execution.stdout.slice(-6000),
   stderr:execution.stderr.slice(-6000)
  };
  results.push(record);
  if(execution.code!==0)return{success:false,results,failure:record};
 }
 return{success:true,results,failure:null};
}
