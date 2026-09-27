import"dotenv/config";
import crypto from"node:crypto";
import fs from"node:fs";
import{db}from"../src/database/database.js";
import{createAutonomousProject}from"../src/core/task.service.js";

let passed=0;
let failed=0;

function check(name:string,value:boolean,detail=""){
 if(value){
  passed++;
  console.log(`PASS ${name}`);
 }else{
  failed++;
  console.error(`FAIL ${name}${detail?` - ${detail}`:""}`);
 }
}

function count(sql:string,...args:any[]){
 return Number((db.prepare(sql).get(...args)as any)?.count??0);
}

const token=crypto.randomBytes(6).toString("hex");
const name=`Veylith Autonomous E2E ${token}`;
const prompt=`
Build a minimal self-contained Node.js health API.

PROJECT REQUIREMENTS:
- Use Node.js.
- Provide GET /health.
- GET /health must return HTTP 200.
- The JSON response must contain status equal to ok.
- Include an automated test for the health endpoint.
- Include finite npm build and test scripts.
- Include a README with installation, testing and running instructions.
- Keep the implementation minimal.
- Do not use an external database or external service.
- Do not use watch mode.
- Do not publish this E2E fixture to GitHub.

ACCEPTANCE CRITERIA:
- A valid package.json is produced.
- npm build terminates successfully.
- npm test terminates successfully.
- GET /health returns HTTP 200.
- GET /health returns JSON with status equal to ok.
- Automated health endpoint validation exists.
- README documentation exists.
`.trim();

let projectId="";
let goalId="";
let workspace="";

console.log("\n============================================================");
console.log(" VEYLITH v1.0 AUTONOMOUS PRODUCTION E2E");
console.log("============================================================");
console.log(`Fixture: ${token}`);
console.log("Entry: createAutonomousProject()");
console.log("Production bootstrap: ENABLED");
console.log("Goal graph: ENABLED");
console.log("Worker dispatch: ENABLED");
console.log("GitHub publication: DISABLED BY FIXTURE");
console.log("============================================================\n");

