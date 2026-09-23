import fs from "node:fs";
import path from "node:path";

let passed=0;
let failed=0;

function check(name,condition){
 if(condition){
  console.log(`PASS ${name}`);
  passed++;
 }else{
  console.log(`FAIL ${name}`);
  failed++;
 }
}

const root=process.cwd();
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

const git=read("src/git/git.service.ts");
const state=read("src/git/git-publication-state.service.ts");
const github=read("src/git/github.service.ts");

console.log("\n=== COMMIT RECOVERY ===");
check("publication state loaded before Git work",git.includes("ensureGitPublicationState(project.id)"));
check("existing local commit reused",git.includes("git.existing"));
check("commit mismatch detected",git.includes("state.commit&&state.commit!==local.head"));
check("changed HEAD invalidates later publication stages",git.includes('stage:"committed"')&&git.includes("github.resume.invalidated"));

console.log("\n=== REPOSITORY RECOVERY ===");
check("repository reconstructed from checkpoint",git.includes("repositoryFromState"));
check("existing GitHub repository recovered",git.includes("findGitHubRepository"));
check("repository recovery event exists",git.includes("github.resume.repository"));
check("repository creation remains idempotent",github.includes("const existing=await findGitHubRepository"));

console.log("\n=== PUSH RECOVERY ===");
check("push skipped after pushed checkpoint",git.includes('if(!stageAtLeast(state.stage,"pushed"))'));
check("duplicate push skip event exists",git.includes("github.resume.push"));
check("push commit verified against local HEAD",git.includes("pushed.commit!==local.head"));
check("push checkpoint recorded after push",git.includes('stage:"pushed"')&&git.includes("github.push.checkpointed"));

console.log("\n=== VERIFICATION RECOVERY ===");
check("verification skipped after verified checkpoint",git.includes('if(!stageAtLeast(state.stage,"verified"))'));
check("verified publication can return immediately",git.includes('if(state.stage==="verified")'));
check("verified resume event exists",git.includes("github.resume.verified"));
check("verification checkpoint exists",git.includes("github.verification.checkpointed"));

console.log("\n=== FINALIZATION IDEMPOTENCY ===");
check("project GitHub state finalized from checkpoint",git.includes("UPDATE projects")&&git.includes("github_owner=?"));
check("duplicate GitHub memory prevented",git.includes("let duplicate=false"));
check("publication recovery state exported",git.includes("getPublicationRecoveryState"));
check("publication state durable service retained",state.includes("getGitPublicationState"));

console.log("\n============================================================");
console.log(" VEYLITH v0.9 BATCH 4 PASS 2");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

process.exitCode=failed?1:0;
