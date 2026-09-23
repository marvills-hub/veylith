import {simpleGit} from "simple-git";
import {existsSync} from "node:fs";
import path from "node:path";
import type {GitRepositoryState} from "./git.types.js";
import {assertGitWorkspace,sanitizeGitRemote} from "./git-safety.service.js";

export async function inspectGitRepository(workspace:string):Promise<GitRepositoryState>{
 const safeWorkspace=assertGitWorkspace(workspace);
 const initialized=existsSync(path.join(safeWorkspace,".git"));
 if(!initialized)return{
  workspace:safeWorkspace,
  initialized:false,
  branch:null,
  head:null,
  dirty:false,
  changedFiles:0,
  origin:null
 };
 const git=simpleGit(safeWorkspace);
 const status=await git.status();
 const remotes=await git.getRemotes(true);
 const origin=remotes.find(remote=>remote.name==="origin");
 let head:string|null=null;
 try{
  const log=await git.log({maxCount:1});
  head=log.latest?.hash||null;
 }catch{}
 return{
  workspace:safeWorkspace,
  initialized:true,
  branch:status.current||null,
  head,
  dirty:status.files.length>0,
  changedFiles:status.files.length,
  origin:sanitizeGitRemote(origin?.refs?.fetch||origin?.refs?.push||null)
 };
}
