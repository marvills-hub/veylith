import assert from "node:assert/strict";
import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const exists=file=>fs.existsSync(file);
const html=read("public/index.html");
const css=read("public/css/app.css");
const app=read("public/js/app.js");
const api=read("public/js/api/client.js");
const events=read("public/js/api/events.js");
const routes=read("src/api/routes.ts");
const database=read("src/database/database.ts");

const files=[
 "public/js/core/utils.js",
 "public/js/core/state.js",
 "public/js/api/client.js",
 "public/js/api/events.js",
 "public/js/components/summary.js",
 "public/js/components/activity.js",
 "public/js/components/charts.js",
 "public/js/components/health.js",
 "public/js/components/task-modal.js",
 "public/js/components/task-control.js",
 "public/js/components/autonomous-team.js",
 "public/js/components/operations.js",
 "public/js/components/publication.js",
 "public/js/components/connection-health.js",
 "src/dashboard/autonomous-team.service.ts",
 "src/dashboard/publication-monitor.service.ts"
];

let passed=0;
let failed=0;

function test(name,value){
 try{
  assert.ok(value,name);
  passed++;
  console.log(`PASS ${String(passed+failed).padStart(2,"0")} ${name}`);
 }catch(error){
  failed++;
  console.log(`FAIL ${String(passed+failed).padStart(2,"0")} ${name}`);
  console.log(`     ${error.message}`);
 }
}

console.log("\n============================================================");
console.log(" VEYLITH v0.9 BATCH 5 FULL DASHBOARD REGRESSION");
console.log("============================================================\n");

for(const file of files)test(`Required module exists: ${file}`,exists(file));

test("Dashboard stylesheet exists",exists("public/css/app.css"));
test("Dashboard entrypoint exists",exists("public/js/app.js"));
test("Dashboard HTML uses module entrypoint",html.includes('type="module"')&&html.includes("/js/app.js"));
test("Dashboard has no giant inline application script",!/<script>([\s\S]{500,})<\/script>/i.test(html));

test("Dashboard API endpoint exists",routes.includes('app.get("/api/dashboard"'));
test("Health API endpoint exists",routes.includes('app.get("/api/health"'));
test("AI API endpoint exists",routes.includes('app.get("/api/ai"'));
test("Jobs API endpoint exists",routes.includes('app.get("/api/jobs"'));
test("Logs API endpoint exists",routes.includes('app.get("/api/logs"'));
test("Security API endpoint exists",routes.includes('app.get("/api/security"'));
test("Sandbox API endpoint exists",routes.includes('app.get("/api/sandbox"'));
test("SSE API endpoint exists",routes.includes('app.get("/api/events"'));
test("Project team endpoint exists",routes.includes('/api/projects/:id/team'));
test("Project publication endpoint exists",routes.includes('/api/projects/:id/publication'));

test("Dashboard includes workers",routes.includes("workers,"));
test("Dashboard includes projects",routes.includes("projects,"));
test("Dashboard includes tasks",routes.includes("tasks,"));
test("Dashboard includes jobs",routes.includes("jobs:")||routes.includes("jobs,")||routes.includes("const jobs="));
test("Dashboard includes events",routes.includes("events,"));
test("Dashboard includes metrics",routes.includes("metrics,"));
test("Dashboard includes development steps",routes.includes("developmentSteps,"));
test("Dashboard includes autonomous teams",routes.includes("autonomousTeams,"));
test("Dashboard includes publications",routes.includes("publications,"));

test("Task pause API client retained",api.includes("pauseTask:"));
test("Task resume API client retained",api.includes("resumeTask:"));
test("Task cancel API client retained",api.includes("cancelTask:"));
test("Task priority API client retained",api.includes("priority:"));
test("Project team API client retained",api.includes("projectTeam:"));
test("Publication API client retained",api.includes("projectPublication:"));
test("Logs API client retained",api.includes("logs:"));
test("AI API client retained",api.includes("ai:"));
test("Security API client retained",api.includes("security:"));
test("Sandbox API client retained",api.includes("sandbox:"));

