import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const team=read("src/dashboard/autonomous-team.service.ts");
const routes=read("src/api/routes.ts");
const phase=read("src/orchestration/phase.service.ts");
const database=read("src/database/database.ts");
let passed=0;

function test(name,condition){
 assert.ok(condition,name);
 passed++;
 console.log(`PASS ${String(passed).padStart(2,"0")} ${name}`);
}

console.log("\nVEYLITH v0.9 BATCH 5 PASS 3 REGRESSION\n");

test("Autonomous team service exists",fs.existsSync(path.join(root,"src/dashboard/autonomous-team.service.ts")));
test("Architect role exists",team.includes('name:"Architect"'));
test("Planner role exists",team.includes('name:"Development Planner"'));
test("Developer role exists",team.includes('name:"Developer"'));
test("Validator role exists",team.includes('name:"Validator"'));
test("Reviewer role exists",team.includes('name:"Reviewer"'));
test("Diagnostic role exists",team.includes('name:"Diagnostic Engineer"'));
test("Repair role exists",team.includes('name:"Repair Engineer"'));
test("Version control role exists",team.includes('name:"Version Controller"'));
test("Publisher role exists",team.includes('name:"Publisher"'));
test("Team uses persisted development steps",team.includes("FROM development_steps"));
test("Team reads project state",team.includes("FROM projects WHERE id=?"));
test("Team reads task state",team.includes("FROM tasks"));
test("Team reads real worker slots",team.includes("listSlots()"));
test("Team derives running activity",team.includes('step.status==="running"'));
test("Team exposes pipeline",team.includes("pipeline:pipelineStages"));
test("Team exposes current activity",team.includes("current:{"));
test("Team exposes repair usage",team.includes("repairs:{"));
test("Dashboard returns development steps",routes.includes("developmentSteps"));
test("Dashboard returns autonomous teams",routes.includes("autonomousTeams"));
test("Project team endpoint exists",routes.includes('/api/projects/:id/team'));
test("Project team endpoint uses projectTeam",routes.includes("projectTeam(req.params.id)"));
test("Dashboard service imported",routes.includes("autonomous-team.service.js"));
test("Orchestrator persists agent name",phase.includes("agent,title,status,sequence"));
test("Step lifecycle supports running",phase.includes("status='running'"));
test("Step lifecycle supports completed",phase.includes("status='completed'"));
test("Step lifecycle supports failed",phase.includes("status='failed'"));
test("Database persists development agent",database.includes("agent TEXT NOT NULL"));
test("Database persists step sequence",database.includes("sequence INTEGER NOT NULL"));
test("Database persists step timestamps",database.includes("started_at TEXT")&&database.includes("completed_at TEXT"));
test("Worker slots persist phase",database.includes("CREATE TABLE IF NOT EXISTS worker_slots")&&database.includes("phase TEXT NOT NULL"));
test("No synthetic random agent activity",!team.includes("Math.random"));
test("No dashboard-only fake progress",!team.includes("setInterval"));
test("Project lookup is parameterized",team.includes("FROM projects WHERE id=?"));
test("Step lookup is parameterized",team.includes("WHERE project_id=?"));

console.log(`\nRESULT ${passed}/35 PASSED`);
console.log("Autonomous team monitoring bridge is ready.\n");
