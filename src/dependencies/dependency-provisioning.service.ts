import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {runCommand} from "../runtime/command.service.js";
import {event} from "../core/telemetry.js";

interface PackageManifest{
 dependencies?:Record<string,string>;
 devDependencies?:Record<string,string>;
 optionalDependencies?:Record<string,string>;
}

interface PackageLock{
 lockfileVersion?:number;
 packages?:Record<string,{
  dependencies?:Record<string,string>;
  devDependencies?:Record<string,string>;
  optionalDependencies?:Record<string,string>;
 }>;
}

export interface DependencyProvisioningResult{
 required:boolean;
 attempted:boolean;
 success:boolean;
 command:string|null;
 args:string[];
 reason:string;
 code:number|null;
 stdout:string;
 stderr:string;
 fingerprint:string|null;
}

function exists(file:string){
 try{return fs.existsSync(file);}catch{return false;}
}

function read(file:string){
 try{return fs.readFileSync(file,"utf8");}catch{return null;}
}

function parse<T>(content:string|null):T|null{
 if(content===null)return null;
 try{
  const value=JSON.parse(content);
  return value&&typeof value==="object"&&!Array.isArray(value)?value as T:null;
 }catch{
  return null;
 }
}

function manifest(workspace:string){
 const file=path.join(workspace,"package.json");
 const content=read(file);
 return{
  file:exists(file)?file:null,
  content,
  value:parse<PackageManifest>(content)
 };
}

function dependencyMap(value:PackageManifest){
 return{
  ...(value.dependencies??{}),
  ...(value.devDependencies??{}),
  ...(value.optionalDependencies??{})
 };
}

function dependencyCount(value:PackageManifest){
 return Object.keys(dependencyMap(value)).length;
}

function stateFingerprint(workspace:string,manifestContent:string){
 const lock=read(path.join(workspace,"package-lock.json"))??"";
 return crypto
  .createHash("sha256")
  .update(manifestContent)
  .update("\u0000")
  .update(lock)
  .digest("hex");
}

function markerPath(workspace:string){
 return path.join(workspace,"node_modules",".veylith-dependencies");
}

function installed(workspace:string,fingerprint:string){
 if(!exists(path.join(workspace,"node_modules")))return false;
 return read(markerPath(workspace))?.trim()===fingerprint;
}

function writeMarker(workspace:string,fingerprint:string){
 fs.writeFileSync(markerPath(workspace),fingerprint,"utf8");
}

function lockfileCompatible(workspace:string,value:PackageManifest){
 const content=read(path.join(workspace,"package-lock.json"));
 const lock=parse<PackageLock>(content);
 if(!lock)return false;

 const root=lock.packages?.[""];
 if(!root)return false;

 const expected={
  ...(value.dependencies??{}),
  ...(value.devDependencies??{}),
  ...(value.optionalDependencies??{})
 };

 const locked={
  ...(root.dependencies??{}),
  ...(root.devDependencies??{}),
  ...(root.optionalDependencies??{})
 };

 const expectedKeys=Object.keys(expected).sort();
 const lockedKeys=Object.keys(locked).sort();

 if(expectedKeys.length!==lockedKeys.length)return false;

 for(let i=0;i<expectedKeys.length;i++){
  if(expectedKeys[i]!==lockedKeys[i])return false;
 }

 for(const name of expectedKeys){
  if(expected[name]!==locked[name])return false;
 }

 return true;
}

export async function provisionProjectDependencies(
 workspace:string,
 taskId:string,
 projectId:string
):Promise<DependencyProvisioningResult>{
 const root=path.resolve(workspace);
 const packageState=manifest(root);

 if(!packageState.file){
  return{
   required:false,
   attempted:false,
   success:true,
   command:null,
   args:[],
   reason:"No package.json found.",
   code:null,
   stdout:"",
   stderr:"",
   fingerprint:null
  };
 }

 if(!packageState.value||packageState.content===null){
  return{
   required:true,
   attempted:false,
   success:false,
   command:null,
   args:[],
   reason:"package.json is invalid and dependencies cannot be provisioned.",
   code:null,
   stdout:"",
   stderr:"Invalid package.json.",
   fingerprint:null
  };
 }

 if(dependencyCount(packageState.value)===0){
  return{
   required:false,
   attempted:false,
   success:true,
   command:null,
   args:[],
   reason:"Project declares no package dependencies.",
   code:null,
   stdout:"",
   stderr:"",
   fingerprint:null
  };
 }

 const initialFingerprint=stateFingerprint(
  root,
  packageState.content
 );

 if(installed(root,initialFingerprint)){
  return{
   required:true,
   attempted:false,
   success:true,
   command:null,
   args:[],
   reason:"Dependencies are already provisioned for the current package state.",
   code:null,
   stdout:"",
   stderr:"",
   fingerprint:initialFingerprint
  };
 }

 const hasLock=exists(
  path.join(root,"package-lock.json")
 );

 const compatibleLock=
  hasLock&&lockfileCompatible(root,packageState.value);

 const args=[
  compatibleLock?"ci":"install"
 ];

 const reason=
  !hasLock
   ?"No package lock exists; generating synchronized dependency state."
   :compatibleLock
    ?"Compatible package lock detected; performing clean installation."
    :"Package lock is stale or incompatible; synchronizing it with package.json.";

 event(
  "dependencies.provisioning",
  "Provisioning project dependencies",
  {
   taskId,
   projectId,
   data:{
    command:"npm",
    args,
    lockfile:hasLock,
    lockfileCompatible:compatibleLock,
    reason
   }
  }
 );

 let execution:{
  code:number;
  stdout:string;
  stderr:string;
 };

 try{
  execution=await runCommand(
   "npm",
   args,
   root,
   taskId,
   projectId
  );
 }catch(error){
  execution={
   code:-1,
   stdout:"",
   stderr:error instanceof Error
    ?error.message
    :String(error)
  };
 }

 if(execution.code!==0){
  event(
   "dependencies.failed",
   "Dependency provisioning failed",
   {
    taskId,
    projectId,
    level:"error",
    data:{
     command:"npm",
     args,
     code:execution.code,
     lockfile:hasLock,
     lockfileCompatible:compatibleLock
    }
   }
  );

  return{
   required:true,
   attempted:true,
   success:false,
   command:"npm",
   args,
   reason:"Dependency provisioning failed.",
   code:execution.code,
   stdout:execution.stdout.slice(-6000),
   stderr:execution.stderr.slice(-6000),
   fingerprint:initialFingerprint
  };
 }

 const finalManifestContent=
  read(path.join(root,"package.json"))
  ??packageState.content;

 const finalFingerprint=
  stateFingerprint(root,finalManifestContent);

 writeMarker(
  root,
  finalFingerprint
 );

 event(
  "dependencies.provisioned",
  "Project dependencies provisioned",
  {
   taskId,
   projectId,
   data:{
    command:"npm",
    args,
    lockfileBefore:hasLock,
    lockfileCompatible:compatibleLock,
    fingerprint:finalFingerprint
   }
  }
 );

 return{
  required:true,
  attempted:true,
  success:true,
  command:"npm",
  args,
  reason,
  code:execution.code,
  stdout:execution.stdout.slice(-6000),
  stderr:execution.stderr.slice(-6000),
  fingerprint:finalFingerprint
 };
}