test("Summary rendering integrated",app.includes("renderStats(data)"));
test("Worker rendering integrated",app.includes("renderWorkers(data)"));
test("Project rendering integrated",app.includes("renderProjects(data)"));
test("Task rendering integrated",app.includes("renderTasks(data,selectTask)"));
test("Autonomous team rendering integrated",app.includes("renderAutonomousTeam(data)"));
test("Publication rendering integrated",app.includes("renderPublication(data)"));
test("Connection health rendering integrated",app.includes("renderConnectionHealth(data)"));
test("Operations center initialized",app.includes("setupOperations()"));
test("Task control initialized",app.includes("setupTaskControl"));
test("Task creation initialized",app.includes("setupTaskModal"));

test("SSE managed connection integrated",app.includes("connectEvents("));
test("SSE connection state integrated",app.includes("streamConnectionChanged(info)"));
test("SSE module tracks one EventSource",events.includes("let source=null"));
test("SSE reconnect backoff retained",events.includes("Math.pow(2,reconnectAttempt)"));
test("SSE reconnect capped",events.includes("MAX_DELAY=30000"));
test("Fallback polling retained",app.includes("connection.connected?15000:5000"));
test("Refresh overlap protected",app.includes("if(refreshing)return false"));

test("Worker stream handled",app.includes('message.channel==="worker"'));
test("Worker-slot stream handled",app.includes('message.channel==="worker_slots"'));
test("Phase stream handled",app.includes('message.channel==="phase"'));
test("Event stream handled",app.includes('message.channel==="event"'));
test("Terminal stream handled",app.includes('message.channel==="terminal"'));

test("Task operations UI exists",html.includes('id="taskControl"')||html.includes("task-control"));
test("Autonomous team UI exists",html.includes('id="agentTeam"'));
test("Development pipeline UI exists",html.includes('id="pipeline"'));
test("Operations center UI exists",html.includes('id="operationsCenter"'));
test("Structured log UI exists",html.includes('id="opsLogs"'));
test("Security event UI exists",html.includes('id="securityEvents"'));
test("AI provider UI exists",html.includes('id="providerList"'));
test("Publication center UI exists",html.includes('id="publicationCenter"'));
test("Publication pipeline UI exists",html.includes('id="publicationPipeline"'));
test("Runtime connection UI exists",html.includes('id="connectionHealth"'));
test("Worker heartbeat UI exists",html.includes('id="connectionWorkers"'));

test("Responsive dashboard rules exist",css.includes("@media"));
test("Task control styling retained",css.includes(".task-control")||css.includes(".control-panel")||css.includes(".task-control-panel")||css.includes(".task-control-overlay"));
test("Agent team styling retained",css.includes(".agent-team"));
test("Operations styling retained",css.includes(".operations-grid"));
test("Publication styling retained",css.includes(".publication-pipeline"));
test("Connection styling retained",css.includes(".connection-badge.live"));
test("Offline styling retained",css.includes(".connection-badge.offline"));
test("Stale worker styling retained",css.includes(".connection-worker.stale"));

test("Development steps persisted",database.includes("development_steps"));
test("Development agent persisted",database.includes("agent TEXT"));
test("Worker slots persisted",database.includes("worker_slots"));
test("Worker phase persisted",database.includes("phase TEXT"));
test("Git publication state persisted",database.includes("git_publication_state"));
test("Git commit SHA persisted",database.includes("commit_sha TEXT"));
test("GitHub URL persisted",database.includes("github_url TEXT"));
test("Git push timestamp persisted",database.includes("pushed_at TEXT"));
test("Git verification timestamp persisted",database.includes("verified_at TEXT"));

const frontend=[
 app,
 read("public/js/components/autonomous-team.js"),
 read("public/js/components/operations.js"),
 read("public/js/components/publication.js"),
 read("public/js/components/connection-health.js")
].join("\n");

test("Dashboard has no random fake telemetry",!frontend.includes("Math.random"));
test("Dashboard has no fake agent simulation",!frontend.includes("fakeAgent"));
test("Dashboard has no fake publication simulation",!frontend.includes("fakePublication"));
test("Dashboard does not claim Docker isolation",!frontend.includes("DOCKER ISOLATED"));
test("Restricted-host visibility retained",frontend.includes("RESTRICTED HOST"));

console.log("\n------------------------------------------------------------");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);
console.log("------------------------------------------------------------");

if(failed){
 console.error("\nBATCH 5 FULL DASHBOARD REGRESSION FAILED.\n");
 process.exitCode=1;
}else{
 console.log("\nBATCH 5 FULL DASHBOARD REGRESSION PASSED.\n");
}