try{
 console.log("--- PRODUCTION AUTONOMOUS INTAKE ---");

 const result=await createAutonomousProject(name,prompt)as any;

 projectId=String(result?.projectId??"");
 goalId=String(result?.goalId??"");

 check("production returned project identity",Boolean(projectId));
 check("production returned goal identity",Boolean(goalId));
 check("project does not require clarification",result?.clarificationNeeded!==true);

 if(!projectId||!goalId){
  throw new Error("Autonomous production bootstrap returned incomplete identity.");
 }

 const project=db.prepare(`
  SELECT *
  FROM projects
  WHERE id=?
 `).get(projectId)as any;

 const goal=db.prepare(`
  SELECT *
  FROM project_goals
  WHERE id=?
 `).get(goalId)as any;

 check("project persisted",Boolean(project));
 check("goal persisted",Boolean(goal));
 check("goal belongs to project",goal?.project_id===projectId);

 workspace=String(project?.workspace??"");

 check("project workspace assigned",Boolean(workspace));
 check("project workspace exists",Boolean(workspace)&&fs.existsSync(workspace));

 console.log("\n--- GOAL GRAPH ---");

 const work=db.prepare(`
  SELECT *
  FROM goal_work_items
  WHERE goal_id=?
  ORDER BY priority DESC,created_at,rowid
 `).all(goalId)as any[];

 check(
  "goal contains autonomous work",
  work.length>0,
  `count=${work.length}`
 );

 check(
  "work has implementation",
  work.some(item=>item.kind==="implementation")
 );

 check(
  "work has validation/test capability",
  work.some(item=>
   item.kind==="test"||
   item.kind==="validation"||
   item.kind==="integration"
  )
 );

 check(
  "work graph has runnable work",
  work.some(item=>item.status==="running")
 );

 const keys=work
  .map(item=>String(item.work_key??""))
  .filter(Boolean);

 check(
  "work graph has unique keys",
  keys.length===work.length&&new Set(keys).size===work.length
 );

 for(const item of work){
  console.log(
   `${String(item.status).padEnd(10)} `+
   `${String(item.kind).padEnd(16)} `+
   `${item.title}`
  );
 }

 console.log("\n--- INITIAL DISPATCH ---");

 const dispatches=db.prepare(`
  SELECT *
  FROM goal_work_dispatches
  WHERE goal_id=?
  ORDER BY created_at,rowid
 `).all(goalId)as any[];

 check(
  "initial work dispatched",
  dispatches.length>0,
  `count=${dispatches.length}`
 );

 const tasks=db.prepare(`
  SELECT *
  FROM tasks
  WHERE project_id=?
  ORDER BY created_at,rowid
 `).all(projectId)as any[];

 check(
  "production tasks created",
  tasks.length>0,
  `count=${tasks.length}`
 );

 const jobs=db.prepare(`
  SELECT *
  FROM jobs
  WHERE project_id=?
  ORDER BY created_at,rowid
 `).all(projectId)as any[];

 check(
  "worker jobs created",
  jobs.length>0,
  `count=${jobs.length}`
 );

 check(
  "dispatches reference project tasks",
  dispatches.every(dispatch=>
   tasks.some(task=>
    String(task.id)===String(dispatch.task_id)
   )
  )
 );

 const dispatchedTaskIds=new Set(
  dispatches.map(dispatch=>String(dispatch.task_id))
 );

 check(
  "dispatched tasks have worker jobs",
  [...dispatchedTaskIds].every(taskId=>
   jobs.some(job=>String(job.task_id)===taskId)
  )
 );

 console.log("\n--- GRAPH STATE ---");

 const running=work.filter(item=>item.status==="running").length;
 const pending=work.filter(item=>item.status==="pending").length;
 const completed=work.filter(item=>item.status==="completed").length;
 const failedWork=work.filter(item=>item.status==="failed").length;

 check(
  "graph has no initial failed work",
  failedWork===0,
  `failed=${failedWork}`
 );

 check(
  "running work corresponds to dispatches",
  running===dispatches.length,
  `running=${running}, dispatches=${dispatches.length}`
 );

 check(
  "initial jobs correspond to dispatches",
  jobs.length>=dispatches.length,
  `jobs=${jobs.length}, dispatches=${dispatches.length}`
 );

 console.log(`Running: ${running}`);
 console.log(`Pending: ${pending}`);
 console.log(`Completed: ${completed}`);
 console.log(`Failed: ${failedWork}`);

 console.log("\n--- DELIVERY SAFETY ---");

 const releases=count(`
  SELECT COUNT(*) count
  FROM project_releases
  WHERE project_id=?
 `,projectId);

 check(
  "no premature release exists",
  releases===0,
  `count=${releases}`
 );

 const freshProject=db.prepare(`
  SELECT
   github_owner,
   github_repo,
   github_url,
   github_branch,
   github_commit,
   github_pushed_at
  FROM projects
  WHERE id=?
 `).get(projectId)as any;

 check(
  "no premature GitHub publication",
  !freshProject?.github_owner&&
  !freshProject?.github_repo&&
  !freshProject?.github_url&&
  !freshProject?.github_branch&&
  !freshProject?.github_commit&&
  !freshProject?.github_pushed_at
 );

 console.log("\n--- PRODUCTION STATE ---");
 console.log(`Project: ${projectId}`);
 console.log(`Goal: ${goalId}`);
 console.log(`Workspace: ${workspace}`);
 console.log(`Work items: ${work.length}`);
 console.log(`Dispatches: ${dispatches.length}`);
 console.log(`Tasks: ${tasks.length}`);
 console.log(`Jobs: ${jobs.length}`);

}catch(error){
 failed++;
 console.error("\nAUTONOMOUS E2E ERROR");
 console.error(
  error instanceof Error
   ?`${error.name}: ${error.message}`
   :String(error)
 );
}

console.log("\n============================================================");
console.log(" VEYLITH AUTONOMOUS E2E RESULT");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Project: ${projectId||"not-created"}`);
console.log(`Goal: ${goalId||"not-created"}`);
console.log(`Workspace: ${workspace||"not-created"}`);
console.log("============================================================");

if(failed){
 console.error("\nAUTONOMOUS E2E: FAILED");
 process.exitCode=1;
}else{
 console.log("\nAUTONOMOUS E2E: PASS");
 console.log(
  "Production intake, goal creation, dynamic DAG bootstrap and worker dispatch proven."
 );
}
