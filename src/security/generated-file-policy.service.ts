import path from "node:path";
import {resolveWorkspacePath} from "./workspace-security.service.js";

const protectedNames=new Set([
 ".git",
 ".env",
 ".env.local",
 ".env.production",
 ".npmrc",
 ".ssh"
]);

export function assertGeneratedFilePath(workspace:string,file:string){
 const target=resolveWorkspacePath(workspace,file);
 const parts=target.relative.split(path.sep).filter(Boolean);
 if(parts.some(part=>protectedNames.has(part.toLowerCase())))throw new Error(`Protected project path rejected: ${file}`);
 return target;
}

export function assertSafeGeneratedFiles(workspace:string,files:Array<{path:string}>){
 if(!Array.isArray(files))throw new Error("Generated files collection is invalid.");
 const seen=new Set<string>();
 for(const file of files){
  if(!file||typeof file.path!=="string")throw new Error("Generated file path is invalid.");
  const target=assertGeneratedFilePath(workspace,file.path);
  const key=process.platform==="win32"?target.resolved.toLowerCase():target.resolved;
  if(seen.has(key))throw new Error(`Duplicate generated file path rejected: ${file.path}`);
  seen.add(key);
 }
}
