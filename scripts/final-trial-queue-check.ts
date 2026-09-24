import{db}from"../src/database/database.js";

const rows=db.prepare(`
 SELECT
  j.id AS job_id,
  j.status AS job_status,
  j.attempts,
  j.max_attempts,
  t.id AS task_id,
  t.name AS task_name,
  t.project_id,
  p.name AS project_name,
  p.workspace
 FROM jobs j
 LEFT JOIN tasks t ON t.id=j.task_id
 LEFT JOIN projects p ON p.id=t.project_id
 WHERE j.status IN ('queued','retrying','running','waiting','waiting_ai')
 ORDER BY j.created_at
`).all();

console.log(JSON.stringify(rows,null,2));
console.log("");
console.log("ACTIVE/RECOVERABLE JOBS:",rows.length);
