import {simpleGit} from "simple-git";
import {existsSync} from "node:fs";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {db,memory} from "../database/database.js";
import {event,setPhase} from "../core/telemetry.js";
import {GITHUB_ENABLED,GITHUB_OWNER,GITHUB_TOKEN,GITHUB_VISIBILITY,now} from "../config/config.js";
import {createGitHubRepository,publishGitHubRepository,verifyGitHubRepository} from "./github.service.js";
export async function initializeGit(task:any,project:any){
 setPhase(task.id,project.id,"versioning",90);
 event("git.initializing","Initializing project repository",{taskId:task.id,projectId:project.id});
 const git=simpleGit(project.workspace);
 if(!existsSync(path.join(project.workspace,".git")))await git.init();
 try{
  const config=await git.listConfig();
  if(!config.all["user.name"])await git.addConfig("user.name","Veylith");
  if(!config.all["user.email"])await git.addConfig("user.email","veylith@local");
 }catch{
  await git.addConfig("user.name","Veylith");
  await git.addConfig("user.email","veylith@local");
 }
 const ignore=path.join(project.workspace,".gitignore");
 if(!existsSync(ignore))await writeFile(ignore,"node_modules/\ndist/\nbuild/\n.env\n*.log\n","utf8");
 await git.add(".");
 const status=await git.status();
 if(status.files.length){
  await git.commit(`Veylith: complete ${task.title}`);
  const log=await git.log({maxCount:1});
  const commit=log.latest?.hash||null;
  memory(project.id,"git_commit",JSON.stringify({commit,message:`Veylith: complete ${task.title}`}));
  event("git.committed",`Committed ${status.files.length} changed files`,{taskId:task.id,projectId:project.id,data:{commit}});
 }
}
export async function publishToGitHub(task:any,project:any){
 if(!GITHUB_ENABLED){
  event("github.skipped","GitHub publishing is not configured",{taskId:task.id,projectId:project.id,level:"warn"});
  return null;
 }
 setPhase(task.id,project.id,"publishing",94);
 event("github.repository.creating",`Preparing ${GITHUB_OWNER}/${project.slug}`,{taskId:task.id,projectId:project.id,data:{owner:GITHUB_OWNER,repository:project.slug,visibility:GITHUB_VISIBILITY}});
 const repository=await createGitHubRepository({token:GITHUB_TOKEN,owner:GITHUB_OWNER,visibility:GITHUB_VISIBILITY},project.slug,project.summary||`Autonomously created by Veylith: ${project.name}`);
 event("github.repository.created",repository.fullName,{taskId:task.id,projectId:project.id,data:{owner:repository.owner,repository:repository.name,url:repository.htmlUrl,private:repository.private}});
 event("github.push.started",`Pushing ${repository.fullName}`,{taskId:task.id,projectId:project.id,data:{branch:"main"}});
 const pushed=await publishGitHubRepository(project.workspace,repository,GITHUB_TOKEN);
 const verified=await verifyGitHubRepository(GITHUB_TOKEN,repository.owner,repository.name);
 const pushedAt=now();
 db.prepare("UPDATE projects SET github_owner=?,github_repo=?,github_url=?,github_branch=?,github_commit=?,github_pushed_at=?,updated_at=? WHERE id=?").run(verified.owner,verified.name,verified.htmlUrl,pushed.branch,pushed.commit,pushedAt,pushedAt,project.id);
 const result={owner:verified.owner,repository:verified.name,url:verified.htmlUrl,branch:pushed.branch,commit:pushed.commit,pushedAt};
 memory(project.id,"github",JSON.stringify(result));
 event("github.push.completed",`Published ${verified.fullName}`,{taskId:task.id,projectId:project.id,data:result});
 return result;
}
