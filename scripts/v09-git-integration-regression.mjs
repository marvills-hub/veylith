import fs from "node:fs";
import path from "node:path";

let passed=0;
let failed=0;

function check(name,condition,detail=""){
 if(condition){
  console.log(`PASS ${name}${detail?` - ${detail}`:""}`);
  passed++;
 }else{
  console.log(`FAIL ${name}${detail?` - ${detail}`:""}`);
  failed++;
 }
}

const root=process.cwd();
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

const git=read("src/git/git.service.ts");
const github=read("src/git/github.service.ts");
const publication=read("src/git/git-publication-state.service.ts");
const safety=read("src/git/git-safety.service.ts");
const database=read("src/database/database.ts");
const orchestrator=read("src/orchestration/orchestrator.service.ts");
const task=read("src/core/task.service.ts");
const runner=read("src/jobs/job-runner.service.ts");
const redaction=read("src/logging/log-redaction.service.ts");
const sandboxEnv=read("src/sandbox/sandbox-environment.service.ts");

console.log("\n=== AUTONOMOUS PIPELINE INTEGRATION ===");

check(
 "orchestrator uses hardened Git initialization",
 orchestrator.includes("initializeGit")
);

check(
 "orchestrator uses hardened GitHub publication",
 orchestrator.includes("publishToGitHub")
);

check(
 "orchestrator retains final GitHub checkpoint",
 orchestrator.includes('checkpoint<any>(project.id,"github")')&&
 orchestrator.includes('save(project.id,"github",result)')
);

check(
 "demo pipeline also uses hardened Git path",
 task.includes("await initializeGit(task,project)")&&
 task.includes("publishToGitHub")
);

console.log("\n=== DURABLE PUBLICATION STATE ===");

check(
 "publication state table exists",
 database.includes("CREATE TABLE IF NOT EXISTS git_publication_state")
);

check(
 "commit checkpoint supported",
 publication.includes("committedAt")&&
 git.includes('stage:"committed"')
);

check(
 "repository checkpoint supported",
 publication.includes("repositoryReadyAt")&&
 git.includes('stage:"repository_ready"')
);

check(
 "push checkpoint supported",
 publication.includes("pushedAt")&&
 git.includes('stage:"pushed"')
);

check(
 "verification checkpoint supported",
 publication.includes("verifiedAt")&&
 git.includes('stage:"verified"')
);

console.log("\n=== RESTART / RESUME SEMANTICS ===");

check(
 "verified publication returns without republishing",
 git.includes('if(state.stage==="verified")')&&
 git.includes("github.resume.verified")
);

check(
 "repository checkpoint can be reconstructed",
 git.includes("repositoryFromState")
);

check(
 "existing repository can be recovered remotely",
 git.includes("findGitHubRepository")
);

check(
 "completed push is skipped on resume",
 git.includes('if(!stageAtLeast(state.stage,"pushed"))')&&
 git.includes("github.resume.push")
);

check(
 "local HEAD change invalidates stale publication",
 git.includes("state.commit&&state.commit!==local.head")&&
 git.includes("github.resume.invalidated")
);

console.log("\n=== DUPLICATE PREVENTION ===");

check(
 "Git commit requires actual changes",
 git.includes("if(status.files.length)")
);

check(
 "GitHub creation checks existing repository",
 github.includes("const existing=await findGitHubRepository")
);

check(
 "GitHub memory duplication prevented",
 git.includes("let duplicate=false")
);

check(
 "push result must match local HEAD",
 git.includes("pushed.commit!==local.head")
);

console.log("\n=== WORKSPACE / REMOTE SAFETY ===");

check(
 "Git initialization enforces workspace boundary",
 git.includes("assertGitWorkspace(project.workspace)")
);

check(
 "GitHub publishing enforces workspace boundary",
 github.includes("assertGitWorkspace(workspace)")
);

check(
 "remote target validated",
 github.includes("assertExpectedGitHubRemote")
);

check(
 "workspace root cannot be Git target",
 safety.includes("target===root")
);

check(
 "real path containment enforced",
 safety.includes("realpathSync")
);

console.log("\n=== CREDENTIAL SAFETY ===");

check(
 "GitHub token redacted from logs",
 redaction.toLowerCase().includes("github_token")
);

check(
 "GitHub credentials removed from generated sandbox environment",
 sandboxEnv.includes('"GITHUB_TOKEN"')
);

check(
 "token not stored in publication state",
 !publication.includes("GITHUB_TOKEN")
);

check(
 "token not embedded into persistent origin URL",
 !github.includes("x-access-token:${token}@")
);

console.log("\n=== FAILURE / JOB RECOVERY COMPATIBILITY ===");

check(
 "job runner retains failure classifier",
 runner.includes("classifyJobFailure")
);

check(
 "job runner retains controlled attempt consumption",
 runner.includes("consumeJobAttempt")
);

check(
 "job runner retains provider wait handling",
 runner.includes("provider_retryable")&&
 runner.includes("job.provider_wait")
);

check(
 "job runner retains process containment",
 runner.includes("cancelTaskSandboxes")
);

console.log("\n=== CHECKPOINT ORDER ===");

const committed=git.indexOf('stage:"committed"');
const repoReady=git.indexOf('stage:"repository_ready"');
const pushRuntime=git.indexOf("const pushed=await publishGitHubRepository");
const pushed=git.indexOf('stage:"pushed"',pushRuntime);
const verifyRuntime=git.indexOf("const verified=await verifyGitHubRepository");
const verified=git.indexOf('stage:"verified"',verifyRuntime);

check(
 "commit checkpoint exists before publication function",
 committed>=0&&committed<git.indexOf("export async function publishToGitHub")
);

check(
 "repository checkpoint precedes real push",
 repoReady>=0&&pushRuntime>=0&&repoReady<pushRuntime
);

check(
 "push checkpoint follows successful push",
 pushRuntime>=0&&pushed>pushRuntime
);

check(
 "push checkpoint precedes verification",
 pushed>=0&&verifyRuntime>pushed
);

check(
 "verified checkpoint follows verification",
 verifyRuntime>=0&&verified>verifyRuntime
);

console.log("\n============================================================");
console.log(" VEYLITH v0.9 BATCH 4 PASS 5 INTEGRATION");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

process.exitCode=failed?1:0;
