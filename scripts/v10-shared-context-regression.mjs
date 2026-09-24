import {mkdir,rm,writeFile} from "node:fs/promises";
import path from "node:path";
import {db,memory} from "../dist/database/database.js";
import {createGoal,prepareGoal} from "../dist/goals/goal.service.js";
import {deleteProjectGoal} from "../dist/goals/goal.repository.js";
import {
 createGoalTaskGraph,
 refreshGoalTaskReadiness,
 loadGoalTaskGraph
} from "../dist/goals/goal-task-graph.service.js";
import {
 updateGoalWorkStatus,
 deleteGoalTaskGraph
} from "../dist/goals/goal-task-graph.repository.js";
import {
 assignRunnableGoalTeam,
 synchronizeGoalTeam
} from "../dist/team/team-assignment.service.js";
import {
 claimAgentAssignment,
 deleteGoalAssignments
} from "../dist/team/team-assignment.repository.js";
import {
 createWorkHandoff,
 deliverWorkHandoff,
 bindIncomingHandoffs
} from "../dist/team/handoff.service.js";
import {
 deleteGoalHandoffs
} from "../dist/team/handoff.repository.js";
import {
 buildSharedProjectContext,
 sharedProjectContextPrompt
} from "../dist/team/shared-context.service.js";

let passed=0;
let failed=0;

function check(name,condition){
 if(condition){
  passed++;
  console.log(`PASS ${name}`);
 }else{
  failed++;
  console.error(`FAIL ${name}`);
 }
}

const stamp=Date.now();
const projectId=`prj_shared_context_${stamp}`;
const workspace=path.resolve(`tmp-v10-shared-context-${stamp}`);
let goalId="";

async function cleanup(){
 try{if(goalId)deleteGoalHandoffs(goalId);}catch{}
 try{if(goalId)deleteGoalAssignments(goalId);}catch{}
 try{if(goalId)deleteGoalTaskGraph(goalId);}catch{}
 try{if(goalId)deleteProjectGoal(goalId);}catch{}
 try{db.prepare("DELETE FROM project_memory WHERE project_id=?").run(projectId);}catch{}
 try{db.prepare("DELETE FROM projects WHERE id=?").run(projectId);}catch{}
 try{await rm(workspace,{recursive:true,force:true});}catch{}
}

