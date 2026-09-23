import {mkdir,writeFile,readFile,readdir,lstat} from "node:fs/promises";
import {existsSync} from "node:fs";
import path from "node:path";
import {event} from "../core/telemetry.js";
import {resolveWorkspacePath} from "../security/workspace-security.service.js";
import {assertGeneratedFilePath} from "../security/generated-file-policy.service.js";
import {securityAllowed,securityRejected} from "../security/security-telemetry.service.js";

export function safeTarget(workspace:string,relative:string){
 return resolveWorkspacePath(workspace,relative).resolved;
}

export async function writeProjectFile(workspace:string,relative:string,content:string,taskId:string,projectId:string){
 try{
  const target=assertGeneratedFilePath(workspace,relative);
  await mkdir(path.dirname(target.resolved),{recursive:true});
  resolveWorkspacePath(workspace,path.dirname(target.resolved));
  await writeFile(target.resolved,content,"utf8");
  securityAllowed("Generated file write accepted",taskId,projectId,{path:target.relative});
  event("file.written",target.relative.replaceAll("\\","/"),{
   taskId,
   projectId,
   data:{path:target.relative.replaceAll("\\","/"),bytes:Buffer.byteLength(content)}
  });
 }catch(error){
  securityRejected("Generated file write rejected",error,taskId,projectId,{path:relative});
  throw error;
 }
}

export async function walkFiles(workspace:string,dir=workspace):Promise<string[]>{
 const root=resolveWorkspacePath(workspace,".").workspace;
 const current=resolveWorkspacePath(root,dir).resolved;
 if(!existsSync(current))return[];
 const output:string[]=[];
 for(const item of await readdir(current)){
  if(["node_modules",".git","dist","build",".angular",".next"].includes(item))continue;
  const full=path.join(current,item);
  let info;
  try{
   info=await lstat(full);
  }catch{
   continue;
  }
  if(info.isSymbolicLink()){
   try{
    resolveWorkspacePath(root,full);
   }catch{
    continue;
   }
   continue;
  }
  if(info.isDirectory())output.push(...await walkFiles(root,full));
  else{
   const safe=resolveWorkspacePath(root,full);
   output.push(safe.relative.replaceAll("\\","/"));
  }
 }
 return output;
}

export async function sourceSnapshot(workspace:string){
 const root=resolveWorkspacePath(workspace,".").workspace;
 const files=await walkFiles(root);
 const allowed=files.filter(file=>!/\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|zip|pdf)$/i.test(file)).slice(0,80);
 const parts:string[]=[];
 let total=0;
 for(const relative of allowed){
  try{
   const target=resolveWorkspacePath(root,relative);
   const content=await readFile(target.resolved,"utf8");
   const limited=content.slice(0,16000);
   total+=limited.length;
   if(total>120000)break;
   parts.push(`FILE: ${relative}\n${limited}`);
  }catch{}
 }
 return parts.join("\n\n");
}
