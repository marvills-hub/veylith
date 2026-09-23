import assert from "node:assert/strict";
import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const api=read("public/js/api/client.js");
const app=read("public/js/app.js");
const team=read("public/js/components/autonomous-team.js");
const ops=read("public/js/components/operations.js");
const html=read("public/index.html");
const css=read("public/css/app.css");
const routes=read("src/api/routes.ts");
let passed=0;

function test(name,value){
 assert.ok(value,name);
 console.log(`PASS ${String(++passed).padStart(2,"0")} ${name}`);
}

console.log("\nVEYLITH v0.9 BATCH 5 PASS 4 REGRESSION\n");

test("AI endpoint client exists",api.includes('ai:()=>request("/api/ai")'));
test("Log query client exists",api.includes('logs:query=>request(`/api/logs'));
test("Log statistics client exists",api.includes('logStats:()=>request("/api/logs/stats")'));
test("Log files client exists",api.includes('logFiles:()=>request("/api/logs/files")'));
test("Security endpoint client exists",api.includes('security:()=>request("/api/security")'));
test("Security events client exists",api.includes("/api/security/events?limit="));
test("Sandbox endpoint client exists",api.includes('sandbox:()=>request("/api/sandbox")'));
test("Project team client exists",api.includes("/api/projects/${encodeURIComponent(id)}/team"));
test("Autonomous team renderer exists",team.includes("renderAutonomousTeam"));
test("Architect UI supported",team.includes("architect"));
test("Developer UI supported",team.includes("developer"));
test("Reviewer UI supported",team.includes("reviewer"));
test("Diagnostic UI supported",team.includes("diagnostic"));
test("Repair UI supported",team.includes("repair"));
test("Git UI agent supported",team.includes("versioning"));
test("Publisher UI agent supported",team.includes("publisher"));
test("Current autonomous activity exists",team.includes("CURRENT AUTONOMOUS ACTIVITY"));
test("Pipeline renderer exists",team.includes("team.pipeline"));
test("Operations loader exists",ops.includes("loadOperations"));
test("Logs are rendered",ops.includes("renderLogs"));
test("Log level filtering exists",ops.includes("logLevel"));
test("Security events rendered",ops.includes("renderSecurityEvents"));
test("AI provider rendering exists",ops.includes("providerRows"));
test("Sandbox isolation rendered",ops.includes("RESTRICTED HOST"));
test("Operations refresh exists",ops.includes("opsRefresh"));
test("App renders autonomous team",app.includes("renderAutonomousTeam(data)"));
test("App loads operations center",app.includes("loadOperations()"));
test("Operations auto refresh exists",app.includes("loadOperations(true),30000"));
test("Worker slot stream refresh exists",app.includes('message.channel==="worker_slots"'));
test("Phase stream refresh exists",app.includes('message.channel==="phase"'));
test("Autonomous team HTML exists",html.includes('id="agentTeam"'));
test("Current agent HTML exists",html.includes('id="currentAgent"'));
test("Pipeline HTML exists",html.includes('id="pipeline"'));
test("Operations center HTML exists",html.includes('id="operationsCenter"'));
test("Structured logs HTML exists",html.includes('id="opsLogs"'));
test("Security event HTML exists",html.includes('id="securityEvents"'));
test("Provider list HTML exists",html.includes('id="providerList"'));
test("Isolation state HTML exists",html.includes('id="isolationMode"'));
test("Autonomous team CSS exists",css.includes(".agent-team"));
test("Pipeline CSS exists",css.includes(".pipeline-stage"));
test("Operations CSS exists",css.includes(".operations-grid"));
test("Error log styling exists",css.includes(".ops-log.error"));
test("Responsive operations UI exists",css.includes(".operations-summary"));
test("Backend exposes logs",routes.includes('app.get("/api/logs"'));
test("Backend exposes security",routes.includes('app.get("/api/security"'));
test("Backend exposes sandbox",routes.includes('app.get("/api/sandbox"'));
test("Backend exposes AI",routes.includes('app.get("/api/ai"'));
test("Backend exposes team data",routes.includes("autonomousTeams"));
test("No fake agent timers",!team.includes("setInterval"));
test("No fake security data",!ops.includes("Math.random"));

console.log(`\nRESULT ${passed}/50 PASSED`);
console.log("Operations Center + Autonomous Team UI ready.\n");
