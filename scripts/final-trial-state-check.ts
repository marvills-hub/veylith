import{db}from"../src/database/database.js";

console.log("\n=== RECENT PROJECTS ===");
const projects=db.prepare(`
 SELECT id,name,workspace,status,created_at
 FROM projects
 ORDER BY created_at DESC
 LIMIT 10
`).all();
console.log(JSON.stringify(projects,null,2));

console.log("\n=== ACTIVE JOBS ===");
const jobs=db.prepare(`
 SELECT
  j.id AS job_id,
  j.status,
  j.attempts,
  j.max_attempts,
  j.task_id,
  t.project_id,
  p.name AS project_name,
  p.workspace
 FROM jobs j
 LEFT JOIN tasks t ON t.id=j.task_id
 LEFT JOIN projects p ON p.id=t.project_id
 WHERE j.status IN ('queued','retrying','running','waiting','waiting_ai')
 ORDER BY j.created_at
`).all();
console.log(JSON.stringify(jobs,null,2));

console.log("\nACTIVE/RECOVERABLE JOBS:",jobs.length);

console.log("\n=== V1 TRIAL MATCHES ===");
const trial=db.prepare(`
 SELECT id,name,workspace,status,created_at
 FROM projects
 WHERE name=?
 ORDER BY created_at DESC
`).all("Veylith Task API v1 Trial");
console.log(JSON.stringify(trial,null,2));
console.log("TRIAL PROJECT COUNT:",trial.length);
