import {db} from "../database/database.js";
import {now} from "../config/config.js";
import type {GitPublicationStage,GitPublicationState} from "./git.types.js";

function row(projectId:string){
 return db.prepare("SELECT * FROM git_publication_state WHERE project_id=?").get(projectId) as any;
}

function map(value:any):GitPublicationState{
 return{
  projectId:value.project_id,
  stage:value.stage,
  commit:value.commit_sha||null,
  branch:value.branch||null,
  owner:value.github_owner||null,
  repository:value.github_repo||null,
  repositoryUrl:value.github_url||null,
  remoteUrl:value.remote_url||null,
  committedAt:value.committed_at||null,
  repositoryReadyAt:value.repository_ready_at||null,
  pushedAt:value.pushed_at||null,
  verifiedAt:value.verified_at||null,
  updatedAt:value.updated_at
 };
}

export function getGitPublicationState(projectId:string):GitPublicationState|null{
 const value=row(projectId);
 return value?map(value):null;
}

export function ensureGitPublicationState(projectId:string){
 const existing=getGitPublicationState(projectId);
 if(existing)return existing;
 const time=now();
 db.prepare(`
  INSERT INTO git_publication_state(project_id,stage,updated_at)
  VALUES(?,?,?)
 `).run(projectId,"none",time);
 return getGitPublicationState(projectId)!;
}

export function updateGitPublicationState(projectId:string,patch:{
 stage?:GitPublicationStage;
 commit?:string|null;
 branch?:string|null;
 owner?:string|null;
 repository?:string|null;
 repositoryUrl?:string|null;
 remoteUrl?:string|null;
 committedAt?:string|null;
 repositoryReadyAt?:string|null;
 pushedAt?:string|null;
 verifiedAt?:string|null;
}){
 ensureGitPublicationState(projectId);
 const current=getGitPublicationState(projectId)!;
 const next={
  stage:patch.stage??current.stage,
  commit:patch.commit===undefined?current.commit:patch.commit,
  branch:patch.branch===undefined?current.branch:patch.branch,
  owner:patch.owner===undefined?current.owner:patch.owner,
  repository:patch.repository===undefined?current.repository:patch.repository,
  repositoryUrl:patch.repositoryUrl===undefined?current.repositoryUrl:patch.repositoryUrl,
  remoteUrl:patch.remoteUrl===undefined?current.remoteUrl:patch.remoteUrl,
  committedAt:patch.committedAt===undefined?current.committedAt:patch.committedAt,
  repositoryReadyAt:patch.repositoryReadyAt===undefined?current.repositoryReadyAt:patch.repositoryReadyAt,
  pushedAt:patch.pushedAt===undefined?current.pushedAt:patch.pushedAt,
  verifiedAt:patch.verifiedAt===undefined?current.verifiedAt:patch.verifiedAt
 };
 db.prepare(`
  UPDATE git_publication_state
  SET stage=?,commit_sha=?,branch=?,github_owner=?,github_repo=?,github_url=?,remote_url=?,
      committed_at=?,repository_ready_at=?,pushed_at=?,verified_at=?,updated_at=?
  WHERE project_id=?
 `).run(
  next.stage,next.commit,next.branch,next.owner,next.repository,next.repositoryUrl,next.remoteUrl,
  next.committedAt,next.repositoryReadyAt,next.pushedAt,next.verifiedAt,now(),projectId
 );
 return getGitPublicationState(projectId)!;
}
