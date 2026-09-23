import {randomUUID} from "node:crypto";
import type {SandboxExecution,SandboxProvider,SandboxState} from "./sandbox.types.js";
const executions=new Map<string,SandboxExecution>();
const activeByTask=new Map<string,Set<string>>();
export function createSandboxExecution(input:{taskId:string;projectId:string;workspace:string;provider:SandboxProvider;command:string;args:string[]}){
 const execution:SandboxExecution={
  id:`sbx_${randomUUID().replaceAll("-","").slice(0,16)}`,
  taskId:input.taskId,
  projectId:input.projectId,
  workspace:input.workspace,
  provider:input.provider,
  state:"starting",
  command:input.command,
  args:input.args,
  startedAt:new Date().toISOString(),
  finishedAt:null,
  durationMs:null,
  exitCode:null
 };
 executions.set(execution.id,execution);
 const ids=activeByTask.get(execution.taskId)||new Set<string>();
 ids.add(execution.id);
 activeByTask.set(execution.taskId,ids);
 return execution;
}
export function updateSandboxExecution(id:string,state:SandboxState,exitCode:number|null=null){
 const execution=executions.get(id);
 if(!execution)return;
 execution.state=state;
 execution.exitCode=exitCode;
 if(["completed","failed","cancelled","timeout"].includes(state)){
  execution.finishedAt=new Date().toISOString();
  execution.durationMs=Date.now()-new Date(execution.startedAt).getTime();
  const ids=activeByTask.get(execution.taskId);
  ids?.delete(id);
  if(ids?.size===0)activeByTask.delete(execution.taskId);
 }
}
export function sandboxExecution(id:string){return executions.get(id)||null;}
export function activeTaskSandboxes(taskId:string){
 return [...(activeByTask.get(taskId)||[])].map(id=>executions.get(id)).filter(Boolean);
}
export function sandboxRegistry(){
 const all=[...executions.values()];
 return{
  active:all.filter(item=>["starting","running"].includes(item.state)),
  recent:all.slice(-50).reverse()
 };
}
