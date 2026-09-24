import {db} from "../dist/database/database.js";
import {createGoal,prepareGoal} from "../dist/goals/goal.service.js";
import {deleteProjectGoal} from "../dist/goals/goal.repository.js";
import {
 createGoalTaskGraph,
 refreshGoalTaskReadiness,
 loadGoalTaskGraph
} from "../dist/goals/goal-task-graph.service.js";
import {deleteGoalTaskGraph} from "../dist/goals/goal-task-graph.repository.js";
import {
 dispatchRunnableGoalWork,
 synchronizeGoalWorkDispatches
} from "../dist/goals/goal-work-dispatch.service.js";
import {
 listGoalWorkDispatches,
 deleteGoalWorkDispatches
} from "../dist/goals/goal-work-dispatch.repository.js";
import {
 assignRunnableGoalTeam
} from "../dist/team/team-assignment.service.js";
import {
 listGoalAssignments,
 deleteGoalAssignments
} from "../dist/team/team-assignment.repository.js";
import {
 createWorkHandoff,
 deliverWorkHandoff
} from "../dist/team/handoff.service.js";
import {
 listGoalHandoffs,
 deleteGoalHandoffs
} from "../dist/team/handoff.repository.js";
import {
 prepareGoalTaskExecution,
 completeGoalTaskExecution,
 failGoalTaskExecution,
 synchronizeGoalExecution,
 goalExecutionSnapshot,
 isGoalManagedTask
} from "../dist/team/goal-team-execution.service.js";

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
const projectId=`prj_team_execution_${stamp}`;
let goalId="";

function task(id){
 return db.prepare("SELECT * FROM tasks WHERE id=?").get(id);
}

function job(id){
 return db.prepare("SELECT * FROM jobs WHERE id=?").get(id);
}

function cleanup(){
 try{if(goalId)deleteGoalHandoffs(goalId);}catch{}
 try{if(goalId)deleteGoalAssignments(goalId);}catch{}
 try{
  if(goalId){
   const dispatches=listGoalWorkDispatches(goalId);
   for(const dispatch of dispatches){
    try{db.prepare("DELETE FROM jobs WHERE id=?").run(dispatch.jobId);}catch{}
    try{db.prepare("DELETE FROM tasks WHERE id=?").run(dispatch.taskId);}catch{}
   }
   deleteGoalWorkDispatches(goalId);
  }
 }catch{}
 try{if(goalId)deleteGoalTaskGraph(goalId);}catch{}
 try{if(goalId)deleteProjectGoal(goalId);}catch{}
 try{db.prepare("DELETE FROM projects WHERE id=?").run(projectId);}catch{}
}

