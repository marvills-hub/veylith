import crypto from"node:crypto";
import fs from"node:fs";
import path from"node:path";
import{memory}from"../database/database.js";
import{
 createRepositoryEvolutionEvent,
 createRepositoryEvolutionSnapshot,
 latestRepositoryEvolutionSnapshot,
 listRepositoryEvolutionEvents,
 listRepositoryEvolutionSnapshots
}from"./repository-evolution.repository.js";
import type{
 RepositoryEvolutionEventType,
 RepositoryEvolutionState
}from"./repository-evolution.types.js";

const IGNORED=new Set([
 ".git",
 "node_modules",
 "dist",
 "build",
 "coverage",
 ".angular",
 ".next",
 ".turbo",
 ".cache"
]);

function normalize(value:string){
 return value.replace(/\\/g,"/");
}

function walk(root:string,current:string,files:string[]){
 for(const entry of fs.readdirSync(current,{withFileTypes:true})){
  if(IGNORED.has(entry.name))continue;

  const absolute=path.join(current,entry.name);

  if(entry.isSymbolicLink())continue;

  if(entry.isDirectory()){
   walk(root,absolute,files);
   continue;
  }

  if(!entry.isFile())continue;

  const relative=normalize(path.relative(root,absolute));
  if(!relative||relative.startsWith("../"))continue;
  files.push(relative);
 }
}

function repositoryFiles(workspace:string){
 if(!fs.existsSync(workspace))
  throw new Error(`Repository workspace not found: ${workspace}`);

 const files:string[]=[];
 walk(workspace,workspace,files);
 return files.sort();
}

function fingerprint(workspace:string,files:string[]){
 const hash=crypto.createHash("sha256");

 for(const relative of files){
  const absolute=path.join(
   workspace,
   ...relative.split("/")
  );
  const stat=fs.statSync(absolute);

  hash.update(relative);
  hash.update("\0");
  hash.update(String(stat.size));
  hash.update("\0");
  hash.update(fs.readFileSync(absolute));
  hash.update("\0");
 }

 return hash.digest("hex");
}

export function captureRepositoryEvolution(input:{
 projectId:string;
 workspace:string;
 taskId?:string|null;
 cycleId?:string|null;
 type?:RepositoryEvolutionEventType;
 title?:string;
 summary?:string;
 evidence?:string[];
 metadata?:Record<string,unknown>;
}){
 const files=repositoryFiles(input.workspace);
 const currentFingerprint=fingerprint(
  input.workspace,
  files
 );

 const previous=latestRepositoryEvolutionSnapshot(
  input.projectId
 );

 if(previous?.fingerprint===currentFingerprint){
  return{
   changed:false,
   snapshot:previous,
   event:null
  };
 }

 const snapshot=createRepositoryEvolutionSnapshot({
  projectId:input.projectId,
  taskId:input.taskId,
  cycleId:input.cycleId,
  workspace:input.workspace,
  fingerprint:currentFingerprint,
  files,
  metadata:input.metadata
 });

 const event=createRepositoryEvolutionEvent({
  projectId:input.projectId,
  taskId:input.taskId,
  cycleId:input.cycleId,
  snapshotId:snapshot.id,
  type:input.type||(
   previous
    ?"implementation"
    :"baseline"
  ),
  title:input.title||(
   previous
    ?"Repository evolved"
    :"Repository baseline captured"
  ),
  summary:input.summary||(
   previous
    ?`Repository changed from ${previous.fingerprint.slice(0,12)} to ${snapshot.fingerprint.slice(0,12)}.`
    :`Initial repository state captured with ${snapshot.fileCount} file(s).`
  ),
  files:snapshot.files,
  evidence:input.evidence||[],
  metadata:{
   ...(input.metadata||{}),
   previousFingerprint:previous?.fingerprint||null,
   fingerprint:snapshot.fingerprint
  }
 });

 memory(
  input.projectId,
  "repository_evolution",
  JSON.stringify({
   snapshotId:snapshot.id,
   eventId:event.id,
   sequence:snapshot.sequence,
   fingerprint:snapshot.fingerprint,
   parentFingerprint:snapshot.parentFingerprint,
   type:event.type,
   title:event.title,
   fileCount:snapshot.fileCount
  })
 );

 return{
  changed:true,
  snapshot,
  event
 };
}

export function repositoryEvolutionState(
 projectId:string
):RepositoryEvolutionState{
 const snapshots=listRepositoryEvolutionSnapshots(
  projectId,
  10000
 );
 const events=listRepositoryEvolutionEvents(
  projectId,
  10000
 );

 return{
  projectId,
  latestSnapshot:snapshots.at(-1)||null,
  snapshots:snapshots.length,
  events:events.length,
  recentEvents:events.slice(-20)
 };
}
