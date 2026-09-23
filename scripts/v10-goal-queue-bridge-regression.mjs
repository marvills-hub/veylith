import {db} from "../dist/database/database.js";
import {createGoal,prepareGoal} from "../dist/goals/goal.service.js";
import {deleteProjectGoal} from "../dist/goals/goal.repository.js";
import {
 createGoalTaskGraph,
 loadGoalTaskGraph
} from "../dist/goals/goal-task-graph.service.js";
import {deleteGoalTaskGraph} from "../dist/goals/goal-task-graph.repository.js";
import {
 advanceGoalExecution,
 dispatchRunnableGoalWork,
 synchronizeGoalWorkDispatches
} from "../dist/goals/goal-work-dispatch.service.js";
import {
 deleteGoalWorkDispatches,
 listGoalWorkDispatches
} from "../dist/goals/goal-work-dispatch.repository.js";

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

const projectId=`prj_goal_queue_${Date.now()}`;
let goalId="";
const createdTasks=[];

function cleanup(){
 try{
  const dispatches=goalId?listGoalWorkDispatches(goalId):[];
  for(const dispatch of dispatches){
   try{db.prepare("DELETE FROM jobs WHERE task_id=?").run(dispatch.taskId);}catch{}
   try{db.prepare("DELETE FROM tasks WHERE id=?").run(dispatch.taskId);}catch{}
  }
  if(goalId)deleteGoalWorkDispatches(goalId);
  if(goalId)deleteGoalTaskGraph(goalId);
  if(goalId)deleteProjectGoal(goalId);
 }catch{}
}

