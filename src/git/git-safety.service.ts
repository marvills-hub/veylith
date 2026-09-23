import path from "node:path";
import {existsSync,realpathSync} from "node:fs";
import {ROOT} from "../config/config.js";

function normalize(value:string){
 return path.resolve(value);
}

function within(parent:string,child:string){
 const relative=path.relative(parent,child);
 return relative===""||(!relative.startsWith("..")&&!path.isAbsolute(relative));
}

export function assertGitWorkspace(workspace:string){
 const root=normalize(ROOT);
 const target=normalize(workspace);
 if(!within(root,target))throw new Error(`Git workspace escapes configured workspace root: ${workspace}`);
 if(target===root)throw new Error("Git operations cannot target the workspace root itself.");
 if(existsSync(target)){
  const realRoot=existsSync(root)?realpathSync(root):root;
  const realTarget=realpathSync(target);
  if(!within(realRoot,realTarget))throw new Error(`Git workspace resolves outside configured workspace root: ${workspace}`);
 }
 return target;
}

export function sanitizeGitRemote(value:string|null|undefined){
 if(!value)return null;
 return value
  .replace(/https:\/\/[^/@\s]+@github\.com/gi,"https://github.com")
  .replace(/x-access-token:[^@\s]+@/gi,"");
}

export function expectedGitHubRemote(owner:string,repository:string){
 return `https://github.com/${owner}/${repository}.git`;
}

export function assertExpectedGitHubRemote(remote:string,owner:string,repository:string){
 const expected=expectedGitHubRemote(owner,repository).toLowerCase();
 const normalized=sanitizeGitRemote(remote)?.replace(/\/+$/,"").toLowerCase();
 if(normalized!==expected.toLowerCase())throw new Error(`Git origin does not match expected GitHub repository ${owner}/${repository}.`);
}
