import path from "node:path";
import type {DevelopmentPlan,DevelopmentResult} from "../orchestration/pipeline.types.js";
import type {RepositoryProfile} from "./repository.types.js";
import type {ChangeAnalysis,ChangeValidation,FileChange} from "./change.types.js";

function normalize(value:string){
 return value.replaceAll("\\","/").replace(/^\.\/+/,"");
}
function protectedManifest(pathname:string){
 return["package.json","angular.json","tsconfig.json","vite.config.ts","vite.config.js","firebase.json","cargo.toml","pyproject.toml","composer.json"].includes(pathname.toLowerCase());
}
export function validateChangeSet(
 profile:RepositoryProfile,
 analysis:ChangeAnalysis,
 plan:DevelopmentPlan|undefined,
 result:DevelopmentResult
):ChangeValidation{
 const existing=new Set(profile.files.map(file=>normalize(file.path).toLowerCase()));
 const targets=new Set(analysis.likelyTargets.map(item=>normalize(item.path).toLowerCase()));
 const planned=new Set((plan?.files||[]).map(file=>normalize(file.path).toLowerCase()));
 const changes:FileChange[]=result.files.map(file=>{
  const normalized=normalize(file.path);
  const key=normalized.toLowerCase();
  return{
   path:normalized,
   kind:existing.has(key)?"modify":"create",
   planned:planned.has(key),
   target:targets.has(key)
  };
 });
 const created=changes.filter(item=>item.kind==="create").length;
 const modified=changes.length-created;
 const unplanned=changes.filter(item=>planned.size>0&&!item.planned).map(item=>item.path);
 const suspicious:string[]=[];
 if(analysis.repositoryMode==="existing"){
  if(changes.length>Math.max(12,Math.ceil(profile.totalFiles*.35)))suspicious.push(`Broad rewrite: ${changes.length} files changed in an existing ${profile.totalFiles}-file repository.`);
  if(created>Math.max(8,modified*2)&&analysis.intent!=="create")suspicious.push(`Unexpected file creation: ${created} new files versus ${modified} modified files.`);
  const manifestChanges=changes.filter(item=>protectedManifest(item.path));
  for(const item of manifestChanges){
   if(!item.planned&&!item.target)suspicious.push(`Unplanned repository manifest change: ${item.path}`);
  }
  if(plan?.files?.length&&unplanned.length>Math.max(3,Math.ceil(plan.files.length*.5)))suspicious.push(`Too many unplanned files: ${unplanned.join(", ")}`);
 }
 const duplicates=result.files
  .map(file=>normalize(file.path).toLowerCase())
  .filter((item,index,array)=>array.indexOf(item)!==index);
 if(duplicates.length)suspicious.push(`Duplicate output paths: ${[...new Set(duplicates)].join(", ")}`);
 return{
  allowed:suspicious.length===0,
  repositoryMode:analysis.repositoryMode,
  totalChanges:changes.length,
  created,
  modified,
  unplanned,
  suspicious,
  changes
 };
}
export function assertChangeSetSafe(
 profile:RepositoryProfile,
 analysis:ChangeAnalysis,
 plan:DevelopmentPlan|undefined,
 result:DevelopmentResult
){
 const validation=validateChangeSet(profile,analysis,plan,result);
 if(!validation.allowed)throw new Error(`Change-aware guard rejected implementation: ${validation.suspicious.join(" | ")}`);
 return validation;
}
