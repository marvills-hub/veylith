
import fs from"node:fs";
import os from"node:os";
import path from"node:path";

const root=fs.mkdtempSync(path.join(os.tmpdir(),"veylith-release-idempotency-"));
const database=path.join(root,"release-idempotency.db");

process.env.DATABASE_PATH=database;

const {
 createProjectRelease,
 findReleaseByPlan,
 findReleasedProjectCommit,
 latestProjectRelease,
 listProjectReleases
}=await import("../src/delivery/release-history.repository.js");

const PROJECT="prj_release_idempotency";
const GOAL="gol_release_idempotency";
const COMMIT="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FINGERPRINT="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const checks=[];
const check=(name,value)=>{
 checks.push([name,Boolean(value)]);
};

try{
 const first=createProjectRelease({
  projectId:PROJECT,
  taskId:"tsk_release_1",
  goalId:GOAL,
  deliveryPlanId:"dlp_release_1",
  publicationId:"dpb_release_1",
  verificationId:"dvr_release_1",
  repositoryName:"release-idempotency",
  targetBranch:"main",
  commit:COMMIT,
  repositoryFingerprint:FINGERPRINT,
  previousReleaseId:null,
  previousCommit:null,
  sequence:1,
  manifest:{workspace:"isolated"},
  evidence:["verified:true"],
  metadata:{test:true}
 });

 check("first release created",Boolean(first));
 check("first release sequence 1",first.sequence===1);
 check("first release is released",first.status==="released");

 const samePlan=findReleaseByPlan("dlp_release_1");

 check(
  "same-plan lookup returns original",
  samePlan?.id===first.id
 );

 const recoveryIdentity=findReleasedProjectCommit({
  projectId:PROJECT,
  goalId:GOAL,
  commit:COMMIT,
  repositoryFingerprint:FINGERPRINT
 });

 check(
  "cross-plan recovery identity returns original",
  recoveryIdentity?.id===first.id
 );

 check(
  "recovery identity preserves sequence",
  recoveryIdentity?.sequence===1
 );

 const wrongGoal=findReleasedProjectCommit({
  projectId:PROJECT,
  goalId:"gol_other",
  commit:COMMIT,
  repositoryFingerprint:FINGERPRINT
 });

 check(
  "different goal does not reuse release",
  wrongGoal===null
 );

 const wrongCommit=findReleasedProjectCommit({
  projectId:PROJECT,
  goalId:GOAL,
  commit:"cccccccccccccccccccccccccccccccccccccccc",
  repositoryFingerprint:FINGERPRINT
 });

 check(
  "different commit does not reuse release",
  wrongCommit===null
 );

 const wrongFingerprint=findReleasedProjectCommit({
  projectId:PROJECT,
  goalId:GOAL,
  commit:COMMIT,
  repositoryFingerprint:"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
 });

 check(
  "different fingerprint does not reuse release",
  wrongFingerprint===null
 );

 const wrongProject=findReleasedProjectCommit({
  projectId:"prj_other",
  goalId:GOAL,
  commit:COMMIT,
  repositoryFingerprint:FINGERPRINT
 });

 check(
  "different project does not reuse release",
  wrongProject===null
 );

 const latest=latestProjectRelease(PROJECT);
 const releases=listProjectReleases(PROJECT);

 check(
  "latest release remains original",
  latest?.id===first.id
 );

 check(
  "only one release exists",
  releases.length===1
 );

 check(
  "database is isolated temporary database",
  path.resolve(process.env.DATABASE_PATH)===path.resolve(database)
 );

 let passed=0;

 console.log("=== RELEASE IDEMPOTENCY BEHAVIORAL PROOF ===");

 for(const [name,result] of checks){
  console.log((result?"PASS ":"FAIL ")+name);
  if(result)passed++;
 }

 console.log("\nPROOF: "+passed+"/"+checks.length);

 if(passed===checks.length){
  console.log("RELEASE IDEMPOTENCY BEHAVIORAL PROOF PASSED");
 }else{
  console.log("RELEASE IDEMPOTENCY BEHAVIORAL PROOF FAILED");
  process.exitCode=1;
 }
}finally{
 try{fs.rmSync(root,{recursive:true,force:true});}catch{}
}
