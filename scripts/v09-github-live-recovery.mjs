import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {simpleGit} from "simple-git";
import {createGitHubRepository,publishGitHubRepository,verifyGitHubRepository,findGitHubRepository} from "../dist/git/github.service.js";

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

function fail(name,error){
 console.log(`FAIL ${name} - ${error instanceof Error?error.message:String(error)}`);
 failed++;
}

function git(cwd,args){
 return execFileSync("git",args,{cwd,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
}

const token=(process.env.GITHUB_TOKEN||"").trim();
const owner=(process.env.GITHUB_OWNER||"").trim();

if(!token||!owner){
 console.log("FAIL GitHub configuration - GITHUB_TOKEN or GITHUB_OWNER is missing.");
 process.exitCode=1;
}else{
 const stamp=Date.now();
 const suffix=crypto.randomBytes(3).toString("hex");
 const repoName=`veylith-v09-git-recovery-test-${stamp}-${suffix}`;
 const workspaceRoot=path.resolve(process.env.WORKSPACE_ROOT||"./workspaces");
 const workspace=path.join(workspaceRoot,repoName);

 console.log(`Owner: ${owner}`);
 console.log(`Repository: ${repoName}`);
 console.log("Visibility: private");
 console.log(`Workspace: ${workspace}`);

 try{
  fs.mkdirSync(workspace,{recursive:true});

  console.log("\n=== LOCAL PROJECT ===");

  const localGit=simpleGit(workspace);

  await localGit.init();
  await localGit.addConfig("user.name","Veylith");
  await localGit.addConfig("user.email","veylith@local");

  fs.writeFileSync(
   path.join(workspace,"README.md"),
   `# Veylith Git Recovery Test\n\nBatch 4 live GitHub recovery proof.\n\nID: ${stamp}-${suffix}\n`,
   "utf8"
  );

  fs.writeFileSync(
   path.join(workspace,"proof.json"),
   JSON.stringify({
    system:"Veylith",
    version:"0.9",
    batch:4,
    pass:4,
    purpose:"GitHub recovery proof",
    id:`${stamp}-${suffix}`
   },null,2),
   "utf8"
  );

  await localGit.add(".");
  await localGit.commit("Veylith: Batch 4 live GitHub recovery proof");
  await localGit.branch(["-M","main"]);

  const firstLocalCommit=git(workspace,["rev-parse","HEAD"]);
  const firstCommitCount=Number(git(workspace,["rev-list","--count","HEAD"]));

  check("local repository initialized",fs.existsSync(path.join(workspace,".git")));
  check("local commit created",/^[0-9a-f]{40}$/i.test(firstLocalCommit),firstLocalCommit);
  check("exactly one local commit exists",firstCommitCount===1,`count=${firstCommitCount}`);

  console.log("\n=== LIVE GITHUB REPOSITORY CREATION ===");

  let repository;

  try{
   repository=await createGitHubRepository(
    {token,owner,visibility:"private"},
    repoName,
    "Temporary private repository created by Veylith v0.9 Batch 4 live recovery regression."
   );

   check("GitHub repository created or recovered",Boolean(repository?.name),repository?.fullName||"");
   check("GitHub repository is private",repository.private===true);
   check("GitHub owner matches configuration",repository.owner.toLowerCase()===owner.toLowerCase(),repository.owner);
  }catch(error){
   fail("GitHub repository creation",error);
   throw error;
  }

  console.log("\n=== FIRST REAL PUSH ===");

  let firstPush;

  try{
   firstPush=await publishGitHubRepository(workspace,repository,token);

   check("first push returned commit",firstPush.commit===firstLocalCommit,firstPush.commit||"null");
   check("first push normalized branch to main",firstPush.branch==="main",firstPush.branch);
  }catch(error){
   fail("first real GitHub push",error);
   throw error;
  }

  const firstVerified=await verifyGitHubRepository(token,repository.owner,repository.name);

  check("repository verifies after push",firstVerified.name===repoName,firstVerified.fullName);

  const origin=git(workspace,["remote","get-url","origin"]);

  check(
   "origin contains no access token",
   !/x-access-token|ghp_|github_pat_/i.test(origin),
   origin
  );

  console.log("\n=== SIMULATED RESTART / REPOSITORY RECOVERY ===");

  const recoveredRepository=await findGitHubRepository(token,owner,repoName);

  check("existing repository recovered",Boolean(recoveredRepository));
  check(
   "recovery returns same repository",
   recoveredRepository?.fullName===repository.fullName,
   recoveredRepository?.fullName||"null"
  );

  console.log("\n=== DUPLICATE CREATE ATTEMPT ===");

  const secondCreate=await createGitHubRepository(
   {token,owner,visibility:"private"},
   repoName,
   "This call must recover the existing repository instead of creating another one."
  );

  check("second create returns same repository",secondCreate.fullName===repository.fullName,secondCreate.fullName);
  check("second create preserves repository URL",secondCreate.htmlUrl===repository.htmlUrl);

  console.log("\n=== DUPLICATE PUSH / RECOVERY ===");

  const beforeRetryCommit=git(workspace,["rev-parse","HEAD"]);
  const beforeRetryCount=Number(git(workspace,["rev-list","--count","HEAD"]));

  const secondPush=await publishGitHubRepository(workspace,secondCreate,token);

  const afterRetryCommit=git(workspace,["rev-parse","HEAD"]);
  const afterRetryCount=Number(git(workspace,["rev-list","--count","HEAD"]));

  check("retry returns same commit",secondPush.commit===firstLocalCommit,secondPush.commit||"null");
  check("retry preserves local HEAD",afterRetryCommit===beforeRetryCommit,afterRetryCommit);
  check("retry creates no duplicate commit",afterRetryCount===beforeRetryCount,`${beforeRetryCount} -> ${afterRetryCount}`);

  console.log("\n=== REMOTE COMMIT VERIFICATION ===");

  const basic=Buffer.from(`x-access-token:${token}`,"utf8").toString("base64");

  let remoteCommit="";

  try{
   const output=execFileSync(
    "git",
    [
     "-c",
     `http.extraHeader=Authorization: Basic ${basic}`,
     "ls-remote",
     repository.cloneUrl,
     "refs/heads/main"
    ],
    {
     cwd:workspace,
     encoding:"utf8",
     stdio:["ignore","pipe","pipe"]
    }
   ).trim();

   remoteCommit=output.split(/\s+/)[0]||"";
  }catch(error){
   fail("remote commit lookup",error);
  }

  check("remote main points to local HEAD",remoteCommit===firstLocalCommit,remoteCommit||"null");
  check("remote commit unchanged after retry",remoteCommit===secondPush.commit);

  console.log("\n=== HISTORY INTEGRITY ===");

  const finalCount=Number(git(workspace,["rev-list","--count","HEAD"]));
  const finalHead=git(workspace,["rev-parse","HEAD"]);

  check("history still contains exactly one commit",finalCount===1,`count=${finalCount}`);
  check("final HEAD equals original commit",finalHead===firstLocalCommit,finalHead);

  console.log("\n=== CREDENTIAL SAFETY ===");

  const config=fs.readFileSync(path.join(workspace,".git","config"),"utf8");

  check("Git config contains no GitHub token",!config.includes(token));
  check("Git config contains no token username",!/x-access-token/i.test(config));
  check("Git origin uses clean HTTPS URL",origin===repository.cloneUrl,origin);

  console.log("\n============================================================");
  console.log(" VEYLITH v0.9 BATCH 4 PASS 4 LIVE GITHUB PROOF");
  console.log("============================================================");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Repository: ${repository.htmlUrl}`);
  console.log(`Commit: ${firstLocalCommit}`);
  console.log(`Workspace: ${workspace}`);
  console.log("");
  console.log("The temporary GitHub repository was intentionally NOT deleted.");

 }catch(error){
  console.log("");
  console.log("LIVE TEST STOPPED:");
  console.log(error instanceof Error?error.message:String(error));
  console.log("");
  console.log(`Repository name: ${repoName}`);
  console.log(`Workspace: ${workspace}`);
  console.log("Existing resources were intentionally left intact for recovery testing.");
  process.exitCode=1;
 }

 if(failed>0)process.exitCode=1;
}
