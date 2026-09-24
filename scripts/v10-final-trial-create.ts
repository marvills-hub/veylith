import "dotenv/config";
import {db} from "../src/database/database.js";
import {createAutonomousProject} from "../src/core/task.service.js";

const NAME="Veylith Task API v1 Final Trial";

const PROMPT=`
Build a self-contained Node.js REST API for managing tasks.

PROJECT REQUIREMENTS:
- Provide CRUD operations for tasks.
- Each task must contain id, title, description, status, priority, createdAt and updatedAt.
- Persist tasks to a local JSON file so data survives application restarts.
- Do not use an external database or external service.
- Validate request input.
- Return structured JSON error responses.
- Provide GET /health.
- Include automated tests covering /health and all CRUD operations.
- Provide finite npm build and test scripts that terminate automatically.
- Provide a README with installation, testing, running and API usage instructions.
- The application must be self-contained.
- Do not use watch mode or persistent validation commands.
- The finished repository must be suitable for autonomous private GitHub publication.

ACCEPTANCE CRITERIA:
- npm build completes successfully.
- npm test completes successfully.
- GET /health succeeds.
- CRUD operations for tasks work correctly.
- Invalid input returns structured JSON errors.
- Task data persists using a local JSON file.
- Automated tests cover health and CRUD behavior.
- README documents installation, testing, running and API usage.
- No external database or service is required.
`.trim();

const existing=db.prepare(`
 SELECT id,name,status,phase,workspace,created_at
 FROM projects
 WHERE name=?
 ORDER BY created_at
`).all(NAME) as any[];

console.log("\n--- DUPLICATE GUARD ---");
console.log(`Existing final trials: ${existing.length}`);

if(existing.length){
 console.log(JSON.stringify(existing,null,2));
 console.error("ABORT: final trial already exists.");
 process.exitCode=2;
}else{
 console.log("PASS exactly-zero existing final trials");

 try{
  console.log("\n--- CALLING PRODUCTION AUTONOMOUS ENTRY POINT ---");

  const result=await createAutonomousProject(NAME,PROMPT);

  console.log("\n--- PRODUCTION RESULT ---");
  console.log(JSON.stringify(result,null,2));

  const projectId=(result as any).projectId;
  const goalId=(result as any).goalId;

  if(!projectId||!goalId){
   throw new Error(
    `Production bootstrap returned incomplete identity: project=${projectId}, goal=${goalId}`
   );
  }

  const project=db.prepare(`
   SELECT *
   FROM projects
   WHERE id=?
  `).get(projectId);

  const goal=db.prepare(`
   SELECT *
   FROM project_goals
   WHERE id=?
  `).get(goalId);

  const work=db.prepare(`
   SELECT
    id,
    work_key,
    title,
    kind,
    status,
    priority,
    dependencies_json
   FROM goal_work_items
   WHERE goal_id=?
   ORDER BY rowid
  `).all(goalId);

  const dispatches=db.prepare(`
   SELECT *
   FROM goal_work_dispatches
   WHERE goal_id=?
   ORDER BY rowid
  `).all(goalId);

  const tasks=db.prepare(`
   SELECT
    id,
    title,
    status,
    phase,
    priority
   FROM tasks
   WHERE project_id=?
   ORDER BY created_at
  `).all(projectId);

  const jobs=db.prepare(`
   SELECT
    id,
    task_id,
    status,
    priority,
    attempts,
    max_attempts
   FROM jobs
   WHERE project_id=?
   ORDER BY created_at
  `).all(projectId);

  console.log("\n--- AUTHORITATIVE PROJECT ---");
  console.log(JSON.stringify(project,null,2));

  console.log("\n--- AUTHORITATIVE GOAL ---");
  console.log(JSON.stringify(goal,null,2));

  console.log("\n--- AUTONOMOUS WORK GRAPH ---");
  console.log(JSON.stringify(work,null,2));

  console.log("\n--- INITIAL DISPATCHES ---");
  console.log(JSON.stringify(dispatches,null,2));

  console.log("\n--- INITIAL TASKS ---");
  console.log(JSON.stringify(tasks,null,2));

  console.log("\n--- INITIAL JOBS ---");
  console.log(JSON.stringify(jobs,null,2));

  const workspace=String((project as any)?.workspace??"");

  console.log("\n============================================================");
  console.log(" FINAL V1 TRIAL CREATED SUCCESSFULLY");
  console.log("============================================================");
  console.log(`PROJECT_ID=${projectId}`);
  console.log(`GOAL_ID=${goalId}`);
  console.log(`WORKSPACE=${workspace}`);
  console.log(`WORK_ITEMS=${work.length}`);
  console.log(`INITIAL_DISPATCHES=${dispatches.length}`);
  console.log(`INITIAL_TASKS=${tasks.length}`);
  console.log(`INITIAL_JOBS=${jobs.length}`);
  console.log(`STATUS=${(result as any).status}`);
  console.log(`CLARIFICATION_NEEDED=${(result as any).clarificationNeeded}`);
  console.log("============================================================");
 }catch(error){
  console.error("\nFINAL TRIAL CREATION FAILED");
  console.error(
   error instanceof Error
    ?`${error.name}: ${error.message}`
    :String(error)
  );
  process.exitCode=1;
 }
}
