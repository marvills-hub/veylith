import {getAIProvider} from "./provider.service.js";
import {repositoryIntelligence} from "../intelligence/repository-intelligence.service.js";
import {buildReviewEvidence,reviewEvidencePrompt} from "../intelligence/review-evidence.service.js";
import {finalizeReview} from "../intelligence/review-decision.service.js";
import type {ArchitectureResult,DevelopmentPlan,DevelopmentResult,ReviewResult} from "../orchestration/pipeline.types.js";

export async function reviewProject(
 task:any,
 project:any,
 architecture:ArchitectureResult,
 plan:DevelopmentPlan,
 development:DevelopmentResult,
 validation:any
):Promise<ReviewResult>{
 const provider=getAIProvider();
 const intelligence=await repositoryIntelligence(
  project.workspace,
  [
   task.prompt,
   architecture.summary,
   ...(plan.files||[]).map(file=>`${file.path} ${file.purpose}`),
   ...(development.files||[]).map(file=>file.path),
   "review correctness requirements regression tests validation"
  ].join(" "),
  60000
 );
 const evidence=buildReviewEvidence(
  task.prompt,
  architecture,
  plan,
  development,
  validation,
  intelligence.profile.files.map(file=>file.path)
 );
 const system=`You are Veylith's autonomous senior code reviewer.
Review the ACTUAL implementation against the requirement, architecture, development plan, repository context and validation evidence.

Return ONLY valid JSON:
{
 "approved":true,
 "summary":"review summary",
 "issues":["blocking correctness or requirement issue"],
 "recommendations":["non-blocking improvement"]
}

Review standard:
- approved=true only when the requested behavior appears implemented correctly and no blocking issue remains.
- issues contains ONLY defects that justify another repair cycle.
- recommendations contains improvements that should NOT block completion.
- Never reject solely for style preference.
- Never invent requirements absent from the user's request.
- Do not demand unrelated refactoring.
- Do not treat optional enhancements as blockers.
- Validation success is necessary evidence but does not prove requirement completeness.
- Check whether the implementation actually satisfies the USER REQUIREMENT.
- Check changed files for regressions against existing repository behavior.
- Check consistency with the architecture and development plan.
- Check error handling where required by the feature.
- Check tests for meaningful coverage of requested behavior.
- Check for suspicious shortcuts, disabled assertions or validation bypasses.
- If deterministic evidence reports a BLOCKING finding, approved MUST be false.
- Deterministic warnings require investigation but are not automatically blocking.
- Use repository context as evidence.
- Keep the review focused on correctness, requirement completeness, regression risk and maintainability.
- Do not write replacement code.`;

 const aiReview=await provider.json<ReviewResult>(
  system,
  `PROJECT:
${project.name}

USER REQUIREMENT:
${task.prompt}

ARCHITECTURE:
${JSON.stringify(architecture,null,2)}

DEVELOPMENT PLAN:
${JSON.stringify(plan,null,2)}

IMPLEMENTATION:
${JSON.stringify({
   summary:development.summary,
   files:(development.files||[]).map(file=>file.path),
   commands:development.commands
  },null,2)}

VALIDATION:
${JSON.stringify(validation,null,2)}

DETERMINISTIC REVIEW EVIDENCE:
${reviewEvidencePrompt(evidence)}

REPOSITORY CONTEXT:
${intelligence.prompt}`,
  task.id,
  project.id
 );

 const decision=finalizeReview(evidence,aiReview);
 return{
  approved:decision.approved,
  summary:decision.summary,
  issues:decision.issues,
  recommendations:decision.recommendations
 };
}