try{
 const time=new Date().toISOString();
 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,phase,progress,workspace,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,
  "Graph Team Execution",
  `graph-team-execution-${stamp}`,
  "active",
  "autonomous_development",
  0,
  `workspaces/graph-team-execution-${stamp}`,
  time,
  time
 );

 const draft=createGoal({
  projectId,
  title:"Graph Team Execution",
  objective:"Coordinate architecture implementation and validation through the persistent queue",
  priority:"high",
  requirements:[
   {text:"Define architecture",required:true},
   {text:"Implement API",required:true},
   {text:"Validate API",required:true}
  ],
  acceptanceCriteria:["Validation passes"],
  constraints:[{type:"technical",text:"Use TypeScript"}]
 });

 goalId=draft.id;
 const goal=prepareGoal(goalId);
 const [r1,r2,r3]=goal.requirements.map(item=>item.id);
 const criterion=goal.acceptanceCriteria[0].id;

 createGoalTaskGraph(goalId,{
  items:[
   {
    key:"architecture",
    title:"Architecture",
    description:"Define service architecture",
    kind:"architecture",
    priority:90,
    dependencies:[],
    requirementIds:[r1],
    acceptanceCriterionIds:[]
   },
   {
    key:"implementation",
    title:"Implementation",
    description:"Implement service API",
    kind:"implementation",
    priority:80,
    dependencies:["architecture"],
    requirementIds:[r2],
    acceptanceCriterionIds:[]
   },
   {
    key:"validation",
    title:"Validation",
    description:"Validate implementation",
    kind:"test",
    priority:70,
    dependencies:["implementation"],
    requirementIds:[r3],
    acceptanceCriterionIds:[criterion]
   }
  ]
 });

 refreshGoalTaskReadiness(goalId);
 assignRunnableGoalTeam(goalId);
 dispatchRunnableGoalWork(goalId);

 let graph=loadGoalTaskGraph(goalId);
 const architecture=graph.items.find(item=>item.key==="architecture");
 const implementation=graph.items.find(item=>item.key==="implementation");
 const validation=graph.items.find(item=>item.key==="validation");

 let dispatches=listGoalWorkDispatches(goalId);
 const architectureDispatch=dispatches.find(item=>item.workItemId===architecture.id);

 check("one root dispatch exists",dispatches.length===1);
 check("architecture dispatched first",Boolean(architectureDispatch));
 check("architecture task exists",Boolean(task(architectureDispatch.taskId)));
 check("architecture job exists",Boolean(job(architectureDispatch.jobId)));
 check("goal task recognized",isGoalManagedTask(architectureDispatch.taskId));

 const preparedArchitecture=prepareGoalTaskExecution(architectureDispatch.taskId);
 check("architecture execution prepared",Boolean(preparedArchitecture));
 check("architecture work running",loadGoalTaskGraph(goalId).items.find(item=>item.id===architecture.id)?.status==="running");

 let assignments=listGoalAssignments(goalId);
 const architectureAssignment=assignments.find(item=>item.workItemId===architecture.id);
 check("architect assignment exists",Boolean(architectureAssignment));
 check("architect assignment working",architectureAssignment.status==="working");

 const handoff=createWorkHandoff({
  goalId,
  fromAssignmentId:architectureAssignment.id,
  toWorkItemId:implementation.id,
  summary:"Use repository boundary for persistence.",
  decisions:["Persistence stays behind repository abstraction"],
  recommendations:["Implement repository before transport coupling"]
 });
 deliverWorkHandoff(handoff.id);

 db.prepare(`
  UPDATE tasks
  SET status='completed',phase='completed',completed_at=?,updated_at=?
  WHERE id=?
 `).run(time,time,architectureDispatch.taskId);
 db.prepare(`
  UPDATE jobs
  SET status='completed',completed_at=?,updated_at=?
  WHERE id=?
 `).run(time,time,architectureDispatch.jobId);

 const architectureDone=completeGoalTaskExecution(architectureDispatch.taskId);
 check("architecture completion synchronized",Boolean(architectureDone));
 check("architecture graph completed",loadGoalTaskGraph(goalId).items.find(item=>item.id===architecture.id)?.status==="completed");

 dispatches=listGoalWorkDispatches(goalId);
 const implementationDispatch=dispatches.find(item=>item.workItemId===implementation.id);
 check("implementation automatically dispatched",Boolean(implementationDispatch));
 check("exactly two dispatches after architecture",dispatches.length===2);
 check("implementation real task exists",Boolean(task(implementationDispatch.taskId)));
 check("implementation real job exists",Boolean(job(implementationDispatch.jobId)));

 assignments=listGoalAssignments(goalId);
 const developerAssignment=assignments.find(item=>item.workItemId===implementation.id);
 check("developer assignment automatically created",Boolean(developerAssignment));
 check("implementation assigned developer",developerAssignment.role==="developer");

 const boundHandoff=listGoalHandoffs(goalId)[0];
 check("handoff bound to developer assignment",boundHandoff.toAssignmentId===developerAssignment.id);

 prepareGoalTaskExecution(implementationDispatch.taskId);
 check("implementation marked running",loadGoalTaskGraph(goalId).items.find(item=>item.id===implementation.id)?.status==="running");
 check("developer marked working",listGoalAssignments(goalId).find(item=>item.id===developerAssignment.id)?.status==="working");

 db.prepare(`
  UPDATE tasks
  SET status='completed',phase='completed',completed_at=?,updated_at=?
  WHERE id=?
 `).run(time,time,implementationDispatch.taskId);
 db.prepare(`
  UPDATE jobs
  SET status='completed',completed_at=?,updated_at=?
  WHERE id=?
 `).run(time,time,implementationDispatch.jobId);

 completeGoalTaskExecution(implementationDispatch.taskId);

 dispatches=listGoalWorkDispatches(goalId);
 const validationDispatch=dispatches.find(item=>item.workItemId===validation.id);
 check("validation automatically dispatched",Boolean(validationDispatch));
 check("three dispatches persisted",dispatches.length===3);

 assignments=listGoalAssignments(goalId);
 const testerAssignment=assignments.find(item=>item.workItemId===validation.id);
 check("tester assignment automatically created",Boolean(testerAssignment));
 check("validation assigned tester",testerAssignment.role==="tester");

 const beforeFinal=db.prepare("SELECT * FROM projects WHERE id=?").get(projectId);
 check("project not completed before final work",beforeFinal.status!=="completed");
 check("project progress advanced",Number(beforeFinal.progress)>0&&Number(beforeFinal.progress)<100);

 prepareGoalTaskExecution(validationDispatch.taskId);

 db.prepare(`
  UPDATE tasks
  SET status='completed',phase='completed',completed_at=?,updated_at=?
  WHERE id=?
 `).run(time,time,validationDispatch.taskId);
 db.prepare(`
  UPDATE jobs
  SET status='completed',completed_at=?,updated_at=?
  WHERE id=?
 `).run(time,time,validationDispatch.jobId);

 const final=completeGoalTaskExecution(validationDispatch.taskId);
 check("goal execution terminal",final.state.terminal);
 check("goal execution successful",final.state.success);
 check("all graph work completed",final.state.completed===3);

 const project=db.prepare("SELECT * FROM projects WHERE id=?").get(projectId);
 check("project completed only after graph complete",project.status==="completed");
 check("project progress reaches 100",Number(project.progress)===100);

 const beforeSyncDispatches=listGoalWorkDispatches(goalId).length;
 const beforeSyncAssignments=listGoalAssignments(goalId).length;

 const sync1=synchronizeGoalExecution(goalId);
 const sync2=synchronizeGoalExecution(goalId);

 check("terminal synchronization creates no dispatch",sync1.dispatched.length===0&&sync2.dispatched.length===0);
 check("terminal synchronization creates no assignment",sync1.assignments.length===0&&sync2.assignments.length===0);
 check("dispatch idempotency preserved",listGoalWorkDispatches(goalId).length===beforeSyncDispatches);
 check("assignment idempotency preserved",listGoalAssignments(goalId).length===beforeSyncAssignments);

 const snapshot=goalExecutionSnapshot(goalId);
 check("snapshot contains three dispatches",snapshot.dispatches.length===3);
 check("snapshot contains three assignments",snapshot.assignments.length===3);
 check("snapshot reports success",snapshot.state.success);

 cleanup();
 check(
  "project cleanup",
  Number(db.prepare("SELECT COUNT(*) AS count FROM projects WHERE id=?").get(projectId)?.count)===0
 );
}catch(error){
 failed++;
 console.error(error);
 cleanup();
}

