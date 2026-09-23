import type {ReviewResult} from "../orchestration/pipeline.types.js";
import type {ReviewEvidence} from "./review-evidence.service.js";

export type ReviewDecision={
 approved:boolean;
 summary:string;
 issues:string[];
 recommendations:string[];
 deterministicBlockers:string[];
 aiBlockers:string[];
};
function clean(values:any){
 return Array.isArray(values)?values.map(String).map(value=>value.trim()).filter(Boolean):[];
}
export function finalizeReview(evidence:ReviewEvidence,aiReview:ReviewResult):ReviewDecision{
 const deterministicBlockers=evidence.findings
  .filter(item=>item.severity==="blocking")
  .map(item=>`${item.code}: ${item.message}${item.file?` (${item.file})`:""}`);
 const aiIssues=clean(aiReview.issues);
 const aiRecommendations=clean(aiReview.recommendations);
 const aiBlockers=aiReview.approved===false?aiIssues:[];
 const approved=deterministicBlockers.length===0&&aiReview.approved===true;
 const issues=[...new Set([...deterministicBlockers,...aiIssues])];
 return{
  approved,
  summary:String(aiReview.summary||(
   approved
    ?"Implementation passed autonomous review."
    :"Implementation requires additional repair."
  )),
  issues,
  recommendations:aiRecommendations,
  deterministicBlockers,
  aiBlockers
 };
}
