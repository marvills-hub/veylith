import {mkdir,writeFile,readFile,readdir,stat} from "node:fs/promises";
import {existsSync} from "node:fs";
import path from "node:path";
import {event} from "../core/telemetry.js";
export function safeTarget(workspace:string,relative:string){
 const root=path.resolve(workspace);
 const target=path.resolve(root,relative);
 if(target===root||target.startsWith(root+path.sep))return target;
 throw new Error(`Unsafe path rejected: ${relative}`);
}
export async function writeProjectFile(workspace:string,relative:string,content:string,taskId:string,projectId:string){
 const target=safeTarget(workspace,relative);
 await mkdir(path.dirname(target),{recursive:true});
 await writeFile(target,content,"utf8");
 event("file.written",relative,{taskId,projectId,data:{path:relative,bytes:Buffer.byteLength(content)}});
}
export async function walkFiles(workspace:string,dir=workspace):Promise<string[]>{
 if(!existsSync(dir))return[];
 const output:string[]=[];
 for(const item of await readdir(dir)){
  if(["node_modules",".git","dist","build",".angular",".next"].includes(item))continue;
  const full=path.join(dir,item);
  const info=await stat(full);
  if(info.isDirectory())output.push(...await walkFiles(workspace,full));
  else output.push(path.relative(workspace,full).replaceAll("\\","/"));
 }
 return output;
}
export async function sourceSnapshot(workspace:string){
 const files=await walkFiles(workspace);
 const allowed=files.filter(x=>!/\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|zip|pdf)$/i.test(x)).slice(0,80);
 const parts:string[]=[];
 let total=0;
 for(const relative of allowed){
  try{
   const content=await readFile(path.join(workspace,relative),"utf8");
   const limited=content.slice(0,16000);
   total+=limited.length;
   if(total>120000)break;
   parts.push(`FILE: ${relative}\n${limited}`);
  }catch{}
 }
 return parts.join("\n\n");
}
