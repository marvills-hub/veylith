import type {ArchitectureResult,DevelopmentPlan,DevelopmentResult} from "../orchestration/pipeline.types.js";

export type ReviewSeverity="blocking"|"warning"|"info";
export type ReviewFinding={
 severity:ReviewSeverity;
 code:string;
 message:string;
 file?:string;
};
export type ReviewEvidence={
 requirement:string;
 plannedFiles:string[];
 changedFiles:string[];
 createdFiles:string[];
 modifiedFiles:string[];
 unplannedFiles:string[];
 validationPassed:boolean;
 validationCommands:number;
 findings:ReviewFinding[];
 blocking:number;
 warnings:number;
};
function normalize(value:string){
 return String(value||"").replaceAll("\\","/").replace(/^\.\/+/,"").toLowerCase();
}
function unique(values:string[]){
 return [...new Set(values.map(normalize).filter(Boolean))];
}
function failureResults(validation:any){
 const results=Array.isArray(validation?.results)?validation.results:[];
 return results.filter((item:any)=>Number(item?.code)!==0);
}
export function buildReviewEvidence(
 requirement:string,
 architecture:ArchitectureResult,
 plan:DevelopmentPlan,
 development:DevelopmentResult,
 validation:any,
 existingFiles:string[]=[]
):ReviewEvidence{
 const existing=new Set(unique(existingFiles));
 const plannedFiles=unique((plan.files||[]).map(file=>file.path));
 const changedFiles=unique((development.files||[]).map(file=>file.path));
 const planned=new Set(plannedFiles);
 const createdFiles=changedFiles.filter(file=>!existing.has(file));
 const modifiedFiles=changedFiles.filter(file=>existing.has(file));
 const unplannedFiles=changedFiles.filter(file=>!planned.has(file));
 const findings:ReviewFinding[]=[];
 const failures=failureResults(validation);
 const validationPassed=validation?.success===true&&failures.length===0;
 if(!validationPassed){
  findings.push({
   severity:"blocking",
   code:"validation-failed",
   message:"Automated validation has not passed."
  });
 }
 if(!Array.isArray(validation?.results)||validation.results.length===0){
  findings.push({
   severity:"blocking",
   code:"validation-missing",
   message:"No automated validation evidence is available."
  });
 }
 if(changedFiles.length===0){
  findings.push({
   severity:"blocking",
   code:"no-implementation",
   message:"Development produced no changed files."
  });
 }
 if(plan.files?.length&&unplannedFiles.length>Math.max(3,Math.ceil(plan.files.length*.5))){
  findings.push({
   severity:"warning",
   code:"plan-drift",
   message:`Implementation changed ${unplannedFiles.length} files outside the development plan.`
  });
 }
 if(plan.files?.length){
  const changed=new Set(changedFiles);
  const missingPlanned=plannedFiles.filter(file=>!changed.has(file));
  if(missingPlanned.length===plannedFiles.length&&changedFiles.length){
   findings.push({
    severity:"warning",
    code:"plan-disconnect",
    message:"Implementation does not modify any file listed in the development plan."
   });
  }
 }
 const duplicatePaths=(development.files||[])
  .map(file=>normalize(file.path))
  .filter((file,index,array)=>array.indexOf(file)!==index);
 if(duplicatePaths.length){
  findings.push({
   severity:"blocking",
   code:"duplicate-output",
   message:`Implementation contains duplicate output paths: ${[...new Set(duplicatePaths)].join(", ")}`
  });
 }
 const emptyFiles=(development.files||[])
  .filter(file=>typeof file.content!=="string"||file.content.trim().length===0)
  .map(file=>normalize(file.path));
 for(const file of emptyFiles){
  findings.push({
   severity:"blocking",
   code:"empty-file",
   message:"Implementation produced an empty file.",
   file
  });
 }
 const blocking=findings.filter(item=>item.severity==="blocking").length;
 const warnings=findings.filter(item=>item.severity==="warning").length;
 return{
  requirement,
  plannedFiles,
  changedFiles,
  createdFiles,
  modifiedFiles,
  unplannedFiles,
  validationPassed,
  validationCommands:Array.isArray(validation?.results)?validation.results.length:0,
  findings,
  blocking,
  warnings
 };
}
export function reviewEvidencePrompt(evidence:ReviewEvidence){
 return[
  `VALIDATION PASSED: ${evidence.validationPassed}`,
  `VALIDATION COMMANDS: ${evidence.validationCommands}`,
  `CHANGED FILES: ${evidence.changedFiles.length}`,
  `CREATED FILES: ${evidence.createdFiles.length}`,
  `MODIFIED FILES: ${evidence.modifiedFiles.length}`,
  `UNPLANNED FILES: ${evidence.unplannedFiles.length}`,
  `DETERMINISTIC BLOCKERS: ${evidence.blocking}`,
  `DETERMINISTIC WARNINGS: ${evidence.warnings}`,
  "",
  "CHANGED FILES:",
  ...(evidence.changedFiles.length?evidence.changedFiles.map(file=>`- ${file}`):["- (none)"]),
  "",
  "UNPLANNED FILES:",
  ...(evidence.unplannedFiles.length?evidence.unplannedFiles.map(file=>`- ${file}`):["- (none)"]),
  "",
  "DETERMINISTIC FINDINGS:",
  ...(evidence.findings.length
   ?evidence.findings.map(item=>`- [${item.severity.toUpperCase()}] ${item.code}: ${item.message}${item.file?` (${item.file})`:""}`)
   :["- None"])
 ].join("\n");
}
