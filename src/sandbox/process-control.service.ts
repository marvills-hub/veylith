import {spawn,type ChildProcess} from "node:child_process";

export type ProcessTerminationReason="cancel"|"pause"|"timeout"|"shutdown";

export interface ProcessTerminationResult{
 pid:number|null;
 reason:ProcessTerminationReason;
 terminated:boolean;
 method:string;
 error:string|null;
}

function waitForExit(child:ChildProcess,timeoutMs:number){
 return new Promise<boolean>(resolve=>{
  if(child.exitCode!==null||child.signalCode!==null)return resolve(true);
  let settled=false;
  const done=(value:boolean)=>{
   if(settled)return;
   settled=true;
   clearTimeout(timer);
   child.removeListener("exit",onExit);
   resolve(value);
  };
  const onExit=()=>done(true);
  const timer=setTimeout(()=>done(false),timeoutMs);
  child.once("exit",onExit);
 });
}

function taskkill(pid:number,force:boolean){
 return new Promise<{ok:boolean;error:string|null}>(resolve=>{
  const args=["/pid",String(pid),"/t"];
  if(force)args.push("/f");
  const child=spawn("taskkill",args,{windowsHide:true,shell:false,stdio:["ignore","ignore","pipe"]});
  let stderr="";
  child.stderr?.on("data",chunk=>stderr+=chunk.toString());
  child.once("error",error=>resolve({ok:false,error:error.message}));
  child.once("close",code=>resolve({ok:code===0,error:code===0?null:stderr.trim()||`taskkill exited ${code}`}));
 });
}

export async function terminateProcessTree(child:ChildProcess,reason:ProcessTerminationReason):Promise<ProcessTerminationResult>{
 const pid=child.pid??null;
 if(!pid)return{pid,reason,terminated:true,method:"already-exited",error:null};
 if(child.exitCode!==null||child.signalCode!==null)return{pid,reason,terminated:true,method:"already-exited",error:null};

 if(process.platform==="win32"){
  const graceful=await taskkill(pid,false);
  if(await waitForExit(child,1500))return{pid,reason,terminated:true,method:"taskkill-tree",error:graceful.error};
  const forced=await taskkill(pid,true);
  const exited=await waitForExit(child,2500);
  return{
   pid,
   reason,
   terminated:exited,
   method:"taskkill-tree-force",
   error:exited?null:forced.error||graceful.error||"Process tree did not exit."
  };
 }

 try{
  child.kill("SIGTERM");
 }catch(error){
  return{pid,reason,terminated:false,method:"sigterm",error:error instanceof Error?error.message:String(error)};
 }

 if(await waitForExit(child,1500))return{pid,reason,terminated:true,method:"sigterm",error:null};

 try{
  child.kill("SIGKILL");
 }catch(error){
  return{pid,reason,terminated:false,method:"sigkill",error:error instanceof Error?error.message:String(error)};
 }

 const exited=await waitForExit(child,2500);
 return{pid,reason,terminated:exited,method:"sigkill",error:exited?null:"Process did not exit."};
}
