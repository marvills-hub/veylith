import crypto from"node:crypto";
import{db}from"../database/database.js";
import{now}from"../config/config.js";
import type{ProjectRelease,ReleaseStatus}from"./release-history.types.js";

db.exec(`
CREATE TABLE IF NOT EXISTS project_releases(
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 task_id TEXT,
 goal_id TEXT,
 delivery_plan_id TEXT NOT NULL UNIQUE,
 publication_id TEXT NOT NULL UNIQUE,
 verification_id TEXT NOT NULL UNIQUE,
 repository_name TEXT NOT NULL,
 target_branch TEXT NOT NULL,
 commit_hash TEXT NOT NULL,
 repository_fingerprint TEXT NOT NULL,
 previous_release_id TEXT,
 previous_commit TEXT,
 sequence INTEGER NOT NULL,
 status TEXT NOT NULL,
 manifest_json TEXT NOT NULL,
 evidence_json TEXT NOT NULL,
 metadata_json TEXT NOT NULL,
 released_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(project_id,sequence)
);
CREATE INDEX IF NOT EXISTS idx_project_releases_project
 ON project_releases(project_id,sequence);
CREATE INDEX IF NOT EXISTS idx_project_releases_commit
 ON project_releases(project_id,commit_hash);
`);

function json<T>(value:any,fallback:T):T{
 try{return value?JSON.parse(String(value)):fallback;}catch{return fallback;}
}
function map(row:any):ProjectRelease{
 return{
  id:String(row.id),
  projectId:String(row.project_id),
  taskId:row.task_id?String(row.task_id):null,
  goalId:row.goal_id?String(row.goal_id):null,
  deliveryPlanId:String(row.delivery_plan_id),
  publicationId:String(row.publication_id),
  verificationId:String(row.verification_id),
  repositoryName:String(row.repository_name),
  targetBranch:String(row.target_branch),
  commit:String(row.commit_hash),
  repositoryFingerprint:String(row.repository_fingerprint),
  previousReleaseId:row.previous_release_id?String(row.previous_release_id):null,
  previousCommit:row.previous_commit?String(row.previous_commit):null,
  sequence:Number(row.sequence),
  status:row.status as ReleaseStatus,
  manifest:json<Record<string,unknown>>(row.manifest_json,{}),
  evidence:json<string[]>(row.evidence_json,[]),
  metadata:json<Record<string,unknown>>(row.metadata_json,{}),
  releasedAt:String(row.released_at),
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at)
 };
}
export function getProjectRelease(id:string){
 const row=db.prepare(`
  SELECT * FROM project_releases WHERE id=?
 `).get(id);
 return row?map(row):null;
}
export function findReleaseByPlan(deliveryPlanId:string){
 const row=db.prepare(`
  SELECT *
  FROM project_releases
  WHERE delivery_plan_id=?
  LIMIT 1
 `).get(deliveryPlanId);
 return row?map(row):null;
}
export function latestProjectRelease(projectId:string){
 const row=db.prepare(`
  SELECT *
  FROM project_releases
  WHERE project_id=?
  ORDER BY sequence DESC
  LIMIT 1
 `).get(projectId);
 return row?map(row):null;
}
export function listProjectReleases(projectId:string,limit=100){
 return(db.prepare(`
  SELECT *
  FROM project_releases
  WHERE project_id=?
  ORDER BY sequence DESC
  LIMIT ?
 `).all(projectId,limit) as any[]).map(map);
}
export function createProjectRelease(input:{
 projectId:string;
 taskId:string|null;
 goalId:string|null;
 deliveryPlanId:string;
 publicationId:string;
 verificationId:string;
 repositoryName:string;
 targetBranch:string;
 commit:string;
 repositoryFingerprint:string;
 previousReleaseId:string|null;
 previousCommit:string|null;
 sequence:number;
 manifest:Record<string,unknown>;
 evidence:string[];
 metadata?:Record<string,unknown>;
}){
 const existing=findReleaseByPlan(input.deliveryPlanId);
 if(existing)return existing;
 const id=`rel_${crypto.randomBytes(8).toString("hex")}`;
 const time=now();
 db.prepare(`
  INSERT INTO project_releases(
   id,project_id,task_id,goal_id,delivery_plan_id,
   publication_id,verification_id,repository_name,target_branch,
   commit_hash,repository_fingerprint,previous_release_id,
   previous_commit,sequence,status,manifest_json,evidence_json,
   metadata_json,released_at,created_at,updated_at
  ) VALUES(
   ?,?,?,?,?,?,?,?,?,?,?,?,?,?,
   'released',?,?,?,?,?,?
  )
 `).run(
  id,
  input.projectId,
  input.taskId,
  input.goalId,
  input.deliveryPlanId,
  input.publicationId,
  input.verificationId,
  input.repositoryName,
  input.targetBranch,
  input.commit,
  input.repositoryFingerprint,
  input.previousReleaseId,
  input.previousCommit,
  input.sequence,
  JSON.stringify(input.manifest),
  JSON.stringify(input.evidence),
  JSON.stringify(input.metadata||{}),
  time,
  time,
  time
 );
 return getProjectRelease(id)!;
}
export function setProjectReleaseStatus(id:string,status:ReleaseStatus){
 const time=now();
 db.prepare(`
  UPDATE project_releases
  SET status=?,updated_at=?
  WHERE id=?
 `).run(status,time,id);
 return getProjectRelease(id);
}
export function deleteProjectReleasesByProject(projectId:string){
 return Number(
  db.prepare(`
   DELETE FROM project_releases WHERE project_id=?
  `).run(projectId).changes
 );
}
