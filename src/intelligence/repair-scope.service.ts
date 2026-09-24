import path from "node:path";
import type {DevelopmentPlan,DevelopmentResult} from "../orchestration/pipeline.types.js";
import type {DiagnosticResult,RepairHistoryItem} from "../agent/diagnostic.service.js";

export type RepairScope={
 fingerprint:string;
 confidence:"low"|"medium"|"high";
 repeatedFailures:number;
 diagnosedFiles:string[];
 previousFiles:string[];
 plannedFiles:string[];
 allowedFiles:string[];
 query:string;
 maxChangedFiles:number;
 expansion:"focused"|"expanded"|"broad";
 reasons:string[];
};
export type RepairScopeValidation={
 allowed:boolean;
 changedFiles:string[];
 outsideScope:string[];
 suspicious:string[];
};
function normalize(value:string){
 return String(value||"").replaceAll("\\","/").replace(/^\.\/+/,"").toLowerCase();
}
function unique(values:string[]){
 return [...new Set(values.map(normalize).filter(Boolean))];
}
function related(a:string,b:string){
 const aa=normalize(a);
 const bb=normalize(b);
 if(aa===bb)return true;
 const ad=path.posix.dirname(aa);
 const bd=path.posix.dirname(bb);
 return ad===bd&&ad!==".";
}
export function createRepairScope(
 task:any,
 plan:DevelopmentPlan,
 diagnostic:DiagnosticResult,
 history:RepairHistoryItem[]
):RepairScope{
 const diagnosedFiles=unique(diagnostic.relevantFiles||[]);
 const previousFiles=unique(history.flatMap(item=>item.files||[]));
 const plannedFiles=unique((plan.files||[]).map(file=>file.path));
 const repeatedFailures=history.filter(item=>item.fingerprint&&item.fingerprint===diagnostic.fingerprint).length;
 let expansion:"focused"|"expanded"|"broad"="focused";
 if(repeatedFailures>=2||diagnostic.confidence==="low")expansion="broad";
 else if(repeatedFailures>=1||diagnostic.confidence==="medium")expansion="expanded";
 const allowedFiles=unique([
  ...diagnosedFiles,
  ...previousFiles,
  ...plannedFiles
 ]);
 const maxChangedFiles=expansion==="focused"
  ?Math.max(2,diagnosedFiles.length+1)
  :expansion==="expanded"
   ?Math.max(4,diagnosedFiles.length+previousFiles.length+2)
   :Math.max(6,diagnosedFiles.length+previousFiles.length+plannedFiles.length+3);
 const reasons=[
  `diagnostic-confidence:${diagnostic.confidence}`,
  `repeated-fingerprint:${repeatedFailures}`,
  `expansion:${expansion}`
 ];
 const query=[
  task.prompt,
  diagnostic.rootCause,
  ...(diagnostic.evidence||[]),
  ...(diagnostic.strategy||[]),
  ...(diagnostic.avoid||[]),
  ...diagnosedFiles,
  ...previousFiles,
  expansion==="broad"?"inspect neighboring dependencies tests configuration lifecycle":""
 ].join(" ");
 return{
  fingerprint:diagnostic.fingerprint,
  confidence:diagnostic.confidence,
  repeatedFailures,
  diagnosedFiles,
  previousFiles,
  plannedFiles,
  allowedFiles,
  query,
  maxChangedFiles,
  expansion,
  reasons
 };
}
export function validateRepairScope(scope:RepairScope,result:DevelopmentResult):RepairScopeValidation{
 const changedFiles=unique((result.files||[]).map(file=>file.path));
 let outsideScope:string[]=[];
 if(scope.expansion==="focused"){
  outsideScope=changedFiles.filter(changed=>!scope.allowedFiles.includes(changed)&&!scope.diagnosedFiles.some(target=>related(changed,target)));
 }else if(scope.expansion==="expanded"){
  outsideScope=changedFiles.filter(changed=>{
   if(scope.allowedFiles.includes(changed))return false;
   return !scope.allowedFiles.some(target=>related(changed,target));
  });
 }
 const suspicious:string[]=[];
 if(scope.diagnosedFiles.length&&scope.expansion==="focused"&&!changedFiles.some(changed=>scope.diagnosedFiles.some(target=>related(changed,target)))){
  suspicious.push(`Focused repair did not modify a diagnosed root-cause file: ${scope.diagnosedFiles.join(", ")}`);
 }
 if(changedFiles.length>scope.maxChangedFiles){
  suspicious.push(`Repair changed ${changedFiles.length} files; scope allows ${scope.maxChangedFiles}.`);
 }
 if(scope.expansion==="focused"&&outsideScope.length){
  suspicious.push(`Focused repair escaped diagnosed scope: ${outsideScope.join(", ")}`);
 }
 if(scope.expansion==="expanded"&&outsideScope.length>2){
  suspicious.push(`Expanded repair changed too many files outside known scope: ${outsideScope.join(", ")}`);
 }
 return{
  allowed:suspicious.length===0,
  changedFiles,
  outsideScope,
  suspicious
 };
}
export function assertRepairScope(scope:RepairScope,result:DevelopmentResult){
 const validation=validateRepairScope(scope,result);
 if(!validation.allowed)throw new Error(`Targeted repair guard rejected implementation: ${validation.suspicious.join(" | ")}`);
 return validation;
}
export function repairScopePrompt(scope:RepairScope){
 return[
  `REPAIR EXPANSION: ${scope.expansion}`,
  `DIAGNOSTIC CONFIDENCE: ${scope.confidence}`,
  `REPEATED FAILURE COUNT: ${scope.repeatedFailures}`,
  `MAXIMUM EXPECTED CHANGED FILES: ${scope.maxChangedFiles}`,
  "",
  "DIAGNOSED FILES:",
  ...(scope.diagnosedFiles.length?scope.diagnosedFiles:["(none)"]),
  "",
  "FILES CHANGED BY PREVIOUS REPAIRS:",
  ...(scope.previousFiles.length?scope.previousFiles:["(none)"]),
  "",
  "ORIGINAL PLANNED FILES:",
  ...(scope.plannedFiles.length?scope.plannedFiles:["(none)"]),
  "",
  "RULE:",
  scope.expansion==="focused"
   ?"- Stay inside diagnosed files and their immediate directory neighbors unless another repair cycle expands the scope."
   :scope.expansion==="expanded"
    ?"- Prefer diagnosed, previous and planned files. A small number of neighboring files may be changed when required by evidence."
    :"- The failure has resisted narrower repair. Broader investigation is allowed, but every changed file must still be justified by the root cause."
 ].join("\n");
}



