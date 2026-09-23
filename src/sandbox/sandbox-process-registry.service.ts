import type {ChildProcess} from "node:child_process";
import {terminateProcessTree,type ProcessTerminationReason} from "./process-control.service.js";

interface ActiveProcess{
 taskId:string;
 projectId:string;
 sandboxId:string;
 child:ChildProcess;
 cancelling:boolean;
}

const processes=new Map<string,ActiveProcess>();
const byTask=new Map<string,Set<string>>();

export function registerSandboxProcess(sandboxId:string,taskId:string,projectId:string,child:ChildProcess){
 processes.set(sandboxId,{taskId,projectId,sandboxId,child,cancelling:false});
 const ids=byTask.get(taskId)||new Set<string>();
 ids.add(sandboxId);
 byTask.set(taskId,ids);
}

export function unregisterSandboxProcess(sandboxId:string){
 const process=processes.get(sandboxId);
 if(!process)return;
 processes.delete(sandboxId);
 const ids=byTask.get(process.taskId);
 ids?.delete(sandboxId);
 if(ids?.size===0)byTask.delete(process.taskId);
}

export function activeSandboxProcesses(taskId?:string){
 const values=[...processes.values()];
 return values
  .filter(item=>!taskId||item.taskId===taskId)
  .map(item=>({
   sandboxId:item.sandboxId,
   taskId:item.taskId,
   projectId:item.projectId,
   pid:item.child.pid??null,
   cancelling:item.cancelling
  }));
}

export async function terminateSandboxProcess(sandboxId:string,reason:ProcessTerminationReason){
 const process=processes.get(sandboxId);
 if(!process)return null;
 if(process.cancelling)return null;
 process.cancelling=true;
 return await terminateProcessTree(process.child,reason);
}

export async function terminateTaskSandboxes(taskId:string,reason:ProcessTerminationReason){
 const ids=[...(byTask.get(taskId)||[])];
 return await Promise.all(ids.map(id=>terminateSandboxProcess(id,reason)));
}
