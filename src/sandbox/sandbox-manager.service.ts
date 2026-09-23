import {dockerSandboxHealth} from "./docker-sandbox.service.js";
import {hostSandboxHealth,runHostSandbox,type SandboxStreamHandlers} from "./host-sandbox.service.js";
import {sandboxPolicy,sandboxPublicPolicy} from "./sandbox-policy.service.js";
import {sandboxRegistry,updateSandboxExecution} from "./sandbox-registry.service.js";
import {activeSandboxProcesses,terminateTaskSandboxes,terminateSandboxProcess} from "./sandbox-process-registry.service.js";
import type {ProcessTerminationReason} from "./process-control.service.js";

export async function sandboxHealth(){
 const policy=sandboxPolicy();
 return policy.provider==="docker"?dockerSandboxHealth():hostSandboxHealth();
}

export async function runSandboxCommand(command:string,args:string[],cwd:string,taskId:string,projectId:string,handlers:SandboxStreamHandlers={}){
 const policy=sandboxPolicy();
 if(policy.provider==="host")return runHostSandbox(command,args,cwd,taskId,projectId,handlers);
 const health=await dockerSandboxHealth();
 if(!health.available)throw new Error(`Docker sandbox unavailable: ${health.message}`);
 throw new Error("Docker sandbox execution is not available until Docker virtualization support is enabled.");
}

export async function cancelTaskSandboxes(taskId:string,action:ProcessTerminationReason="cancel"){
 const active=activeSandboxProcesses(taskId);
 const results=await terminateTaskSandboxes(taskId,action);
 for(const process of active){
  if(action==="cancel"||action==="pause")updateSandboxExecution(process.sandboxId,"cancelled",-1);
 }
 return{
  taskId,
  action,
  requested:active.length,
  terminated:results.filter(result=>result?.terminated).length,
  results
 };
}

export async function cancelAllSandboxes(action:ProcessTerminationReason="shutdown"){
 const active=activeSandboxProcesses();
 const results=await Promise.all(active.map(async process=>{
  try{
   const result=await terminateSandboxProcess(process.sandboxId,action);
   if(action==="cancel"||action==="pause"||action==="shutdown"){
    updateSandboxExecution(process.sandboxId,"cancelled",-1);
   }
   return{
    sandboxId:process.sandboxId,
    taskId:process.taskId,
    terminated:!!result?.terminated,
    result
   };
  }catch(error){
   return{
    sandboxId:process.sandboxId,
    taskId:process.taskId,
    terminated:false,
    error:error instanceof Error?error.message:String(error)
   };
  }
 }));
 return{
  action,
  requested:active.length,
  terminated:results.filter(result=>result.terminated).length,
  failed:results.filter(result=>!result.terminated).length,
  results
 };
}

export async function sandboxStatus(){
 return{
  policy:sandboxPublicPolicy(),
  health:await sandboxHealth(),
  processes:activeSandboxProcesses(),
  registry:sandboxRegistry()
 };
}
