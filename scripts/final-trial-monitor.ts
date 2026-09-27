import{db}from"../src/database/database.js";
import{goalExecutionState}from"../src/team/goal-team-execution.service.js";

const requested=process.argv[2]?.trim();

const project=requested
 ?db.prepare("SELECT * FROM projects WHERE id=?").get(requested) as any
 :db.prepare(`
  SELECT *
  FROM projects
  WHERE name LIKE 'Veylith Task API v1 Final Trial%'
  ORDER BY created_at DESC
  LIMIT 1
 `).get() as any;

if(!project){
 console.log("No Veylith final-trial project exists.");
 process.exit(0);
}

const goal=db.prepare(`
 SELECT *
 FROM project_goals
 WHERE project_id=?
 ORDER BY created_at DESC
 LIMIT 1
`).get(project.id) as any;

console.log("\n============================================================");
console.log("VEYLITH FINAL PRODUCTION TRIAL");
console.log("============================================================");
console.log(`Project : ${project.id}`);
console.log(`Name    : ${project.name}`);
console.log(`Status  : ${project.status}`);
console.log(`Phase   : ${project.phase}`);
console.log(`Progress: ${project.progress}%`);
console.log(`Workspace: ${project.workspace||"-"}`);

if(goal){
 console.log(`Goal    : ${goal.id}`);
 console.log(`Goal status: ${goal.status}`);

 console.log("\n=== AUTHORITATIVE GOAL STATE ===");
 try{
  console.log(goalExecutionState(goal.id));
 }catch(error){
  console.log(error instanceof Error?error.message:String(error));
 }

 console.log("\n=== WORK GRAPH ===");
 console.table(db.prepare(`
  SELECT work_key,title,kind,status
  FROM goal_work_items
  WHERE goal_id=?
  ORDER BY created_at ASC
 `).all(goal.id));

 console.log("\n=== ASSIGNMENTS ===");
 console.table(db.prepare(`
  SELECT
   w.work_key,
   a.role,
   a.status,
   a.started_at,
   a.completed_at
  FROM agent_assignments a
  JOIN goal_work_items w ON w.id=a.work_item_id
  WHERE w.goal_id=?
  ORDER BY a.created_at ASC
 `).all(goal.id));

 console.log("\n=== ACTIVE / FAILED JOBS ===");
 console.table(db.prepare(`
  SELECT
   j.id,
   t.title,
   j.status,
   j.attempts,
   j.max_attempts,
   j.last_error
  FROM jobs j
  JOIN tasks t ON t.id=j.task_id
  WHERE t.project_id=?
   AND j.status NOT IN ('completed','cancelled')
  ORDER BY j.created_at ASC
 `).all(project.id));
}

console.log("\n=== GITHUB ===");
console.table([{
 owner:project.github_owner,
 repository:project.github_repo,
 url:project.github_url,
 branch:project.github_branch,
 commit:project.github_commit,
 pushedAt:project.github_pushed_at
}]);

console.log("\n=== PUBLICATION ===");
const publicationTable=db.prepare(`
 SELECT *
 FROM git_publication_state
 WHERE project_id=?
`).all(project.id) as any[];
console.table(publicationTable);

console.log("\n=== RELEASE ===");
const releaseTable=db.prepare(`
 SELECT *
 FROM project_releases
 WHERE project_id=?
 ORDER BY sequence DESC
`).all(project.id) as any[];
console.table(releaseTable);

console.log("\n============================================================");

if(project.status==="completed"){
 const release=db.prepare(`
  SELECT *
  FROM project_releases
  WHERE project_id=? AND status='released'
  ORDER BY sequence DESC
  LIMIT 1
 `).get(project.id) as any;

 const publication=db.prepare(`
  SELECT *
  FROM git_publication_state
  WHERE project_id=?
  ORDER BY rowid DESC
  LIMIT 1
 `).get(project.id) as any;

 const releaseCommit=
  release?.commit_hash||
  release?.commit_sha||
  release?.github_commit||
  release?.commit||
  null;

 const publicationCommit=
  publication?.commit_hash||
  publication?.commit_sha||
  publication?.github_commit||
  publication?.commit||
  null;

 const remotelyVerified=
  publication?.stage==="verified"||
  Boolean(publication?.verified_at)||
  Boolean(publication?.remote_verified);

 if(
  release&&
  remotelyVerified&&
  project.github_commit&&
  (releaseCommit===project.github_commit||publicationCommit===project.github_commit)
 ){
  console.log("FINAL PRODUCTION TRIAL: PASS");
  console.log("Autonomous development, GitHub publication, remote verification and release are complete.");
 }else{
  console.log("PROJECT COMPLETED - checking final delivery evidence.");
 }
}else if(project.status==="failed"){
 console.log("FINAL PRODUCTION TRIAL: FAILED");
}else{
 console.log("FINAL PRODUCTION TRIAL: RUNNING");
}