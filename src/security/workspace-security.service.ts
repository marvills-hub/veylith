import path from "node:path";
import fs from "node:fs";
import {WorkspaceSecurityError,type WorkspacePathResult} from "./workspace-security.types.js";

function normalizeCase(value:string){
 const normalized=path.resolve(value);
 return process.platform==="win32"?normalized.toLowerCase():normalized;
}

function inside(parent:string,target:string){
 const relative=path.relative(normalizeCase(parent),normalizeCase(target));
 return relative===""||(!relative.startsWith("..")&&!path.isAbsolute(relative));
}

function nearestExisting(target:string){
 let current=path.resolve(target);
 while(!fs.existsSync(current)){
  const parent=path.dirname(current);
  if(parent===current)return null;
  current=parent;
 }
 return current;
}

function real(value:string){
 return fs.realpathSync.native(value);
}

export function assertWorkspace(workspace:string){
 if(!workspace||typeof workspace!=="string")throw new WorkspaceSecurityError("workspace_missing","Workspace is required.");
 const resolved=path.resolve(workspace);
 if(!fs.existsSync(resolved))throw new WorkspaceSecurityError("workspace_missing",`Workspace does not exist: ${resolved}`,resolved,resolved);
 const stat=fs.statSync(resolved);
 if(!stat.isDirectory())throw new WorkspaceSecurityError("workspace_invalid",`Workspace is not a directory: ${resolved}`,resolved,resolved);
 return real(resolved);
}

export function resolveWorkspacePath(workspace:string,requested:string):WorkspacePathResult{
 const root=assertWorkspace(workspace);
 if(typeof requested!=="string"||!requested.trim())throw new WorkspaceSecurityError("path_invalid","Workspace path is required.",requested,root);
 if(requested.includes("\0"))throw new WorkspaceSecurityError("path_invalid","Null bytes are not allowed in workspace paths.",requested,root);

 const resolved=path.isAbsolute(requested)?path.resolve(requested):path.resolve(root,requested);

 if(!inside(root,resolved))throw new WorkspaceSecurityError(
  "workspace_escape",
  `Path escapes assigned workspace: ${requested}`,
  requested,
  root
 );

 const existing=nearestExisting(resolved);
 if(existing){
  const realExisting=real(existing);
  if(!inside(root,realExisting))throw new WorkspaceSecurityError(
   "symlink_escape",
   `Path resolves outside assigned workspace through a symbolic link: ${requested}`,
   requested,
   root
  );
 }

 if(fs.existsSync(resolved)){
  const realResolved=real(resolved);
  if(!inside(root,realResolved))throw new WorkspaceSecurityError(
   "symlink_escape",
   `Path resolves outside assigned workspace: ${requested}`,
   requested,
   root
  );
 }

 return{
  workspace:root,
  requested,
  resolved,
  relative:path.relative(root,resolved)
 };
}

export function assertWorkspaceCwd(workspace:string,cwd:string){
 const result=resolveWorkspacePath(workspace,cwd);
 if(!fs.existsSync(result.resolved))throw new WorkspaceSecurityError("cwd_missing",`Command directory does not exist: ${cwd}`,cwd,result.workspace);
 if(!fs.statSync(result.resolved).isDirectory())throw new WorkspaceSecurityError("cwd_invalid",`Command directory is not a directory: ${cwd}`,cwd,result.workspace);
 return result.resolved;
}

export function isInsideWorkspace(workspace:string,target:string){
 try{
  resolveWorkspacePath(workspace,target);
  return true;
 }catch{
  return false;
 }
}
