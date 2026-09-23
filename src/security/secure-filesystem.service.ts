import fs from "node:fs/promises";
import path from "node:path";
import {resolveWorkspacePath} from "./workspace-security.service.js";

export async function secureWriteFile(workspace:string,file:string,content:string|Buffer){
 const target=resolveWorkspacePath(workspace,file);
 await fs.mkdir(path.dirname(target.resolved),{recursive:true});
 resolveWorkspacePath(workspace,path.dirname(target.resolved));
 await fs.writeFile(target.resolved,content);
 return target;
}

export async function secureReadFile(workspace:string,file:string){
 const target=resolveWorkspacePath(workspace,file);
 return await fs.readFile(target.resolved,"utf8");
}

export async function secureMkdir(workspace:string,directory:string){
 const target=resolveWorkspacePath(workspace,directory);
 await fs.mkdir(target.resolved,{recursive:true});
 resolveWorkspacePath(workspace,target.resolved);
 return target;
}

export async function secureRemove(workspace:string,targetPath:string){
 const target=resolveWorkspacePath(workspace,targetPath);
 if(target.relative==="")throw new Error("Removing the workspace root is forbidden.");
 await fs.rm(target.resolved,{recursive:true,force:true});
 return target;
}
