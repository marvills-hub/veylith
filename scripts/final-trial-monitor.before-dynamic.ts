import{db}from"../src/database/database.js";
import{goalExecutionState}from"../src/team/goal-team-execution.service.js";

const requested=process.argv[2]?.trim();

function latestProject(){
 return db.prepare(`
  SELECT *
  FROM projects
  WHERE name LIKE 'Veylith Task API v1 Final Trial%'
  ORDER BY created_at DESC
  LIMIT 1
 `).get() as any;
}

const project=requested
 ?db.prepare("SELECT * FROM projects WHERE id=?").get(requested) as any
 :latestProject();

if(!project){
 console.log("No Veylith final-trial project exists yet.");
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

 try{
  console.log("\n=== AUTHORITATIVE GOAL STATE ===");
  console.log(goalExecutionState(goal.id));
 }catch(error){
  console.log("Goal state unavailable:",error instanceof Error?error.message:String(error));
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
console.table(db.prepare(`
 SELECT
  stage,
  commit_sha,
  branch,
  github_owner,
  github_repo,
  github_url,
  pushed_at,
  verified_at
 FROM git_publication_state
 WHERE project_id=?
`).all(project.id));

console.log("\n=== RELEASE ===");
console.table(db.prepare(`
 SELECT
  id,
  sequence,
  status,
  repository_name,
  target_branch,
  commit_hash,
  released_at
 FROM project_releases
 WHERE project_id=?
 ORDER BY sequence DESC
`).all(project.id));

console.log("\n=== RECENT EVENTS ===");
console.table(db.prepare(`
 SELECT component,type,message,created_at
 FROM events
 WHERE project_id=?
 ORDER BY id DESC
 LIMIT 15
`).all(project.id).reverse());

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
 `).get(project.id) as any;

 if(
  release&&
  publication?.stage==="verified"&&
  publication?.verified_at&&
  project.github_commit&&
  release.commit_hash===project.github_commit
 ){
  console.log("FINAL PRODUCTION TRIAL: PASS");
  console.log("Autonomous development, GitHub publication, remote verification and release are complete.");
 }else{
  console.log("PROJECT COMPLETED BUT DELIVERY EVIDENCE IS INCOMPLETE");
 }
}else if(project.status==="failed"){
 console.log("FINAL PRODUCTION TRIAL: FAILED");
}else{
 console.log("FINAL PRODUCTION TRIAL: RUNNING");
}