import{db}from"../src/database/database.js";

const projectId="prj_59e5737b2866ea25";

const project=db.prepare(`
 SELECT *
 FROM projects
 WHERE id=?
`).get(projectId);

const goal=db.prepare(`
 SELECT *
 FROM project_goals
 WHERE project_id=?
 ORDER BY created_at DESC
 LIMIT 1
`).get(projectId) as any;

const work=goal?db.prepare(`
 SELECT *
 FROM goal_work_items
 WHERE goal_id=?
 ORDER BY created_at
`).all(goal.id):[];

const tasks=db.prepare(`
 SELECT *
 FROM tasks
 WHERE project_id=?
 ORDER BY created_at
`).all(projectId);

const taskIds=(tasks as any[]).map(t=>t.id);
const jobs=taskIds.length
 ?db.prepare(`
   SELECT *
   FROM jobs
   WHERE task_id IN (${taskIds.map(()=>"?").join(",")})
   ORDER BY created_at
  `).all(...taskIds)
 :[];

const sessions=db.prepare(`
 SELECT *
 FROM development_sessions
 WHERE project_id=?
 ORDER BY created_at
`).all(projectId);

const lifecycle=db.prepare(`
 SELECT *
 FROM autonomous_lifecycle_checkpoints
 WHERE project_id=?
 ORDER BY updated_at DESC
`).all(projectId);

console.log("\n============================================================");
console.log(" VEYLITH v1.0 REAL TRIAL MONITOR");
console.log("============================================================");

console.log("\n=== PROJECT ===");
console.log(JSON.stringify(project,null,2));

console.log("\n=== GOAL ===");
console.log(JSON.stringify(goal,null,2));

console.log("\n=== GOAL WORK ===");
console.log(JSON.stringify(work,null,2));

console.log("\n=== TASKS ===");
console.log(JSON.stringify(tasks,null,2));

console.log("\n=== JOBS ===");
console.log(JSON.stringify(jobs,null,2));

console.log("\n=== DEVELOPMENT SESSIONS ===");
console.log(JSON.stringify(sessions,null,2));

console.log("\n=== V1 LIFECYCLE ===");
console.log(JSON.stringify(lifecycle,null,2));

const counts=(work as any[]).reduce((r:any,w:any)=>{
 r[w.status]=(r[w.status]||0)+1;
 return r;
},{});

console.log("\n============================================================");
console.log(" WORK STATUS:",JSON.stringify(counts));
console.log(" PROJECT STATUS:",(project as any)?.status);
console.log(" LIFECYCLE:",(lifecycle as any[])[0]?.stage||"none","/",(lifecycle as any[])[0]?.status||"none");
console.log("============================================================");
