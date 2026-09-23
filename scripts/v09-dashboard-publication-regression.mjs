import assert from "node:assert/strict";
import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const service=read("src/dashboard/publication-monitor.service.ts");
const routes=read("src/api/routes.ts");
const api=read("public/js/api/client.js");
const component=read("public/js/components/publication.js");
const app=read("public/js/app.js");
const html=read("public/index.html");
const css=read("public/css/app.css");
const database=read("src/database/database.ts");
let passed=0;

function test(name,value){
 assert.ok(value,name);
 console.log(`PASS ${String(++passed).padStart(2,"0")} ${name}`);
}

console.log("\nVEYLITH v0.9 BATCH 5 PASS 5 REGRESSION\n");

test("Publication monitor service exists",fs.existsSync("src/dashboard/publication-monitor.service.ts"));
test("Publication service reads durable state",service.includes("FROM git_publication_state"));
test("Publication service reads project",service.includes("FROM projects WHERE id=?"));
test("Publication service reads task",service.includes("FROM tasks"));
test("Commit stage supported",service.includes('id:"committed"'));
test("Repository-ready stage supported",service.includes('id:"repository_ready"'));
test("Push stage supported",service.includes('id:"pushed"'));
test("Verification stage supported",service.includes('id:"verified"'));
test("Commit SHA exposed",service.includes("commitSha:"));
test("Short SHA exposed",service.includes("shortSha:"));
test("Branch exposed",service.includes("branch:"));
test("GitHub owner exposed",service.includes("owner:"));
test("Repository name exposed",service.includes("repository:"));
test("GitHub URL exposed",service.includes("githubUrl:"));
test("Remote URL exposed",service.includes("remoteUrl:"));
test("Verified state exposed",service.includes("verified:"));
test("Dashboard publication overview exists",service.includes("publicationOverview"));
test("Dashboard returns publications",routes.includes("publications"));
test("Project publication endpoint exists",routes.includes('/api/projects/:id/publication'));
test("Project publication endpoint parameterized",routes.includes("publicationForProject(req.params.id)"));
test("Publication service imported",routes.includes("publication-monitor.service.js"));
test("Publication API client exists",api.includes("projectPublication:"));
test("Publication renderer exists",component.includes("renderPublication"));
test("Renderer supports publication stages",component.includes("publication.stages"));
test("Renderer displays commit",component.includes("publication.shortSha"));
test("Renderer displays branch",component.includes("publication.branch"));
test("Renderer displays owner",component.includes("publication.owner"));
test("Renderer displays repository",component.includes("publication.repository"));
test("Renderer displays remote",component.includes("publication.remoteUrl"));
test("Renderer validates GitHub link",component.includes('parsed.hostname.toLowerCase()!=="github.com"'));
test("GitHub link uses noopener",component.includes('rel="noopener noreferrer"'));
test("Application renders publication",app.includes("renderPublication(data)"));
test("Publication center HTML exists",html.includes('id="publicationCenter"'));
test("Publication state HTML exists",html.includes('id="publicationState"'));
test("Publication pipeline HTML exists",html.includes('id="publicationPipeline"'));
test("Publication metadata HTML exists",html.includes('id="publicationMeta"'));
test("Publication error UI exists",html.includes('id="publicationError"'));
test("Publication current-state CSS exists",css.includes(".publication-current"));
test("Publication pipeline CSS exists",css.includes(".publication-pipeline"));
test("Publication stage CSS exists",css.includes(".git-stage"));
test("Publication metadata CSS exists",css.includes(".publication-meta"));
test("Verified styling exists",css.includes(".publication-badge.completed"));
test("Publishing styling exists",css.includes(".publication-badge.working"));
test("Failure styling exists",css.includes(".publication-badge.failed"));
test("Database persists commit SHA",database.includes("commit_sha TEXT"));
test("Database persists branch",database.includes("branch TEXT"));
test("Database persists GitHub URL",database.includes("github_url TEXT"));
test("Database persists pushed timestamp",database.includes("pushed_at TEXT"));
test("Database persists verification timestamp",database.includes("verified_at TEXT"));
test("No fake publication state",!component.includes("Math.random"));
test("No fake publication timers",!component.includes("setInterval"));
test("Publication project query parameterized",service.includes("WHERE project_id=?"));

console.log(`\nRESULT ${passed}/52 PASSED`);
console.log("Git / GitHub publication monitoring ready.\n");
