import {db} from "../database/database.js";

export type PublicationStage="none"|"committed"|"repository_ready"|"pushed"|"verified";

export interface PublicationStageView{
 id:PublicationStage;
 label:string;
 state:"waiting"|"working"|"completed"|"failed";
 time:string|null;
}

const order:PublicationStage[]=["committed","repository_ready","pushed","verified"];

function rank(stage:string){
 const index=order.indexOf(stage as PublicationStage);
 return index<0?-1:index;
}

function stateFor(current:string,target:PublicationStage,failed:boolean){
 if(failed&&current===target)return"failed";
 const currentRank=rank(current);
 const targetRank=rank(target);
 if(currentRank>targetRank)return"completed";
 if(currentRank===targetRank)return target==="verified"?"completed":"working";
 return"waiting";
}

function stages(row:any):PublicationStageView[]{
 const failed=Boolean(row?.last_error);
 return[
  {id:"committed",label:"Commit",state:stateFor(row?.stage||"none","committed",failed),time:row?.committed_at||null},
  {id:"repository_ready",label:"Repository",state:stateFor(row?.stage||"none","repository_ready",failed),time:row?.repository_ready_at||null},
  {id:"pushed",label:"Push",state:stateFor(row?.stage||"none","pushed",failed),time:row?.pushed_at||null},
  {id:"verified",label:"Verification",state:stateFor(row?.stage||"none","verified",failed),time:row?.verified_at||null}
 ];
}

export function publicationForProject(projectId:string){
 const project=db.prepare(`
  SELECT id,name,status,phase,progress,workspace,created_at,updated_at
  FROM projects WHERE id=?
 `).get(projectId) as any;

 if(!project)return null;

 const publication=db.prepare(`
  SELECT *
  FROM git_publication_state
  WHERE project_id=?
 `).get(projectId) as any;

 const task=db.prepare(`
  SELECT id,title,status,phase,error,completed_at,updated_at
  FROM tasks
  WHERE project_id=?
  ORDER BY created_at DESC
  LIMIT 1
 `).get(projectId) as any;

 const row=publication||{
  project_id:projectId,
  stage:"none",
  commit_sha:null,
  branch:null,
  github_owner:null,
  github_repo:null,
  github_url:null,
  remote_url:null,
  committed_at:null,
  repository_ready_at:null,
  pushed_at:null,
  verified_at:null,
  updated_at:project.updated_at
 };

 return{
  project:{
   id:project.id,
   name:project.name,
   status:project.status,
   phase:project.phase,
   progress:Number(project.progress||0)
  },
  task:task||null,
  stage:row.stage||"none",
  commitSha:row.commit_sha||null,
  shortSha:row.commit_sha?String(row.commit_sha).slice(0,8):null,
  branch:row.branch||null,
  owner:row.github_owner||null,
  repository:row.github_repo||null,
  githubUrl:row.github_url||null,
  remoteUrl:row.remote_url||null,
  committedAt:row.committed_at||null,
  repositoryReadyAt:row.repository_ready_at||null,
  pushedAt:row.pushed_at||null,
  verifiedAt:row.verified_at||null,
  updatedAt:row.updated_at||null,
  verified:row.stage==="verified"&&Boolean(row.verified_at),
  publishing:["versioning","publishing"].includes(project.phase),
  failed:Boolean(task?.error)&&["failed"].includes(task?.status),
  error:task?.status==="failed"?task.error||null:null,
  stages:stages(row)
 };
}

export function publicationOverview(limit=50){
 const projects=db.prepare(`
  SELECT id
  FROM projects
  ORDER BY updated_at DESC
  LIMIT ?
 `).all(Math.max(1,Math.min(limit,100))) as any[];

 return projects
  .map(project=>publicationForProject(project.id))
  .filter(Boolean);
}
