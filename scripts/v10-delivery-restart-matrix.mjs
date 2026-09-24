import crypto from"node:crypto";
import{db}from"../src/database/database.js";
import{createProjectGoal,updateGoalStatus,deleteProjectGoal}from"../src/goals/goal.repository.js";
import{newGoalWorkItem,saveGoalTaskGraph,updateGoalWorkStatus,deleteGoalTaskGraph}from"../src/goals/goal-task-graph.repository.js";
import{ensureLifecycleCheckpoint}from"../src/orchestration/v1/lifecycle/lifecycle.repository.js";
import{recoverAutonomousLifecycles}from"../src/orchestration/v1/lifecycle/lifecycle-recovery.service.js";

const suffix=crypto.randomBytes(6).toString("hex");
const prefix=`v10-recovery-${suffix}`;
const now=()=>new Date().toISOString();
let passed=0;
let failed=0;
const fixtures=[];

function check(name,ok,detail=""){
 if(ok){
  console.log(`PASS ${name}`);
  passed++;
 }else{
  console.log(`FAIL ${name}${detail?`: ${detail}`:""}`);
  failed++;
 }
}

function id(prefix){return`${prefix}_${crypto.randomBytes(8).toString("hex")}`;}

function createProject(projectId,workspace){
 const columns=db.prepare("PRAGMA table_info(projects)").all();
 const names=new Set(columns.map(row=>String(row.name)));
 const values={
  id:projectId,
  name:`Recovery ${projectId}`,
  slug:projectId,
  workspace,
  status:"active",
  created_at:now(),
  updated_at:now()
 };
 const usable=Object.keys(values).filter(key=>names.has(key));
 if(!usable.includes("id"))throw new Error("projects table has no id column");
 const sql=`INSERT INTO projects(${usable.join(",")}) VALUES(${usable.map(()=>"?").join(",")})`;
 db.prepare(sql).run(...usable.map(key=>values[key]));
}

function createBase(label){
 const projectId=`${prefix}-${label}`;
 const workspace=`C:\\VEYLITH\\veylith\\workspaces\\${projectId}`;
 createProject(projectId,workspace);

 const goal=createProjectGoal({
  projectId,
  title:`Recovery ${label}`,
  objective:`Prove ${label} recovery`,
  requirements:[],
  acceptanceCriteria:[],
  constraints:[]
 });
 updateGoalStatus(goal.id,"active");

 const work=newGoalWorkItem(goal.id,projectId,{
  key:"implementation",
  title:"Completed work",
  description:"Already completed before restart.",
  kind:"implementation",
  priority:100,
  dependencies:[],
  requirementIds:[],
  acceptanceCriterionIds:[]
 });
 saveGoalTaskGraph([work]);
 updateGoalWorkStatus(work.id,"completed");
 updateGoalStatus(goal.id,"completed");

 ensureLifecycleCheckpoint({
  projectId,
  goalId:goal.id,
  taskId:null,
  workItemId:work.id
 });

 fixtures.push({projectId,goalId:goal.id,workItemId:work.id});
 return{projectId,goalId:goal.id,workItemId:work.id,workspace};
}

function createPlan(f){
 const planId=id("dlp");
 const readinessId=id("dlr");
 const time=now();
 const manifest={
  projectId:f.projectId,
  taskId:null,
  goalId:f.goalId,
  readinessId,
  workspace:f.workspace,
  repositoryFingerprint:`fp_${suffix}`,
  repositoryFiles:[],
  repositoryName:`repo-${suffix}`,
  targetBranch:"main",
  visibility:"private",
  stages:[],
  evidence:[],
  metadata:{fixture:true},
  generatedAt:time
 };
 db.prepare(`
  INSERT INTO delivery_plans(
   id,project_id,task_id,goal_id,readiness_id,status,
   manifest_json,created_at,updated_at,delivered_at
  ) VALUES(?,?,?,?,?,'planned',?,?,?,NULL)
 `).run(
  planId,f.projectId,null,f.goalId,readinessId,
  JSON.stringify(manifest),time,time
 );
 db.prepare(`
  UPDATE autonomous_lifecycle_checkpoints
  SET delivery_plan_id=?,stage='delivery',status='waiting',updated_at=?
  WHERE goal_id=?
 `).run(planId,time,f.goalId);
 return{planId,readinessId,manifest};
}

