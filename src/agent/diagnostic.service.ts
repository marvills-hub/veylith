import crypto from "node:crypto";
import {db,memory} from "../database/database.js";
import {getAIProvider} from "./provider.service.js";
import {repositoryIntelligence} from "../intelligence/repository-intelligence.service.js";
import type {ArchitectureResult,DevelopmentPlan,ReviewResult} from "../orchestration/pipeline.types.js";

export interface RepairHistoryItem{
 attempt:number;
 summary:string;
 files:string[];
 validation:any;
 fingerprint:string;
}
export interface DiagnosticResult{
 summary:string;
 rootCause:string;
 evidence:string[];
 relevantFiles:string[];
 previousAttempts:string[];
 strategy:string[];
 avoid:string[];
 confidence:"low"|"medium"|"high";
 fingerprint:string;
}
function compact(value:string,max=5000){
 return String(value||"").slice(-max);
}
export function failureFingerprint(validation:any){
 const failure=validation?.failure||validation||{};
 const raw=[
  failure.command||"",
  JSON.stringify(failure.args||[]),
  compact(failure.stderr||"",5000),
  compact(failure.stdout||"",5000)
 ].join("\n")
 .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g,"<timestamp>")
 .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,"<uuid>")
 .replace(/\b\d+(?:\.\d+)?\s*(?:ms|s)\b/gi,"<duration>")
 .replace(/\s+/g," ")
 .trim()
 .toLowerCase();
 return crypto.createHash("sha256").update(raw).digest("hex").slice(0,16);
}
export function repairHistory(projectId:string):RepairHistoryItem[]{
 const repairs=db.prepare(`
  SELECT id,type,content
  FROM project_memory
  WHERE project_id=? AND type LIKE 'repair_%'
  ORDER BY id ASC
 `).all(projectId) as any[];
 const repairMap=new Map<number,any>();
 const validationMap=new Map<number,any>();
 for(const row of repairs){
  const repairMatch=/^repair_(\d+)$/.exec(row.type);
  const validationMatch=/^repair_validation_(\d+)$/.exec(row.type);
  try{
   if(repairMatch)repairMap.set(Number(repairMatch[1]),JSON.parse(row.content));
   if(validationMatch)validationMap.set(Number(validationMatch[1]),JSON.parse(row.content));
  }catch{}
 }
 const attempts=[...new Set([...repairMap.keys(),...validationMap.keys()])].sort((a,b)=>a-b);
 return attempts.map(attempt=>{
  const repair=repairMap.get(attempt)||{};
  const validation=validationMap.get(attempt)||null;
  return{
   attempt,
   summary:String(repair.summary||""),
   files:Array.isArray(repair.files)?repair.files.map((file:any)=>String(file?.path||file)).filter(Boolean):[],
   validation,
   fingerprint:validation?failureFingerprint(validation):""
  };
 });
}
export async function diagnoseFailure(
 task:any,
 project:any,
 architecture:ArchitectureResult,
 plan:DevelopmentPlan,
 validation:any,
 review?:ReviewResult
):Promise<DiagnosticResult>{
 const provider=getAIProvider();
 const history=repairHistory(project.id);
 const fingerprint=failureFingerprint(validation);
 const repeated=history.filter(item=>item.fingerprint===fingerprint);
 const failure=validation?.failure||validation||{};
 const previousFiles=history.flatMap(item=>item.files||[]);
 const failureContext=[
  task.prompt,
  String(failure.command||""),
  JSON.stringify(failure.args||[]),
  compact(failure.stderr||"",10000),
  compact(failure.stdout||"",10000),
  ...(review?.issues||[]),
  ...previousFiles,
  ...plan.files.map(file=>`${file.path} ${file.purpose}`)
 ].join(" ");
 const intelligence=await repositoryIntelligence(project.workspace,failureContext,55000);
 const historyText=history.length
  ?history.map(item=>[
    `ATTEMPT ${item.attempt}`,
    `SUMMARY: ${item.summary||"(none)"}`,
    `FILES CHANGED: ${item.files.join(", ")||"(none)"}`,
    `FAILURE FINGERPRINT: ${item.fingerprint||"(none)"}`,
    `VALIDATION: ${JSON.stringify(item.validation,null,2)}`
   ].join("\n")).join("\n\n")
  :"No previous completed repairs.";
 const system=`You are Veylith's diagnostic software engineer.
Your job is NOT to modify code.
Determine the concrete root cause before another repair is attempted.
Return ONLY valid JSON:
{
 "summary":"short diagnostic summary",
 "rootCause":"most likely concrete root cause",
 "evidence":["specific evidence"],
 "relevantFiles":["relative/file/path"],
 "previousAttempts":["what previous repairs tried and why they did not solve the failure"],
 "strategy":["specific repair actions"],
 "avoid":["approaches that should not be repeated"],
 "confidence":"low|medium|high"
}
Rules:
- Diagnose from ACTUAL repository context and ACTUAL validation output.
- relevantFiles is operational input to the Repair Agent, so include only files genuinely implicated in the failure.
- Prefer exact existing relative paths visible in repository context.
- Trace failures through tests, setup, persistence, services, configuration and lifecycle when relevant.
- Distinguish production defects, test-isolation defects, configuration defects and validation-command defects.
- Compare previous repair attempts.
- If the same fingerprint survived a previous repair, explicitly identify why the prior approach failed.
- Do not repeat an ineffective strategy without explaining what materially changes.
- Use high confidence only when source/output contains direct evidence.
- Prefer the smallest root-cause repair.
- Do not write replacement source code.
- Do not invent unsupported files.`;
 const result=await provider.json<Omit<DiagnosticResult,"fingerprint">>(
  system,
  `REQUIREMENT:
${task.prompt}

ARCHITECTURE:
${JSON.stringify(architecture,null,2)}

PLAN:
${JSON.stringify(plan,null,2)}

CURRENT VALIDATION FAILURE:
${JSON.stringify(validation,null,2)}

CURRENT FAILURE FINGERPRINT:
${fingerprint}

THIS EXACT FAILURE HAS APPEARED AFTER ${repeated.length} PREVIOUS REPAIR(S).

REVIEW:
${JSON.stringify(review||null,null,2)}

PREVIOUS REPAIR HISTORY:
${historyText}

REPOSITORY CONTEXT:
${intelligence.prompt}`,
  task.id,
  project.id
 );
 const diagnostic:DiagnosticResult={
  summary:String(result.summary||"Failure diagnosed"),
  rootCause:String(result.rootCause||"Unknown root cause"),
  evidence:Array.isArray(result.evidence)?result.evidence.map(String):[],
  relevantFiles:Array.isArray(result.relevantFiles)?result.relevantFiles.map(String).filter(Boolean):[],
  previousAttempts:Array.isArray(result.previousAttempts)?result.previousAttempts.map(String):[],
  strategy:Array.isArray(result.strategy)?result.strategy.map(String):[],
  avoid:Array.isArray(result.avoid)?result.avoid.map(String):[],
  confidence:["low","medium","high"].includes(String(result.confidence))?result.confidence:"medium",
  fingerprint
 };
 memory(project.id,"diagnostic",JSON.stringify(diagnostic));
 return diagnostic;
}