try{
 const time=new Date().toISOString();

 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,phase,progress,workspace,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,
  "Goal Queue Regression",
  `goal-queue-${Date.now()}`,
  "queued",
  "queued",
  0,
  `workspaces/goal-queue-${Date.now()}`,
  time,
  time
 );

 const draft=createGoal({
  projectId,
  title:"Dependency Queue Test",
  objective:"Verify dependency-aware goal work enters the real Veylith queue",
  priority:"high",
  requirements:[
   {text:"Implement API foundation",required:true},
   {text:"Implement authentication",required:true}
  ],
  acceptanceCriteria:[
   "API validation passes",
   "Authentication validation passes"
  ],
  constraints:[]
 });

 goalId=draft.id;
 const goal=prepareGoal(goalId);
 const r1=goal.requirements[0].id;
 const r2=goal.requirements[1].id;
 const a1=goal.acceptanceCriteria[0].id;
 const a2=goal.acceptanceCriteria[1].id;

 createGoalTaskGraph(goalId,{
  items:[
   {
    key:"architecture",
    title:"Architecture",
    description:"Prepare implementation architecture",
    kind:"architecture",
    priority:90,
    dependencies:[],
    requirementIds:[r1,r2],
    acceptanceCriterionIds:[]
   },
   {
    key:"api",
    title:"API implementation",
    description:"Implement API foundation",
    kind:"implementation",
    priority:80,
    dependencies:["architecture"],
    requirementIds:[r1],
    acceptanceCriterionIds:[]
   },
   {
    key:"auth",
    title:"Authentication",
    description:"Implement authentication",
    kind:"implementation",
    priority:85,
    dependencies:["architecture"],
    requirementIds:[r2],
    acceptanceCriterionIds:[]
   },
   {
    key:"validation",
    title:"Validation",
    description:"Validate complete behavior",
    kind:"test",
    priority:70,
    dependencies:["api","auth"],
    requirementIds:[r1,r2],
    acceptanceCriterionIds:[a1,a2]
   }
  ]
 });

 const first=dispatchRunnableGoalWork(goalId);
 check("only one root dispatched",first.length===1);
 check("root dispatch created",first[0]?.taskId?.startsWith("tsk_"));
 check("root has persistent job",Boolean(first[0]?.jobId));

 let dispatches=listGoalWorkDispatches(goalId);
 createdTasks.push(...dispatches.map(x=>x.taskId));
 check("one dispatch persisted",dispatches.length===1);

 const rootTask=db.prepare(
  "SELECT * FROM tasks WHERE id=?"
 ).get(first[0].taskId);

 check("real Veylith task created",Boolean(rootTask));

 const rootJob=db.prepare(
  "SELECT * FROM jobs WHERE task_id=?"
 ).get(first[0].taskId);

 check("real persistent job created",Boolean(rootJob));
 check("job initially queued",rootJob?.status==="queued");

 const graph1=loadGoalTaskGraph(goalId);
 check("root marked running after dispatch",graph1.items.find(x=>x.key==="architecture")?.status==="running");
 check("API remains pending",graph1.items.find(x=>x.key==="api")?.status==="pending");
 check("auth remains pending",graph1.items.find(x=>x.key==="auth")?.status==="pending");
 check("validation remains pending",graph1.items.find(x=>x.key==="validation")?.status==="pending");

 const duplicate=dispatchRunnableGoalWork(goalId);
 check("duplicate dispatch prevented",duplicate.length===0);

 db.prepare(
  "UPDATE tasks SET status='completed',phase='completed',completed_at=?,updated_at=? WHERE id=?"
 ).run(time,time,first[0].taskId);
 db.prepare(
  "UPDATE jobs SET status='completed',completed_at=?,updated_at=? WHERE task_id=?"
 ).run(time,time,first[0].taskId);

 synchronizeGoalWorkDispatches(goalId);

 const graph2=loadGoalTaskGraph(goalId);
 check("root synchronized completed",graph2.items.find(x=>x.key==="architecture")?.status==="completed");
 check("API unlocked",graph2.items.find(x=>x.key==="api")?.status==="ready");
 check("auth unlocked",graph2.items.find(x=>x.key==="auth")?.status==="ready");
 check("validation still locked",graph2.items.find(x=>x.key==="validation")?.status==="pending");

 const second=dispatchRunnableGoalWork(goalId);
 check("two independent children dispatched",second.length===2);
 check("higher priority auth dispatched first",second[0]&&db.prepare("SELECT title FROM tasks WHERE id=?").get(second[0].taskId)?.title==="Authentication");

 dispatches=listGoalWorkDispatches(goalId);
 createdTasks.push(...dispatches.map(x=>x.taskId).filter(x=>!createdTasks.includes(x)));
 check("three total dispatches persisted",dispatches.length===3);

 for(const dispatch of second){
  db.prepare(
   "UPDATE tasks SET status='completed',phase='completed',completed_at=?,updated_at=? WHERE id=?"
  ).run(time,time,dispatch.taskId);
  db.prepare(
   "UPDATE jobs SET status='completed',completed_at=?,updated_at=? WHERE task_id=?"
  ).run(time,time,dispatch.taskId);
 }

 const advanced=advanceGoalExecution(goalId);
 check("validation automatically dispatched",advanced.newlyDispatched.length===1);

 const validationDispatch=advanced.newlyDispatched[0];
 createdTasks.push(validationDispatch.taskId);

 const validationTask=db.prepare(
  "SELECT * FROM tasks WHERE id=?"
 ).get(validationDispatch.taskId);

 check("validation task is real queue task",validationTask?.title==="Validation");

 const validationJob=db.prepare(
  "SELECT * FROM jobs WHERE task_id=?"
 ).get(validationDispatch.taskId);

 check("validation persistent job exists",Boolean(validationJob));
 check("four dispatches total",listGoalWorkDispatches(goalId).length===4);

 const finalGraph=loadGoalTaskGraph(goalId);
 check("validation marked running",finalGraph.items.find(x=>x.key==="validation")?.status==="running");

 const activeJobs=db.prepare(`
  SELECT COUNT(*) AS count
  FROM jobs
  WHERE project_id=?
  AND status IN ('queued','running','paused','retry_wait')
 `).get(projectId);

 check("only validation job remains active",Number(activeJobs?.count)===1);

 cleanup();
 db.prepare("DELETE FROM projects WHERE id=?").run(projectId);

 check(
  "dispatch cleanup complete",
  Number(db.prepare("SELECT COUNT(*) AS count FROM goal_work_dispatches WHERE goal_id=?").get(goalId)?.count)===0
 );
 check(
  "task cleanup complete",
  Number(db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE project_id=?").get(projectId)?.count)===0
 );
 check(
  "job cleanup complete",
  Number(db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE project_id=?").get(projectId)?.count)===0
 );
}catch(error){
 failed++;
 console.error(error);
 cleanup();
 try{db.prepare("DELETE FROM projects WHERE id=?").run(projectId);}catch{}
}

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 1 PASS 4");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("\nVEYLITH v1.0 BATCH 1 PASS 4 PASSED");
}else{
 console.error("\nVEYLITH v1.0 BATCH 1 PASS 4 FAILED");
 process.exitCode=1;
}
