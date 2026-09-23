export type SandboxProvider="host"|"docker";
export type SandboxState="starting"|"running"|"completed"|"failed"|"cancelled"|"timeout";
export interface SandboxPolicy{
 provider:SandboxProvider;
 image:string;
 timeoutMs:number;
 memoryMb:number;
 cpus:number;
 pidsLimit:number;
 network:boolean;
 readOnlyRoot:boolean;
 nonRoot:boolean;
}
export interface SandboxExecution{
 id:string;
 taskId:string;
 projectId:string;
 workspace:string;
 provider:SandboxProvider;
 state:SandboxState;
 command:string;
 args:string[];
 startedAt:string;
 finishedAt:string|null;
 durationMs:number|null;
 exitCode:number|null;
}
export interface SandboxResult{
 code:number;
 stdout:string;
 stderr:string;
 durationMs:number;
 sandboxId:string;
 provider:SandboxProvider;
 isolated:boolean;
}
export interface SandboxHealth{
 provider:SandboxProvider;
 available:boolean;
 isolated:boolean;
 message:string;
}
