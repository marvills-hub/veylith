import {simpleGit} from "simple-git";
import {existsSync} from "node:fs";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {db,memory} from "../database/database.js";
import {event,setPhase} from "../core/telemetry.js";
import {GITHUB_ENABLED,GITHUB_OWNER,GITHUB_TOKEN,GITHUB_VISIBILITY,now} from "../config/config.js";
import {createGitHubRepository,findGitHubRepository,publishGitHubRepository,verifyGitHubRepository} from "./github.service.js";
import {assertGitWorkspace,expectedGitHubRemote} from "./git-safety.service.js";
import {inspectGitRepository} from "./git-state.service.js";
import {ensureGitPublicationState,getGitPublicationState,updateGitPublicationState} from "./git-publication-state.service.js";
import type {GitPublicationState} from "./git.types.js";
import type {GitHubRepository} from "./github.service.js";

function stageAtLeast(stage:GitPublicationState["stage"],target:GitPublicationState["stage"]){
 const order={none:0,committed:1,repository_ready:2,pushed:3,verified:4};
 return order[stage]>=order[target];
}

function repositoryFromState(state:GitPublicationState):GitHubRepository|null{
 if(!state.owner||!state.repository||!state.repositoryUrl)return null;
 return{
  owner:state.owner,
  name:state.repository,
  fullName:`${state.owner}/${state.repository}`,
  htmlUrl:state.repositoryUrl,
  cloneUrl:state.remoteUrl||expectedGitHubRemote(state.owner,state.repository),
  private:GITHUB_VISIBILITY==="private",
  defaultBranch:state.branch||"main"
 };
}

function githubResult(state:GitPublicationState){
 if(!state.owner||!state.repository||!state.repositoryUrl)return null;
 return{
  owner:state.owner,
  repository:state.repository,
  url:state.repositoryUrl,
  branch:state.branch||"main",
  commit:state.commit,
  pushedAt:state.pushedAt
 };
}

export async function initializeGit(task:any,project:any){
 setPhase(task.id,project.id,"versioning",90);
 const workspace=assertGitWorkspace(project.workspace);
 const publication=ensureGitPublicationState(project.id);
 event("git.initializing","Initializing project repository",{taskId:task.id,projectId:project.id});
 const git=simpleGit(workspace);
 if(!existsSync(path.join(workspace,".git")))await git.init();
 try{
  const config=await git.listConfig();
  if(!config.all["user.name"])await git.addConfig("user.name","Veylith");
  if(!config.all["user.email"])await git.addConfig("user.email","veylith@local");
 }catch{
  await git.addConfig("user.name","Veylith");
  await git.addConfig("user.email","veylith@local");
 }
 const ignore=path.join(workspace,".gitignore");
 if(!existsSync(ignore))await writeFile(ignore,"node_modules/\ndist/\nbuild/\n.env\n*.log\n","utf8");
 await git.add(".");
 const status=await git.status();
 let created=false;
 if(status.files.length){
  await git.commit(`Veylith: complete ${task.title}`);
  created=true;
 }
 const repositoryState=await inspectGitRepository(workspace);
 const commit=repositoryState.head;
 if(!commit)throw new Error("Git repository contains no commit after initialization.");
 const log=await git.log({maxCount:1});
 const message=log.latest?.message||`Veylith: complete ${task.title}`;
 const committedAt=publication.committedAt||now();
 const result={commit,message,created,changedFiles:status.files.length,branch:repositoryState.branch};
 updateGitPublicationState(project.id,{
  stage:stageAtLeast(publication.stage,"committed")?publication.stage:"committed",
  commit,
  branch:repositoryState.branch,
  committedAt
 });
 memory(project.id,"git_commit",JSON.stringify(result));
 if(created){
  event("git.committed",`Committed ${status.files.length} changed files`,{taskId:task.id,projectId:project.id,data:{commit}});
 }else{
  event("git.existing",`Using existing commit ${commit}`,{taskId:task.id,projectId:project.id,data:{commit}});
 }
 return result;
}

