import {spawn} from "node:child_process";
import {sandboxEnvironment} from "./sandbox-environment.service.js";
import {sandboxPolicy} from "./sandbox-policy.service.js";
import {createSandboxExecution,updateSandboxExecution} from "./sandbox-registry.service.js";
import {registerSandboxProcess,unregisterSandboxProcess,terminateSandboxProcess} from "./sandbox-process-registry.service.js";
import type {SandboxHealth,SandboxResult,SandboxState} from "./sandbox.types.js";

const allowedCommands=new Set(["node","npm","npx","git"]);
const forbidden=["&&","||",";","|",">","<","..\\","../","rm -","rmdir","del ","format ","shutdown","reboot","powershell","cmd.exe","bash","sudo"];
const serverScripts=["run dev","run start","start","run serve","run watch"];

export interface SandboxStreamHandlers{
 stdout?:(text:string)=>void;
 stderr?:(text:string)=>void;
}

export function validateSandboxCommand(command:string,args:string[]){
 command=command.toLowerCase().trim();
 if(!allowedCommands.has(command))throw new Error(`Sandbox executable rejected: ${command}`);
 if(!Array.isArray(args)||args.some(value=>typeof value!=="string"))throw new Error("Invalid sandbox command arguments");
 const joined=args.join(" ").toLowerCase();
 if(command==="npm"&&serverScripts.some(value=>joined===value||joined.startsWith(`${value} `)))throw new Error(`Long-running command rejected: ${command} ${args.join(" ")}`);
 if(forbidden.some(value=>joined.includes(value)))throw new Error(`Unsafe sandbox command rejected: ${command} ${args.join(" ")}`);
}

function normalizeCommand(command:string,args:string[]){
 const normalized=command.toLowerCase().trim();
 if(process.platform!=="win32")return{executable:normalized,args,shell:false};
 if(normalized==="npm"||normalized==="npx"){
  const comspec=process.env.ComSpec||process.env.COMSPEC||"C:\\Windows\\System32\\cmd.exe";
  return{
   executable:comspec,
   args:["/d","/s","/c",`${normalized}.cmd`,...args],
   shell:false
  };
 }
 return{executable:normalized,args,shell:false};
}

export async function hostSandboxHealth():Promise<SandboxHealth>{
 return{
  provider:"host",
  available:true,
  isolated:false,
  message:"Restricted host execution available with process-tree containment. This provider is not an isolation boundary."
 };
}

export async function runHostSandbox(command:string,args:string[],cwd:string,taskId:string,projectId:string,handlers:SandboxStreamHandlers={}):Promise<SandboxResult>{
 command=command.toLowerCase().trim();
 validateSandboxCommand(command,args);
 const policy=sandboxPolicy();
 const execution=createSandboxExecution({taskId,projectId,workspace:cwd,provider:"host",command,args});
 updateSandboxExecution(execution.id,"running");
 const normalized=normalizeCommand(command,args);
 const started=Date.now();

 return await new Promise<SandboxResult>(resolve=>{
  let stdout="";
  let stderr="";
  let settled=false;
  let terminalState:SandboxState|null=null;
  let child:ReturnType<typeof spawn>;
  let timeout:ReturnType<typeof setTimeout>|undefined;

  const finish=(code:number)=>{
   if(settled)return;
   settled=true;
   if(timeout)clearTimeout(timeout);
   unregisterSandboxProcess(execution.id);
   const durationMs=Date.now()-started;
   const finalCode=terminalState?-1:code;
   updateSandboxExecution(execution.id,terminalState||finalCode===0?"completed":"failed",finalCode);
   resolve({
    code:finalCode,
    stdout,
    stderr,
    durationMs,
    sandboxId:execution.id,
    provider:"host",
    isolated:false
   });
  };

  try{
   child=spawn(normalized.executable,normalized.args,{
    cwd,
    env:sandboxEnvironment(),
    windowsHide:true,
    shell:normalized.shell,
    stdio:["ignore","pipe","pipe"]
   });
  }catch(error){
   stderr=`Failed to start ${command}: ${error instanceof Error?error.message:String(error)}`;
   handlers.stderr?.(`${stderr}\n`);
   updateSandboxExecution(execution.id,"failed",-1);
   resolve({
    code:-1,
    stdout,
    stderr,
    durationMs:Date.now()-started,
    sandboxId:execution.id,
    provider:"host",
    isolated:false
   });
   return;
  }

  registerSandboxProcess(execution.id,taskId,projectId,child);

  timeout=setTimeout(async()=>{
   if(settled)return;
   terminalState="timeout";
   const text=`Command exceeded ${policy.timeoutMs}ms execution limit.`;
   stderr=`${stderr}\n${text}`.trim();
   handlers.stderr?.(`${text}\n`);
   const termination=await terminateSandboxProcess(execution.id,"timeout");
   if(!termination?.terminated){
    const failure=`Unable to confirm process-tree termination${termination?.error?`: ${termination.error}`:"."}`;
    stderr=`${stderr}\n${failure}`.trim();
    handlers.stderr?.(`${failure}\n`);
   }
   setTimeout(()=>finish(-1),250);
  },policy.timeoutMs);

  child.stdout?.on("data",chunk=>{
   const text=chunk.toString();
   stdout=(stdout+text).slice(-50000);
   handlers.stdout?.(text);
  });

  child.stderr?.on("data",chunk=>{
   const text=chunk.toString();
   stderr=(stderr+text).slice(-50000);
   handlers.stderr?.(text);
  });

  child.once("error",error=>{
   const text=`Failed to start ${command}: ${error.message}`;
   stderr=`${stderr}\n${text}`.trim();
   handlers.stderr?.(`${text}\n`);
   finish(-1);
  });

  child.once("close",code=>finish(code??-1));
 });
}

export function markHostSandboxTerminated(sandboxId:string,state:"cancelled"|"failed"){
 updateSandboxExecution(sandboxId,state,-1);
}
