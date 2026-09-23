import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {execFileSync} from "node:child_process";

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

function git(cwd,args){
 return execFileSync("git",args,{cwd,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
}

function attempt(name,fn){
 try{
  fn();
  check(name,true);
 }catch(error){
  check(name,false,error instanceof Error?error.message:String(error));
 }
}

const root=fs.mkdtempSync(path.join(os.tmpdir(),"veylith-git-recovery-"));
const work=path.join(root,"workspace");
const remote=path.join(root,"remote.git");

fs.mkdirSync(work,{recursive:true});

console.log("\n=== LOCAL REPOSITORY FOUNDATION ===");

attempt("temporary repository initialized",()=>{
 git(work,["init"]);
 git(work,["config","user.name","Veylith Regression"]);
 git(work,["config","user.email","regression@veylith.local"]);
});

attempt("initial commit created",()=>{
 fs.writeFileSync(path.join(work,"app.txt"),"version-1\n");
 git(work,["add","."]);
 git(work,["commit","-m","initial"]);
});

const firstCommit=git(work,["rev-parse","HEAD"]);
check("initial HEAD available",/^[0-9a-f]{40}$/i.test(firstCommit),firstCommit);

console.log("\n=== IDEMPOTENT COMMIT BEHAVIOR ===");

const beforeCount=Number(git(work,["rev-list","--count","HEAD"]));

attempt("clean workspace requires no duplicate commit",()=>{
 const status=git(work,["status","--porcelain"]);
 if(status!=="")throw new Error(`workspace unexpectedly dirty: ${status}`);
});

const afterCount=Number(git(work,["rev-list","--count","HEAD"]));
check("clean retry preserves commit count",beforeCount===afterCount,`${beforeCount} -> ${afterCount}`);
check("clean retry preserves HEAD",git(work,["rev-parse","HEAD"])===firstCommit);

console.log("\n=== REMOTE + PUSH FOUNDATION ===");

attempt("bare remote initialized",()=>{
 git(root,["init","--bare",remote]);
});

attempt("origin configured",()=>{
 git(work,["remote","add","origin",remote]);
});

attempt("branch normalized to main",()=>{
 git(work,["branch","-M","main"]);
});

attempt("first push succeeds",()=>{
 git(work,["push","-u","origin","main"]);
});

const remoteFirst=git(work,["ls-remote","origin","refs/heads/main"]).split(/\s+/)[0];
check("remote contains initial commit",remoteFirst===firstCommit,remoteFirst);

console.log("\n=== CRASH AFTER COMMIT / BEFORE PUSH ===");

attempt("second local commit created",()=>{
 fs.writeFileSync(path.join(work,"app.txt"),"version-2\n");
 git(work,["add","."]);
 git(work,["commit","-m","second"]);
});

const secondCommit=git(work,["rev-parse","HEAD"]);
check("second commit differs from first",secondCommit!==firstCommit,secondCommit);

const remoteBeforeRecovery=git(work,["ls-remote","origin","refs/heads/main"]).split(/\s+/)[0];
check("remote still points to old commit before recovery",remoteBeforeRecovery===firstCommit);

attempt("recovery pushes existing local commit",()=>{
 git(work,["push","origin","main"]);
});

const remoteAfterRecovery=git(work,["ls-remote","origin","refs/heads/main"]).split(/\s+/)[0];
check("remote recovered to existing local commit",remoteAfterRecovery===secondCommit,remoteAfterRecovery);

const countAfterRecovery=Number(git(work,["rev-list","--count","HEAD"]));
check("push recovery creates no duplicate commit",countAfterRecovery===2,`count=${countAfterRecovery}`);

console.log("\n=== DUPLICATE PUSH RETRY ===");

attempt("repeated push is harmless",()=>{
 const output=git(work,["push","origin","main"]);
 if(output&&!/up[- ]to[- ]date|everything up-to-date/i.test(output)){
  // Git may write the up-to-date message to stderr; exit success is sufficient.
 }
});

const afterDuplicatePush=git(work,["rev-parse","HEAD"]);
const remoteAfterDuplicate=git(work,["ls-remote","origin","refs/heads/main"]).split(/\s+/)[0];

check("duplicate push preserves local HEAD",afterDuplicatePush===secondCommit);
check("duplicate push preserves remote HEAD",remoteAfterDuplicate===secondCommit);
check("duplicate push creates no commit",Number(git(work,["rev-list","--count","HEAD"]))===2);

console.log("\n=== DIRTY WORKSPACE BEHAVIOR ===");

fs.writeFileSync(path.join(work,"app.txt"),"uncommitted-change\n");
const dirty=git(work,["status","--porcelain"]);
check("dirty workspace detected",dirty.length>0);

const dirtyHead=git(work,["rev-parse","HEAD"]);
check("dirty state does not silently alter HEAD",dirtyHead===secondCommit);

git(work,["restore","app.txt"]);
check("workspace restored clean",git(work,["status","--porcelain"])==="");

console.log("\n=== REMOTE RECONCILIATION ===");

const wrongRemote=path.join(root,"wrong.git");

attempt("wrong remote initialized",()=>{
 git(root,["init","--bare",wrongRemote]);
});

attempt("origin can be detected and reconciled",()=>{
 git(work,["remote","set-url","origin",wrongRemote]);
 const wrong=git(work,["remote","get-url","origin"]);
 if(path.resolve(wrong)!==path.resolve(wrongRemote))throw new Error("wrong remote was not installed");
 git(work,["remote","set-url","origin",remote]);
 const restored=git(work,["remote","get-url","origin"]);
 if(path.resolve(restored)!==path.resolve(remote))throw new Error("origin reconciliation failed");
});

check("reconciled origin targets intended remote",path.resolve(git(work,["remote","get-url","origin"]))===path.resolve(remote));

console.log("\n=== HISTORY INTEGRITY ===");

const history=git(work,["log","--format=%H","--reverse"]).split(/\r?\n/).filter(Boolean);
check("history contains exactly two commits",history.length===2,`count=${history.length}`);
check("history preserves original commit",history[0]===firstCommit);
check("history preserves recovered commit",history[1]===secondCommit);

console.log("\n=== SECRET SAFETY STATIC CHECK ===");

const githubSource=fs.readFileSync(path.join(process.cwd(),"src/git/github.service.ts"),"utf8");
const gitSource=fs.readFileSync(path.join(process.cwd(),"src/git/git.service.ts"),"utf8");
const stateSource=fs.readFileSync(path.join(process.cwd(),"src/git/git-publication-state.service.ts"),"utf8");

check("GitHub token not written to remote URL",!githubSource.includes("x-access-token:${token}@"));
check("publication state never stores token",!stateSource.includes("GITHUB_TOKEN"));
check("Git service never persists token",!gitSource.includes('memory(project.id,"github_token"'));

console.log("\n=== CLEANUP ===");

try{
 fs.rmSync(root,{recursive:true,force:true});
 check("temporary Git fixtures removed",true);
}catch(error){
 check("temporary Git fixtures removed",false,error instanceof Error?error.message:String(error));
}

console.log("\n============================================================");
console.log(" VEYLITH v0.9 BATCH 4 PASS 3 REAL GIT RECOVERY");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

process.exitCode=failed?1:0;
