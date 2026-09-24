import fs from"node:fs";

let passed=0,failed=0;
const check=(name,value)=>{
 if(value){console.log(`PASS ${name}`);passed++}
 else{console.log(`FAIL ${name}`);failed++}
};

const task=fs.readFileSync("src/core/task.service.ts","utf8");
const routes=fs.readFileSync("src/api/routes.ts","utf8");
const worker=fs.readFileSync("src/jobs/job-runner.service.ts","utf8");
const bootstrap=fs.readFileSync("src/goals/autonomous-project.service.ts","utf8");
const dispatch=fs.readFileSync("src/goals/goal-work-dispatch.service.ts","utf8");

console.log("\nVEYLITH v1.0 BATCH 7.2A - RUNTIME ENTRY BRIDGE\n");

check("v1 autonomous entry exported",task.includes("export async function createAutonomousProject"));
check("v1 entry calls autonomous bootstrap",task.includes("bootstrapAutonomousProject({"));
check("v1 entry validates provider",task.includes("getAIProvider()"));
check("v1 entry returns autonomous-v1 mode",task.includes('mode:"autonomous-v1"'));
check("production route imports v1 entry",routes.includes("createAutonomousProject,createTask,resumeTask"));
check("/api/tasks route is asynchronous",routes.includes('app.post("/api/tasks",async(req,res)=>'));
check("/api/tasks awaits v1 entry",routes.includes("await createAutonomousProject(name,prompt)"));
check("/api/tasks no longer calls legacy createTask",!routes.includes("json(createTask(name,prompt))"));
check("demo route remains legacy demo entry",routes.includes('createTask(`Veylith Hello ${Date.now()}`,DEMO_PROMPT,"demo")'));
check("legacy task creator restricted to demo",task.includes('mode:"demo"="demo"'));
check("bootstrap creates one v1 project",bootstrap.includes("const project=createProject(name,input.workspace)"));
check("bootstrap performs project intake",bootstrap.includes("await intakeProjectRequest({"));
check("bootstrap performs AI decomposition",bootstrap.includes("await decomposeGoalWithAI(intake.goal.id)"));
check("bootstrap creates goal task graph",bootstrap.includes("createGoalTaskGraph(goal.id,graph)"));
check("bootstrap dispatches runnable goal work",bootstrap.includes("dispatchRunnableGoalWork(goal.id)"));
check("goal dispatch creates bounded tasks",dispatch.includes("createTaskForWork(goal,work)"));
check("goal dispatch enqueues jobs",dispatch.includes("const job=enqueueTask(id)"));
check("goal dispatch persists work-task binding",dispatch.includes("createGoalWorkDispatch({"));
check("worker detects goal-managed tasks",worker.includes("const goalManaged=isGoalManagedTask(task.id)"));
check("goal-managed worker uses team executor",worker.includes("await executeGoalTeamTask(task)"));
check("non-goal worker retains legacy fallback",worker.includes("await executeTask(task)"));
check("legacy autonomous pipeline not used by /api/tasks",!routes.includes("executeAutonomousPipeline"));
check("demo executor remains available",task.includes("executeDemoTask"));
check("demo Git/GitHub behavior remains isolated",task.includes("await initializeGit(task,project)")&&task.includes("await publishToGitHub(task,freshProject)"));
check("v1 entry itself has no direct Git initialization",(()=>{
 const start=task.indexOf("export async function createAutonomousProject");
 const end=task.indexOf("export function createTask",start);
 const section=task.slice(start,end);
 return !section.includes("initializeGit(")&&!section.includes("publishToGitHub(");
})());

console.log(`\n${passed}/${passed+failed} checks passed.`);
if(failed)process.exitCode=1;
