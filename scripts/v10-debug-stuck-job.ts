import "dotenv/config";
import {db} from "../src/database/database.js";

const projectId="prj_fd1509cedbaae7df";
const jobId="job_8205ae165fe24366";

console.log("\n=== JOB ===");
console.table(db.prepare("SELECT * FROM jobs WHERE id=?").all(jobId));

console.log("\n=== TASK ===");
console.table(db.prepare(`
 SELECT *
 FROM tasks
 WHERE project_id=?
 ORDER BY updated_at DESC
 LIMIT 10
`).all(projectId));

console.log("\n=== EVENTS ===");
console.table(db.prepare(`
 SELECT id,type,message,level,task_id,project_id,data,created_at
 FROM events
 WHERE project_id=?
 ORDER BY created_at DESC
 LIMIT 40
`).all(projectId));

console.log("\n=== ROLE RESULTS ===");
try{
 console.table(db.prepare(`
  SELECT *
  FROM goal_role_results
  WHERE project_id=?
  ORDER BY created_at DESC
  LIMIT 20
 `).all(projectId));
}catch(error){
 console.log("goal_role_results:",error instanceof Error?error.message:String(error));
}

console.log("\n=== ASSIGNMENTS ===");
try{
 console.table(db.prepare(`
  SELECT *
  FROM goal_work_assignments
  WHERE project_id=?
  ORDER BY created_at DESC
  LIMIT 20
 `).all(projectId));
}catch(error){
 console.log("goal_work_assignments:",error instanceof Error?error.message:String(error));
}

console.log("\n=== LIFECYCLE ===");
try{
 console.table(db.prepare(`
  SELECT *
  FROM autonomous_lifecycle_checkpoints
  WHERE project_id=?
  ORDER BY updated_at DESC
 `).all(projectId));
}catch(error){
 console.log("lifecycle:",error instanceof Error?error.message:String(error));
}