try{
 await mkdir(path.join(workspace,"src"),{recursive:true});
 await writeFile(
  path.join(workspace,"package.json"),
  JSON.stringify({
   name:"shared-context-fixture",
   version:"1.0.0",
   dependencies:{express:"^5.0.0"},
   devDependencies:{typescript:"^5.0.0"}
  },null,2)
 );
 await writeFile(
  path.join(workspace,"src","repository.ts"),
  `export interface Todo{id:string;title:string;completed:boolean}
export class TodoRepository{
 private items:Todo[]=[];
 list(){return this.items;}
 create(todo:Todo){this.items.push(todo);return todo;}
}
`
 );
 await writeFile(
  path.join(workspace,"src","server.ts"),
  `import express from "express";
import {TodoRepository} from "./repository.js";
const app=express();
const repository=new TodoRepository();
app.get("/todos",(_req,res)=>res.json(repository.list()));
export {app,repository};
`
 );
 await writeFile(
  path.join(workspace,"src","repository.test.ts"),
  `import {TodoRepository} from "./repository.js";
const repository=new TodoRepository();
repository.create({id:"1",title:"Test",completed:false});
if(repository.list().length!==1)throw new Error("Repository failed");
`
 );
 await writeFile(path.join(workspace,".env"),"SECRET_SHOULD_NEVER_ENTER_CONTEXT=yes\n");

 const time=new Date().toISOString();
 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,phase,progress,workspace,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,
  "Shared Context Regression",
  `shared-context-${stamp}`,
  "queued",
  "queued",
  0,
  workspace,
  time,
  time
 );

 const draft=createGoal({
  projectId,
  title:"Todo Service",
  objective:"Build a persistent Todo API using a repository boundary",
  priority:"high",
  requirements:[
   {text:"Define Todo service architecture",required:true},
   {text:"Implement Todo repository and API",required:true}
  ],
  acceptanceCriteria:[
   "Todo repository and API validation passes"
  ],
  constraints:[
   {type:"technical",text:"Use TypeScript"},
   {type:"architecture",text:"Keep persistence behind repository boundary"}
  ]
 });

 goalId=draft.id;
 const goal=prepareGoal(goalId);
 const r1=goal.requirements[0].id;
 const r2=goal.requirements[1].id;
 const a1=goal.acceptanceCriteria[0].id;

 createGoalTaskGraph(goalId,{
  items:[
   {
    key:"architecture",
    title:"Architecture",
    description:"Design Todo service and repository boundary",
    kind:"architecture",
    priority:90,
    dependencies:[],
    requirementIds:[r1],
    acceptanceCriterionIds:[]
   },
   {
    key:"implementation",
    title:"Implementation",
    description:"Implement Todo repository and HTTP API",
    kind:"implementation",
    priority:80,
    dependencies:["architecture"],
    requirementIds:[r2],
    acceptanceCriterionIds:[a1]
   }
  ]
 });

 refreshGoalTaskReadiness(goalId);
 let graph=loadGoalTaskGraph(goalId);
 const architecture=graph.items.find(item=>item.key==="architecture");
 const implementation=graph.items.find(item=>item.key==="implementation");

 const architectureAssignment=assignRunnableGoalTeam(goalId)[0];
 claimAgentAssignment(architectureAssignment.id,"architect-worker");

 const handoff=createWorkHandoff({
  goalId,
  fromAssignmentId:architectureAssignment.id,
  toWorkItemId:implementation.id,
  summary:"Architecture uses a TodoRepository behind the HTTP layer.",
  decisions:[
   "Keep persistence behind TodoRepository",
   "Keep HTTP routes separate from repository implementation"
  ],
  artifacts:[
   {
    path:"src/repository.ts",
    type:"file",
    description:"Repository contract and implementation"
   }
  ],
  evidence:[
   {
    type:"decision",
    summary:"Repository boundary selected",
    reference:"src/repository.ts"
   }
  ],
  risks:["Do not couple Express routes directly to storage"],
  recommendations:["Extend TodoRepository instead of bypassing it"],
  metadata:{source:"architect"}
 });
 deliverWorkHandoff(handoff.id);

 updateGoalWorkStatus(architecture.id,"completed");
 synchronizeGoalTeam(goalId);
 refreshGoalTaskReadiness(goalId);

 const developerAssignment=assignRunnableGoalTeam(goalId)
  .find(item=>item.workItemId===implementation.id);

 bindIncomingHandoffs(implementation.id,developerAssignment.id);

 memory(projectId,"plan",JSON.stringify({
  summary:"Implement repository-backed Todo API",
  architecture:["TodoRepository","HTTP route layer"]
 }));
 memory(projectId,"validation",JSON.stringify({
  previous:"architecture accepted"
 }));

 const context=await buildSharedProjectContext({
  goalId,
  workItemId:implementation.id,
  workspace,
  repositoryBudget:20000,
  memoryLimit:10
 });

 check("shared context created",Boolean(context));
 check("goal identity included",context.goal.id===goalId);
 check("goal title included",context.goal.title==="Todo Service");
 check("goal objective included",context.goal.objective.includes("persistent Todo API"));
 check("current work included",context.work.id===implementation.id);
 check("work key included",context.work.key==="implementation");
 check("developer role included",context.work.role==="developer");
 check("implementation requirement scoped",context.requirements.length===1);
 check("correct requirement included",context.requirements[0]?.text.includes("repository and API"));
 check("acceptance criterion scoped",context.acceptanceCriteria.length===1);
 check("project constraints included",context.constraints.length===2);
 check("architecture dependency included",context.dependencies.length===1);
 check("dependency completion included",context.dependencies[0]?.status==="completed");
 check("incoming handoff included",context.handoffs.length===1);
 check("architecture summary included",context.handoffs[0]?.summary.includes("TodoRepository"));
 check("architecture decision included",context.handoffs[0]?.decisions.includes("Keep persistence behind TodoRepository"));
 check("handoff artifact included",context.handoffs[0]?.artifacts[0]?.path==="src/repository.ts");
 check("handoff evidence included",context.handoffs[0]?.evidence[0]?.reference==="src/repository.ts");
 check("handoff risk included",context.handoffs[0]?.risks.length===1);
 check("handoff recommendation included",context.handoffs[0]?.recommendations.length===1);
 check("project memory included",context.memory.length>=2);
 check("repository profile created",context.repository.profile.totalFiles>=4);
 check("Express framework detected",context.repository.profile.frameworks.some(item=>item.name==="Express"));
 check("TypeScript framework detected",context.repository.profile.frameworks.some(item=>item.name==="TypeScript"));
 check("repository context selected files",context.repository.context.selectedFiles>0);
 check("repository source selected",context.repository.context.files.some(item=>item.path==="src/repository.ts"));
 check("query contains work description",context.query.includes("Implement Todo repository and HTTP API"));
 check("query contains handoff decision",context.query.includes("Keep persistence behind TodoRepository"));

 const prompt=sharedProjectContextPrompt(context);
 check("prompt contains project goal",prompt.includes("PROJECT GOAL:"));
 check("prompt contains assignment",prompt.includes("CURRENT ASSIGNMENT:"));
 check("prompt contains requirements",prompt.includes("RELEVANT REQUIREMENTS:"));
 check("prompt contains constraints",prompt.includes("PROJECT CONSTRAINTS:"));
 check("prompt contains dependency work",prompt.includes("DEPENDENCY WORK:"));
 check("prompt contains handoff summary",prompt.includes("Architecture uses a TodoRepository"));
 check("prompt contains prior decision",prompt.includes("Keep persistence behind TodoRepository"));
 check("prompt contains artifact",prompt.includes("src/repository.ts"));
 check("prompt contains risk",prompt.includes("Do not couple Express routes"));
 check("prompt contains recommendation",prompt.includes("Extend TodoRepository"));
 check("prompt contains project memory",prompt.includes("RECENT PROJECT MEMORY:"));
 check("prompt contains repository context",prompt.includes("RELEVANT REPOSITORY CONTEXT:"));
 check("prompt contains repository source",prompt.includes("TodoRepository"));
 check("secret file excluded from selected context",!context.repository.context.files.some(item=>item.path===".env"));
 check("secret value excluded from prompt",!prompt.includes("SECRET_SHOULD_NEVER_ENTER_CONTEXT"));

 const contextAgain=await buildSharedProjectContext({
  goalId,
  workItemId:implementation.id,
  workspace,
  repositoryBudget:20000,
  memoryLimit:10
 });

 check("shared context rebuild succeeds",contextAgain.work.id===implementation.id);
 check("handoff remains available after rebuild",contextAgain.handoffs.length===1);
 check("repository intelligence reusable",contextAgain.repository.context.selectedFiles>0);

 await cleanup();

 check(
  "project cleanup",
  Number(db.prepare("SELECT COUNT(*) AS count FROM projects WHERE id=?").get(projectId)?.count)===0
 );
 check(
  "memory cleanup",
  Number(db.prepare("SELECT COUNT(*) AS count FROM project_memory WHERE project_id=?").get(projectId)?.count)===0
 );
}catch(error){
 failed++;
 console.error(error);
 await cleanup();
}

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 2 PASS 3");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("\nVEYLITH v1.0 BATCH 2 PASS 3 PASSED");
}else{
 console.error("\nVEYLITH v1.0 BATCH 2 PASS 3 FAILED");
 process.exitCode=1;
}
