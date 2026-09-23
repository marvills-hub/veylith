import {spawn} from "node:child_process";
import type {SandboxHealth} from "./sandbox.types.js";
export async function dockerSandboxHealth():Promise<SandboxHealth>{
 return new Promise(resolve=>{
  const child=spawn("docker",["info","--format","{{.ServerVersion}}"],{windowsHide:true,shell:false});
  let output="",settled=false;
  const done=(available:boolean,message:string)=>{
   if(settled)return;
   settled=true;
   clearTimeout(timer);
   resolve({provider:"docker",available,isolated:available,message});
  };
  const timer=setTimeout(()=>{
   child.kill();
   done(false,"Docker health check timed out");
  },5000);
  child.stdout?.on("data",chunk=>output+=chunk.toString());
  child.on("error",()=>done(false,"Docker CLI is unavailable"));
  child.on("close",code=>done(code===0,code===0?`Docker ${output.trim()} available`:"Docker engine unavailable"));
 });
}