export async function publishToGitHub(task:any,project:any){
 if(!GITHUB_ENABLED){
  event("github.skipped","GitHub publishing is not configured",{taskId:task.id,projectId:project.id,level:"warn"});
  return null;
 }

 const workspace=assertGitWorkspace(project.workspace);
 const local=await inspectGitRepository(workspace);
 if(!local.initialized||!local.head)throw new Error("GitHub publication requires an initialized repository with a local commit.");

 let state=ensureGitPublicationState(project.id);

 if(state.commit&&state.commit!==local.head){
  event("github.resume.invalidated","Local HEAD changed after publication checkpoint; publication will reconcile from commit stage",{
   taskId:task.id,
   projectId:project.id,
   level:"warn",
   data:{checkpointCommit:state.commit,localCommit:local.head}
  });
  state=updateGitPublicationState(project.id,{
   stage:"committed",
   commit:local.head,
   branch:local.branch,
   owner:null,
   repository:null,
   repositoryUrl:null,
   remoteUrl:null,
   repositoryReadyAt:null,
   pushedAt:null,
   verifiedAt:null
  });
 }else if(!state.commit){
  state=updateGitPublicationState(project.id,{
   stage:"committed",
   commit:local.head,
   branch:local.branch,
   committedAt:state.committedAt||now()
  });
 }

 setPhase(task.id,project.id,"publishing",94);

 if(state.stage==="verified"){
  const saved=githubResult(state);
  if(saved){
   event("github.resume.verified","Using previously verified GitHub publication",{
    taskId:task.id,
    projectId:project.id,
    data:{owner:saved.owner,repository:saved.repository,commit:saved.commit}
   });
   return saved;
  }
 }

 let repository=repositoryFromState(state);

 if(!stageAtLeast(state.stage,"repository_ready")||!repository){
  event("github.repository.creating",`Preparing ${GITHUB_OWNER}/${project.slug}`,{
   taskId:task.id,
   projectId:project.id,
   data:{owner:GITHUB_OWNER,repository:project.slug,visibility:GITHUB_VISIBILITY}
  });

  repository=await createGitHubRepository(
   {token:GITHUB_TOKEN,owner:GITHUB_OWNER,visibility:GITHUB_VISIBILITY},
   project.slug,
   project.summary||`Autonomously created by Veylith: ${project.name}`
  );

  state=updateGitPublicationState(project.id,{
   stage:"repository_ready",
   commit:local.head,
   branch:local.branch,
   owner:repository.owner,
   repository:repository.name,
   repositoryUrl:repository.htmlUrl,
   remoteUrl:repository.cloneUrl,
   repositoryReadyAt:state.repositoryReadyAt||now()
  });

  event("github.repository.ready",repository.fullName,{
   taskId:task.id,
   projectId:project.id,
   data:{owner:repository.owner,repository:repository.name,url:repository.htmlUrl,private:repository.private}
  });
 }else{
  const remote=await findGitHubRepository(GITHUB_TOKEN,repository.owner,repository.name);
  if(remote)repository=remote;
  else{
   repository=await createGitHubRepository(
    {token:GITHUB_TOKEN,owner:GITHUB_OWNER,visibility:GITHUB_VISIBILITY},
    project.slug,
    project.summary||`Autonomously created by Veylith: ${project.name}`
   );
  }

  state=updateGitPublicationState(project.id,{
   owner:repository.owner,
   repository:repository.name,
   repositoryUrl:repository.htmlUrl,
   remoteUrl:repository.cloneUrl
  });

  event("github.resume.repository","Recovered existing GitHub repository checkpoint",{
   taskId:task.id,
   projectId:project.id,
   data:{owner:repository.owner,repository:repository.name,commit:state.commit}
  });
 }

 if(!stageAtLeast(state.stage,"pushed")){
  event("github.push.started",`Pushing ${repository.fullName}`,{
   taskId:task.id,
   projectId:project.id,
   data:{branch:"main",commit:local.head}
  });

  const pushed=await publishGitHubRepository(workspace,repository,GITHUB_TOKEN);

  if(pushed.commit!==local.head){
   throw new Error(`Git push checkpoint mismatch: expected ${local.head}, received ${pushed.commit||"no commit"}.`);
  }

  state=updateGitPublicationState(project.id,{
   stage:"pushed",
   commit:pushed.commit,
   branch:pushed.branch,
   owner:repository.owner,
   repository:repository.name,
   repositoryUrl:repository.htmlUrl,
   remoteUrl:pushed.remote,
   pushedAt:state.pushedAt||now()
  });

  event("github.push.checkpointed",`Push checkpoint recorded for ${repository.fullName}`,{
   taskId:task.id,
   projectId:project.id,
   data:{branch:pushed.branch,commit:pushed.commit}
  });
 }else{
  event("github.resume.push","Skipping duplicate push because push checkpoint already exists",{
   taskId:task.id,
   projectId:project.id,
   data:{commit:state.commit,branch:state.branch}
  });
 }

 if(!stageAtLeast(state.stage,"verified")){
  const verified=await verifyGitHubRepository(GITHUB_TOKEN,repository.owner,repository.name);

  state=updateGitPublicationState(project.id,{
   stage:"verified",
   commit:state.commit||local.head,
   branch:state.branch||"main",
   owner:verified.owner,
   repository:verified.name,
   repositoryUrl:verified.htmlUrl,
   remoteUrl:repository.cloneUrl,
   verifiedAt:state.verifiedAt||now()
  });

  event("github.verification.checkpointed",`Verified ${verified.fullName}`,{
   taskId:task.id,
   projectId:project.id,
   data:{commit:state.commit,branch:state.branch}
  });
 }

 const result=githubResult(state);
 if(!result)throw new Error("GitHub publication reached verified state without complete repository metadata.");

 const completedAt=state.verifiedAt||now();

 db.prepare(`
  UPDATE projects
  SET github_owner=?,github_repo=?,github_url=?,github_branch=?,github_commit=?,github_pushed_at=?,updated_at=?
  WHERE id=?
 `).run(
  result.owner,
  result.repository,
  result.url,
  result.branch,
  result.commit,
  result.pushedAt,
  completedAt,
  project.id
 );

 const latestMemory=db.prepare(`
  SELECT content
  FROM project_memory
  WHERE project_id=? AND type='github'
  ORDER BY id DESC
  LIMIT 1
 `).get(project.id) as any;

 let duplicate=false;
 if(latestMemory?.content){
  try{
   const saved=JSON.parse(latestMemory.content);
   duplicate=
    saved?.owner===result.owner&&
    saved?.repository===result.repository&&
    saved?.commit===result.commit;
  }catch{}
 }

 if(!duplicate)memory(project.id,"github",JSON.stringify(result));

 event("github.push.completed",`Published ${result.owner}/${result.repository}`,{
  taskId:task.id,
  projectId:project.id,
  data:result
 });

 return result;
}

export function getPublicationRecoveryState(projectId:string){
 return getGitPublicationState(projectId);
}