const failureProjectId=`prj_team_failure_${stamp}`;
let failureGoalId="";

try{
 const time=new Date().toISOString();
 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,phase,progress,workspace,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  failureProjectId,
  "Graph Failure",
  `graph-failure-${stamp}`,
  "active",
  "autonomous_development",
  0,
  `workspaces/graph-failure-${stamp}`,
  time,
  time
 );

 const draft=createGoal({
  projectId:failureProjectId,
  title:"Failure Propagation",
  objective:"Verify graph failure blocks dependent work",
  priority:"normal",
  requirements:[
   {text:"Implement feature",required:true},
   {text:"Validate feature",required:true}
  ],
  acceptanceCriteria:["Validation succeeds"],
  constraints:[]
 });

 failureGoalId=draft.id;
 const goal=prepareGoal(failureGoalId);

 createGoalTaskGraph(failureGoalId,{
  items:[
   {
    key:"implementation",
    title:"Implementation",
    description:"Implement feature",
    kind:"implementation",
    priority:80,
    dependencies:[],
    requirementIds:[goal.requirements[0].id],
    acceptanceCriterionIds:[]
   },
   {
    key:"validation",
    title:"Validation",
    description:"Validate feature",
    kind:"test",
    priority:70,
    dependencies:["implementation"],
    requirementIds:[goal.requirements[1].id],
    acceptanceCriterionIds:[goal.acceptanceCriteria[0].id]
   }
  ]
 });

 refreshGoalTaskReadiness(failureGoalId);
 assignRunnableGoalTeam(failureGoalId);
 dispatchRunnableGoalWork(failureGoalId);

 const graph=loadGoalTaskGraph(failureGoalId);
 const implementation=graph.items.find(item=>item.key==="implementation");
 const validation=graph.items.find(item=>item.key==="validation");
 const dispatch=listGoalWorkDispatches(failureGoalId)[0];

 prepareGoalTaskExecution(dispatch.taskId);
 failGoalTaskExecution(dispatch.taskId,"failed");

 const failedGraph=loadGoalTaskGraph(failureGoalId);
 check("failed work marked failed",failedGraph.items.find(item=>item.id===implementation.id)?.status==="failed");
 check("dependent work becomes blocked",failedGraph.items.find(item=>item.id===validation.id)?.status==="blocked");
 check("blocked dependency not dispatched",listGoalWorkDispatches(failureGoalId).length===1);

 const failedAssignment=listGoalAssignments(failureGoalId)
  .find(item=>item.workItemId===implementation.id);
 check("failed work assignment failed",failedAssignment.status==="failed");

 const failedProject=db.prepare("SELECT * FROM projects WHERE id=?").get(failureProjectId);
 check("terminal failed graph fails project",failedProject.status==="failed");

 deleteGoalHandoffs(failureGoalId);
 deleteGoalAssignments(failureGoalId);
 for(const item of listGoalWorkDispatches(failureGoalId)){
  db.prepare("DELETE FROM jobs WHERE id=?").run(item.jobId);
  db.prepare("DELETE FROM tasks WHERE id=?").run(item.taskId);
 }
 deleteGoalWorkDispatches(failureGoalId);
 deleteGoalTaskGraph(failureGoalId);
 deleteProjectGoal(failureGoalId);
 db.prepare("DELETE FROM projects WHERE id=?").run(failureProjectId);

 check(
  "failure project cleanup",
  Number(db.prepare("SELECT COUNT(*) AS count FROM projects WHERE id=?").get(failureProjectId)?.count)===0
 );
}catch(error){
 failed++;
 console.error(error);
 try{if(failureGoalId)deleteGoalHandoffs(failureGoalId);}catch{}
 try{if(failureGoalId)deleteGoalAssignments(failureGoalId);}catch{}
 try{
  if(failureGoalId){
   for(const item of listGoalWorkDispatches(failureGoalId)){
    db.prepare("DELETE FROM jobs WHERE id=?").run(item.jobId);
    db.prepare("DELETE FROM tasks WHERE id=?").run(item.taskId);
   }
   deleteGoalWorkDispatches(failureGoalId);
  }
 }catch{}
 try{if(failureGoalId)deleteGoalTaskGraph(failureGoalId);}catch{}
 try{if(failureGoalId)deleteProjectGoal(failureGoalId);}catch{}
 try{db.prepare("DELETE FROM projects WHERE id=?").run(failureProjectId);}catch{}
}

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 2 PASS 4");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("\nVEYLITH v1.0 BATCH 2 PASS 4 PASSED");
}else{
 console.error("\nVEYLITH v1.0 BATCH 2 PASS 4 FAILED");
 process.exitCode=1;
}