function createPublication(f,plan,status="published"){
 const publicationId=id("dpb");
 const time=now();
 const commit=`commit_${suffix}_${crypto.randomBytes(4).toString("hex")}`;
 db.prepare(`
  INSERT INTO delivery_publications(
   id,project_id,task_id,goal_id,delivery_plan_id,
   commit_preparation_id,readiness_id,workspace,
   repository_name,target_branch,visibility,commit_hash,
   repository_fingerprint,status,github_json,error,
   metadata_json,created_at,updated_at,published_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  publicationId,f.projectId,null,f.goalId,plan.planId,
  id("dcp"),plan.readinessId,f.workspace,
  `repo-${suffix}`,"main","private",commit,
  `fp_${suffix}`,status,
  status==="published"?JSON.stringify({fixture:true}):null,
  null,JSON.stringify({fixture:true}),time,time,
  status==="published"?time:null
 );
 db.prepare(`
  UPDATE autonomous_lifecycle_checkpoints
  SET publication_id=?,stage='verification',status='waiting',updated_at=?
  WHERE goal_id=?
 `).run(publicationId,time,f.goalId);
 return{publicationId,commit};
}

function createVerification(f,plan,pub,verified=true){
 const verificationId=id("dvr");
 const time=now();
 db.prepare(`
  INSERT INTO delivery_verifications(
   id,project_id,task_id,goal_id,delivery_plan_id,publication_id,
   expected_commit,actual_commit,repository_name,target_branch,
   status,verified,recovery_action,attempts,error,evidence_json,
   metadata_json,created_at,updated_at,verified_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  verificationId,f.projectId,null,f.goalId,plan.planId,pub.publicationId,
  pub.commit,verified?pub.commit:null,`repo-${suffix}`,"main",
  verified?"verified":"pending",verified?1:0,"none",
  verified?1:0,null,JSON.stringify(["fixture"]),
  JSON.stringify({fixture:true}),time,time,verified?time:null
 );
 db.prepare(`
  UPDATE autonomous_lifecycle_checkpoints
  SET verification_id=?,stage='release',status='waiting',updated_at=?
  WHERE goal_id=?
 `).run(verificationId,time,f.goalId);
 return{verificationId};
}

function createRelease(f,plan,pub,verification){
 const releaseId=id("rel");
 const time=now();

 const columns=db.prepare("PRAGMA table_info(project_releases)").all();
 const names=new Set(columns.map(row=>String(row.name)));

 const values={
  id:releaseId,
  project_id:f.projectId,
  task_id:null,
  goal_id:f.goalId,
  delivery_plan_id:plan.planId,
  publication_id:pub.publicationId,
  verification_id:verification.verificationId,
  repository_name:`repo-${suffix}`,
  target_branch:"main",
  commit_hash:pub.commit,
  repository_fingerprint:`fp_${suffix}`,
  previous_release_id:null,
  previous_commit:null,
  sequence:1,
  status:"released",
  manifest_json:JSON.stringify(plan.manifest),
  evidence_json:JSON.stringify(["fixture"]),
  metadata_json:JSON.stringify({fixture:true}),
  released_at:time,
  created_at:time,
  updated_at:time
 };

 const usable=Object.keys(values).filter(key=>names.has(key));
 const sql=`INSERT INTO project_releases(${usable.join(",")}) VALUES(${usable.map(()=>"?").join(",")})`;
 db.prepare(sql).run(...usable.map(key=>values[key]));

 db.prepare(`
  UPDATE autonomous_lifecycle_checkpoints
  SET release_id=?,stage='release',status='waiting',updated_at=?
  WHERE goal_id=?
 `).run(releaseId,time,f.goalId);

 return{releaseId};
}

function lifecycle(goalId){
 const row=db.prepare(`
  SELECT *
  FROM autonomous_lifecycle_checkpoints
  WHERE goal_id=?
  LIMIT 1
 `).get(goalId);
 if(!row)return null;
 return{
  id:String(row.id),
  projectId:String(row.project_id),
  goalId:String(row.goal_id),
  taskId:row.task_id?String(row.task_id):null,
  workItemId:row.work_item_id?String(row.work_item_id):null,
  status:String(row.status),
  stage:String(row.stage),
  deliveryPlanId:row.delivery_plan_id?String(row.delivery_plan_id):null,
  publicationId:row.publication_id?String(row.publication_id):null,
  verificationId:row.verification_id?String(row.verification_id):null,
  releaseId:row.release_id?String(row.release_id):null
 };
}

function counts(f){
 const one=table=>Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE project_id=?`).get(f.projectId).count);
 return{
  plans:one("delivery_plans"),
  publications:one("delivery_publications"),
  verifications:one("delivery_verifications"),
  releases:one("project_releases")
 };
}

function cleanup(){
 for(const f of [...fixtures].reverse()){
  try{db.prepare("DELETE FROM project_releases WHERE project_id=?").run(f.projectId);}catch{}
  try{db.prepare("DELETE FROM delivery_verifications WHERE project_id=?").run(f.projectId);}catch{}
  try{db.prepare("DELETE FROM delivery_publications WHERE project_id=?").run(f.projectId);}catch{}
  try{db.prepare("DELETE FROM delivery_plans WHERE project_id=?").run(f.projectId);}catch{}
  try{db.prepare("DELETE FROM autonomous_lifecycle_checkpoints WHERE goal_id=?").run(f.goalId);}catch{}
  try{deleteGoalTaskGraph(f.goalId);}catch{}
  try{deleteProjectGoal(f.goalId);}catch{}
  try{db.prepare("DELETE FROM projects WHERE id=?").run(f.projectId);}catch{}
 }
}

console.log(`Fixture: ${suffix}`);
console.log("AI: NONE");
console.log("GitHub API: NONE");
console.log("Pushes: NONE");

try{
 console.log("\n--- CASE A: GOAL COMPLETE / NO DELIVERY PLAN ---");
 const a=createBase("no-plan");
 recoverAutonomousLifecycles();
 let cp=lifecycle(a.goalId);
 check("A lifecycle exists",!!cp);
 check("A waits at delivery",cp?.stage==="delivery"&&cp?.status==="waiting",`${cp?.stage}/${cp?.status}`);
 check("A is not completed",cp?.status!=="completed");
 let before=counts(a);
 recoverAutonomousLifecycles();
 cp=lifecycle(a.goalId);
 let after=counts(a);
 check("A second recovery remains delivery/waiting",cp?.stage==="delivery"&&cp?.status==="waiting");
 check("A recovery creates no delivery state",JSON.stringify(before)===JSON.stringify(after),JSON.stringify(after));

 console.log("\n--- CASE B: PUBLISHED / NO VERIFICATION ---");
 const b=createBase("published");
 const bp=createPlan(b);
 const bpub=createPublication(b,bp,"published");
 recoverAutonomousLifecycles();
 cp=lifecycle(b.goalId);
 check("B waits at verification",cp?.stage==="verification"&&cp?.status==="waiting",`${cp?.stage}/${cp?.status}`);
 check("B preserves plan identity",cp?.deliveryPlanId===bp.planId);
 check("B preserves publication identity",cp?.publicationId===bpub.publicationId);
 before=counts(b);
 recoverAutonomousLifecycles();
 after=counts(b);
 check("B second recovery creates no duplicate publication",before.publications===1&&after.publications===1);
 check("B second recovery creates no verification",after.verifications===0);
 check("B second recovery creates no release",after.releases===0);

 console.log("\n--- CASE C: VERIFIED / PLAN STILL PLANNED ---");
 const c=createBase("verified-planned");
 const cpPlan=createPlan(c);
 const cpub=createPublication(c,cpPlan,"published");
 const cver=createVerification(c,cpPlan,cpub,true);
 recoverAutonomousLifecycles();
 cp=lifecycle(c.goalId);
 check("C waits at release",cp?.stage==="release"&&cp?.status==="waiting",`${cp?.stage}/${cp?.status}`);
 check("C preserves verification identity",cp?.verificationId===cver.verificationId);
 const cPlanStatus=String(db.prepare("SELECT status FROM delivery_plans WHERE id=?").get(cpPlan.planId).status);
 check("C heals verified crash-window plan to delivered",cPlanStatus==="delivered",`status=${cPlanStatus}`);
 before=counts(c);
 recoverAutonomousLifecycles();
 after=counts(c);
 check("C repeated recovery creates no duplicate verification",after.verifications===1);
 check("C repeated recovery creates no release",after.releases===0);
 check("C state counts stable",JSON.stringify(before)===JSON.stringify(after),JSON.stringify(after));

 console.log("\n--- CASE D: VERIFIED + DELIVERED / NO RELEASE ---");
 const d=createBase("verified-delivered");
 const dp=createPlan(d);
 const dpub=createPublication(d,dp,"published");
 const dver=createVerification(d,dp,dpub,true);
 db.prepare("UPDATE delivery_plans SET status='delivered',delivered_at=?,updated_at=? WHERE id=?").run(now(),now(),dp.planId);
 recoverAutonomousLifecycles();
 cp=lifecycle(d.goalId);
 check("D waits at release",cp?.stage==="release"&&cp?.status==="waiting",`${cp?.stage}/${cp?.status}`);
 check("D is not lifecycle-completed before release",cp?.status!=="completed");
 before=counts(d);
 recoverAutonomousLifecycles();
 after=counts(d);
 check("D repeated recovery creates no release automatically",after.releases===0);
 check("D repeated recovery state counts stable",JSON.stringify(before)===JSON.stringify(after));

 console.log("\n--- CASE E: DURABLE RELEASE EXISTS ---");
 const e=createBase("released");
 const ep=createPlan(e);
 const epub=createPublication(e,ep,"published");
 const ever=createVerification(e,ep,epub,true);
 db.prepare("UPDATE delivery_plans SET status='delivered',delivered_at=?,updated_at=? WHERE id=?").run(now(),now(),ep.planId);
 const erel=createRelease(e,ep,epub,ever);
 recoverAutonomousLifecycles();
 cp=lifecycle(e.goalId);
 check("E lifecycle completes",cp?.stage==="completed"&&cp?.status==="completed",`${cp?.stage}/${cp?.status}`);
 check("E records release identity",cp?.releaseId===erel.releaseId);
 before=counts(e);
 recoverAutonomousLifecycles();
 after=counts(e);
 check("E second recovery does not duplicate release",before.releases===1&&after.releases===1);
 check("E second recovery does not duplicate publication",before.publications===1&&after.publications===1);
 check("E second recovery does not duplicate verification",before.verifications===1&&after.verifications===1);
 check("E durable counts remain stable",JSON.stringify(before)===JSON.stringify(after),JSON.stringify(after));

 console.log("\n--- CROSS-CASE SAFETY ---");
 const all=[a,b,c,d,e];
 check("exactly five disposable projects created",all.length===5);
 check("no case created an unexpected second plan",all.every(x=>counts(x).plans<=1));
 check("no case created an unexpected second publication",all.every(x=>counts(x).publications<=1));
 check("no case created an unexpected second verification",all.every(x=>counts(x).verifications<=1));
 check("only released case has a release",counts(e).releases===1&&[a,b,c,d].every(x=>counts(x).releases===0));
}finally{
 console.log("\n--- CLEANUP ---");
 cleanup();
 const remaining=Number(
  db.prepare("SELECT COUNT(*) AS count FROM projects WHERE id LIKE ?").get(`${prefix}%`).count
 );
 check("cleanup removed disposable projects",remaining===0);
}

console.log("\n============================================================");
console.log(" BATCH 7.2F.2 DETERMINISTIC RESTART MATRIX");
console.log(` Passed: ${passed}`);
console.log(` Failed: ${failed}`);
console.log(" AI calls: NONE");
console.log(" GitHub API: NONE");
console.log(" Pushes: NONE");
console.log(" Version: unchanged");
console.log("============================================================");

if(!failed)console.log(" BATCH 7.2F.2: PASS");
else console.log(" BATCH 7.2F.2: NEEDS REPAIR");

process.exitCode=failed?1:0;



