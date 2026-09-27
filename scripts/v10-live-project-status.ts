import"dotenv/config";
import{db}from"../src/database/database.js";

const projectId="prj_fd1509cedbaae7df";
const goalId="gol_805fc36b115ffa59";

console.log("\n============================================================");
console.log(" VEYLITH LIVE AUTONOMOUS PROJECT STATUS");
console.log("============================================================");

console.log("\n=== WORK GRAPH ===");
console.table(
 db.prepare(`
  SELECT kind,title,status
  FROM goal_work_items
  WHERE goal_id=?
  ORDER BY priority DESC,created_at,rowid
 `).all(goalId)
);

console.log("\n=== TASKS ===");
console.table(
 db.prepare(`
  SELECT id,title,status
  FROM tasks
  WHERE project_id=?
  ORDER BY created_at,rowid
 `).all(projectId)
);

console.log("\n=== JOBS ===");
console.table(
 db.prepare(`
  SELECT id,task_id,status,attempts,last_error
  FROM jobs
  WHERE project_id=?
  ORDER BY created_at,rowid
 `).all(projectId)
);

console.log("\n=== PROJECT ===");
console.table(
 db.prepare(`
  SELECT
   id,
   name,
   status,
   github_repo,
   github_commit,
   github_pushed_at
  FROM projects
  WHERE id=?
 `).all(projectId)
);

console.log("\n=== RELEASES ===");
console.table(
 db.prepare(`
  SELECT *
  FROM project_releases
  WHERE project_id=?
 `).all(projectId)
);

console.log("\n============================================================");

console.log("\n=== LAST AI EVENTS ===");
console.table(
 db.prepare(`
  SELECT created_at,type,message,data
  FROM events
  WHERE type LIKE 'ai.%'
  ORDER BY created_at DESC
  LIMIT 15
 `).all()
);
