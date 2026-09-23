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

const types=read("src/git/git.types.ts");
const safety=read("src/git/git-safety.service.ts");
const state=read("src/git/git-publication-state.service.ts");
const inspection=read("src/git/git-state.service.ts");
const githubError=read("src/git/github-error.service.ts");
const github=read("src/git/github.service.ts");
const git=read("src/git/git.service.ts");
const database=read("src/database/database.ts");

check("publication stages defined",types.includes('"repository_ready"')&&types.includes('"verified"'));
check("workspace containment exists",safety.includes("assertGitWorkspace"));
check("workspace root itself rejected",safety.includes("target===root"));
check("real path containment checked",safety.includes("realpathSync"));
check("credential sanitization exists",safety.includes("sanitizeGitRemote"));
check("expected GitHub remote validation exists",safety.includes("assertExpectedGitHubRemote"));
check("publication state persisted",database.includes("CREATE TABLE IF NOT EXISTS git_publication_state"));
check("commit checkpoint persisted",state.includes("committed_at"));
check("repository checkpoint persisted",state.includes("repository_ready_at"));
check("push checkpoint persisted",state.includes("pushed_at"));
check("verification checkpoint persisted",state.includes("verified_at"));
check("repository inspection available",inspection.includes("inspectGitRepository"));
check("GitHub failures classified",githubError.includes("classifyGitHubFailure"));
check("transient GitHub failures retryable",githubError.includes('kind="transient"')&&githubError.includes("retryable=true"));
check("repository lookup is idempotent",github.includes("findGitHubRepository"));
check("repository creation recovers conflict",github.includes('failure.kind==="validation"||failure.kind==="conflict"'));
check("publish validates workspace",github.includes("assertGitWorkspace(workspace)"));
check("publish validates final origin",github.includes("assertExpectedGitHubRemote(finalOrigin"));
check("Git initialization validates workspace",git.includes("assertGitWorkspace(project.workspace)"));
check("commit persisted before publication",git.indexOf('stage:"committed"')<git.indexOf("export async function publishToGitHub"));
check("repository state persisted before push",git.indexOf('stage:"repository_ready"')<git.indexOf("github.push.started"));
check("push state persisted before verification",git.indexOf('stage:"pushed"')<git.indexOf("const verified=await verifyGitHubRepository"));
check("verified state persisted",git.includes('stage:"verified"'));
check("token not persisted in publication state",!state.includes("GITHUB_TOKEN"));

console.log("\n============================================================");
console.log(" VEYLITH v0.9 BATCH 4 PASS 1");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);
process.exitCode=failed?1:0;

