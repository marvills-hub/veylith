import crypto from "node:crypto";
import {db,memory} from "../database/database.js";
import {now,MAX_REPAIR_ATTEMPTS} from "../config/config.js";
import {event} from "../core/telemetry.js";
import {
 diagnoseFailure,
 failureFingerprint,
 repairHistory,
 type DiagnosticResult,
 type RepairHistoryItem
} from "../agent/diagnostic.service.js";
import {repairProject} from "../agent/repair.service.js";
import {applyDevelopment,validateDevelopment} from "../orchestration/pipeline.service.js";
import {
 synchronizeRepairEvolution,
 rememberRecoveryOutcome
} from "../evolution/repository-learning-lifecycle.service.js";
import type {
 ArchitectureResult,
 DevelopmentPlan,
 DevelopmentResult
} from "../orchestration/pipeline.types.js";

export type TeamRecoveryStatus="recovering"|"recovered"|"exhausted";

export interface TeamRecoveryRecord{
 id:string;
 goalId:string;
 projectId:string;
 workItemId:string;
 assignmentId:string;
 taskId:string;
 status:TeamRecoveryStatus;
 attempts:number;
 maxAttempts:number;
 fingerprint:string|null;
 diagnostic:DiagnosticResult|null;
 validation:any;
 error:string|null;
 createdAt:string;
 updatedAt:string;
 completedAt:string|null;
}

db.exec(`
CREATE TABLE IF NOT EXISTS team_recoveries(
 id TEXT PRIMARY KEY,
 goal_id TEXT NOT NULL,
 project_id TEXT NOT NULL,
 work_item_id TEXT NOT NULL,
 assignment_id TEXT NOT NULL,
 task_id TEXT NOT NULL,
 status TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 max_attempts INTEGER NOT NULL,
 fingerprint TEXT,
 diagnostic_json TEXT,
 validation_json TEXT,
 error TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 completed_at TEXT,
 UNIQUE(assignment_id)
);
CREATE INDEX IF NOT EXISTS idx_team_recoveries_goal
 ON team_recoveries(goal_id);
CREATE INDEX IF NOT EXISTS idx_team_recoveries_task
 ON team_recoveries(task_id);
CREATE INDEX IF NOT EXISTS idx_team_recoveries_status
 ON team_recoveries(status);
`);

function parse(value:any){
 if(value===null||value===undefined||value==="")return null;
 try{return JSON.parse(String(value));}catch{return null;}
}

function map(row:any):TeamRecoveryRecord{
 return{
  id:String(row.id),
  goalId:String(row.goal_id),
  projectId:String(row.project_id),
  workItemId:String(row.work_item_id),
  assignmentId:String(row.assignment_id),
  taskId:String(row.task_id),
  status:row.status,
  attempts:Number(row.attempts||0),
  maxAttempts:Number(row.max_attempts||MAX_REPAIR_ATTEMPTS),
  fingerprint:row.fingerprint?String(row.fingerprint):null,
  diagnostic:parse(row.diagnostic_json),
  validation:parse(row.validation_json),
  error:row.error?String(row.error):null,
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at),
  completedAt:row.completed_at?String(row.completed_at):null
 };
}

export function getTeamRecovery(id:string){
 const row=db.prepare("SELECT * FROM team_recoveries WHERE id=?").get(id);
 return row?map(row):null;
}

export function getAssignmentRecovery(assignmentId:string){
 const row=db.prepare(`
  SELECT *
  FROM team_recoveries
  WHERE assignment_id=?
  LIMIT 1
 `).get(assignmentId);
 return row?map(row):null;
}

export function listGoalRecoveries(goalId:string){
 return(db.prepare(`
  SELECT *
  FROM team_recoveries
  WHERE goal_id=?
  ORDER BY created_at,id
 `).all(goalId) as any[]).map(map);
}

export function deleteGoalRecoveries(goalId:string){
 return Number(
  db.prepare("DELETE FROM team_recoveries WHERE goal_id=?").run(goalId).changes
 );
}

function ensureRecovery(input:{
 goalId:string;
 projectId:string;
 workItemId:string;
 assignmentId:string;
 taskId:string;
}){
 const existing=getAssignmentRecovery(input.assignmentId);
 if(existing)return existing;
 const time=now();
 const id=`rcv_${crypto.randomBytes(8).toString("hex")}`;
 db.prepare(`
  INSERT INTO team_recoveries(
   id,goal_id,project_id,work_item_id,assignment_id,task_id,
   status,attempts,max_attempts,fingerprint,diagnostic_json,
   validation_json,error,created_at,updated_at,completed_at
  ) VALUES(?,?,?,?,?,?,'recovering',0,?,NULL,NULL,NULL,NULL,?,?,NULL)
 `).run(
  id,input.goalId,input.projectId,input.workItemId,input.assignmentId,
  input.taskId,MAX_REPAIR_ATTEMPTS,time,time
 );
 return getTeamRecovery(id)!;
}

function saveAttempt(
 id:string,
 attempt:number,
 diagnostic:DiagnosticResult,
 validation:any,
 error:string|null
){
 db.prepare(`
  UPDATE team_recoveries
  SET status='recovering',
      attempts=?,
      fingerprint=?,
      diagnostic_json=?,
      validation_json=?,
      error=?,
      updated_at=?
  WHERE id=?
 `).run(
  attempt,
  diagnostic.fingerprint||null,
  JSON.stringify(diagnostic),
  JSON.stringify(validation??null),
  error,
  now(),
  id
 );
 return getTeamRecovery(id)!;
}

function finish(
 id:string,
 status:"recovered"|"exhausted",
 validation:any,
 error:string|null
){
 const time=now();
 db.prepare(`
  UPDATE team_recoveries
  SET status=?,
      validation_json=?,
      error=?,
      updated_at=?,
      completed_at=?
  WHERE id=?
 `).run(
  status,
  JSON.stringify(validation??null),
  error,
  time,
  time,
  id
 );
 return getTeamRecovery(id)!;
}

function taskRepairAttempts(taskId:string,count:number){
 db.prepare(`
  UPDATE tasks
  SET repair_attempts=?,phase='repairing',updated_at=?
  WHERE id=?
 `).run(count,now(),taskId);
}

function normalizeFailure(error:unknown,validation?:any){
 if(validation?.failure)return validation;
 const message=error instanceof Error?error.message:String(error);
 return{
  success:false,
  failure:{
   command:"team-role-execution",
   args:[],
   stdout:"",
   stderr:message,
   code:1
  },
  results:[]
 };
}

function repairHistoryForProject(projectId:string):RepairHistoryItem[]{
 try{return repairHistory(projectId);}catch{return[];}
}

export async function recoverGoalWork(input:{
 goalId:string;
 projectId:string;
 workItemId:string;
 assignmentId:string;
 task:any;
 project:any;
 architecture:ArchitectureResult;
 plan:DevelopmentPlan;
 development:DevelopmentResult;
 failure:any;
 error?:unknown;
}){
 let recovery=ensureRecovery({
  goalId:input.goalId,
  projectId:input.projectId,
  workItemId:input.workItemId,
  assignmentId:input.assignmentId,
  taskId:input.task.id
 });

 if(recovery.status==="recovered"){
  return{
   recovered:true,
   recovery,
   development:input.development,
   validation:recovery.validation
  };
 }

 if(recovery.status==="exhausted"){
  return{
   recovered:false,
   exhausted:true,
   recovery,
   development:input.development,
   validation:recovery.validation
  };
 }

 let development=input.development;
 let validation=normalizeFailure(input.error,input.failure);
 let history=repairHistoryForProject(input.projectId);
 let attempt=Math.max(recovery.attempts,Number(input.task.repair_attempts||0));

 while(!validation.success&&attempt<recovery.maxAttempts){
  attempt++;
  taskRepairAttempts(input.task.id,attempt);

  event(
   "team.recovery_started",
   `Team recovery ${attempt}/${recovery.maxAttempts}`,
   {
    taskId:input.task.id,
    projectId:input.projectId,
    level:"warn",
    component:"team-recovery",
    data:{
     goalId:input.goalId,
     workItemId:input.workItemId,
     assignmentId:input.assignmentId,
     attempt,
     fingerprint:failureFingerprint(validation)
    }
   }
  );

  const diagnostic=await diagnoseFailure(
   input.task,
   input.project,
   input.architecture,
   input.plan,
   validation
   );

  saveAttempt(
   recovery.id,
   attempt,
   diagnostic,
   validation,
   validation?.failure?.stderr||
   validation?.failure?.stdout||
   "Validation failed"
  );

  event(
   "team.diagnostic_completed",
   diagnostic.summary,
   {
    taskId:input.task.id,
    projectId:input.projectId,
    component:"team-recovery",
    data:{
     goalId:input.goalId,
     workItemId:input.workItemId,
     assignmentId:input.assignmentId,
     attempt,
     fingerprint:diagnostic.fingerprint,
     confidence:diagnostic.confidence,
     rootCause:diagnostic.rootCause
    }
   }
  );

   const beforeRepairFingerprint=diagnostic.fingerprint;
   let repair:DevelopmentResult;
   try{
    repair=await repairProject(
     input.task,
     input.project,
     input.architecture,
     input.plan,
     validation,
     undefined,
     diagnostic,
     history
    );
    await applyDevelopment(
     repair,
     input.task,
     input.project,
     input.plan
    );
   }catch(error){
    const repairError=error instanceof Error?error.message:String(error);
    const rejected:RepairHistoryItem={
     attempt,
     summary:`Repair proposal rejected before validation: ${repairError}`,
     files:[],
     fingerprint:diagnostic.fingerprint,
     validation:{
      success:false,
      failure:{
       command:"repair-cycle",
       args:[],
       stdout:"",
       stderr:repairError,
       code:1
      },
      results:[]
     }
    };
    history=[...history,rejected];
     memory(
     input.projectId,
     "team_repair",
     JSON.stringify({
      goalId:input.goalId,
      workItemId:input.workItemId,
      assignmentId:input.assignmentId,
      attempt,
      diagnostic:{
       summary:diagnostic.summary,
       rootCause:diagnostic.rootCause,
       fingerprint:diagnostic.fingerprint,
       confidence:diagnostic.confidence
      },
      repair:{
       summary:rejected.summary,
       files:[]
      },
      validation:rejected.validation,
      rejected:true,
      error:repairError
     })
    );
    saveAttempt(
     recovery.id,
     attempt,
     diagnostic,
     validation,
     repairError
    );
    event(
     "team.repair_rejected",
     `Repair attempt ${attempt} rejected: ${repairError}`,
     {
      taskId:input.task.id,
      projectId:input.projectId,
      level:"warn",
      component:"team-recovery",
      data:{
       goalId:input.goalId,
       workItemId:input.workItemId,
       assignmentId:input.assignmentId,
       attempt,
       maxAttempts:recovery.maxAttempts,
       fingerprint:diagnostic.fingerprint,
       error:repairError
      }
     }
    );
    continue;
   }
  const repairEvolution=synchronizeRepairEvolution({
   projectId:input.projectId,
   taskId:input.task.id,
   workspace:input.project.workspace,
   summary:repair.summary,
   files:repair.files.map(file=>file.path),
   evidence:[
    `goal:${input.goalId}`,
    `work:${input.workItemId}`,
    `repair-attempt:${attempt}`,
    `failure:${diagnostic.fingerprint}`
   ]
  });

  development=repair;
  validation=await validateDevelopment(
   development,
   input.task,
   input.project
  );

  const afterRepairFingerprint=failureFingerprint(validation);
   const item:RepairHistoryItem={
   attempt,
   summary:repair.summary,
   files:repair.files.map(file=>file.path),
   fingerprint:afterRepairFingerprint,
   validation
  };

  history=[...history,item];

   if(!validation.success&&afterRepairFingerprint!==beforeRepairFingerprint){
    rememberRecoveryOutcome({
     projectId:input.projectId,
     taskId:input.task.id,
     fingerprint:beforeRepairFingerprint,
     failureKind:String(
      input.failure?.failure?.failureKind||
      input.failure?.failure?.type||
      "validation"
     ),
     summary:diagnostic.summary,
     rootCause:diagnostic.rootCause,
     relevantFiles:diagnostic.relevantFiles,
     repairFiles:repair.files.map(file=>file.path),
     strategy:diagnostic.strategy,
     outcome:"resolved",
     evidence:[
      `repair-attempt:${attempt}`,
      `snapshot:${repairEvolution.snapshot?.id||"unchanged"}`,
      `next-failure:${afterRepairFingerprint}`
     ]
    });

    rememberRecoveryOutcome({
     projectId:input.projectId,
     taskId:input.task.id,
     fingerprint:afterRepairFingerprint,
     failureKind:"validation",
     summary:"Post-repair validation exposed a different failure.",
     rootCause:
      validation?.failure?.stderr||
      validation?.failure?.stdout||
      "A different validation failure appeared after repair.",
     relevantFiles:repair.files.map(file=>file.path),
     repairFiles:[],
     strategy:[],
     outcome:"unresolved",
     evidence:[
      `repair-attempt:${attempt}`,
      `previous-failure:${beforeRepairFingerprint}`,
      `snapshot:${repairEvolution.snapshot?.id||"unchanged"}`
     ]
    });

    event(
     "team.repair_progressed",
     `Repair attempt ${attempt} resolved one failure and exposed another.`,
     {
      taskId:input.task.id,
      projectId:input.projectId,
      component:"team-recovery",
      data:{
       goalId:input.goalId,
       workItemId:input.workItemId,
       assignmentId:input.assignmentId,
       attempt,
       previousFingerprint:beforeRepairFingerprint,
       nextFingerprint:afterRepairFingerprint
      }
     }
    );
   }
  memory(
   input.projectId,
   "team_repair",
   JSON.stringify({
    goalId:input.goalId,
    workItemId:input.workItemId,
    assignmentId:input.assignmentId,
    attempt,
    diagnostic:{
     summary:diagnostic.summary,
     rootCause:diagnostic.rootCause,
     fingerprint:diagnostic.fingerprint,
     confidence:diagnostic.confidence
    },
    repair:{
     summary:repair.summary,
     files:repair.files.map(file=>file.path)
    },
    validation
   })
  );

  if(validation.success){
   rememberRecoveryOutcome({
    projectId:input.projectId,
    taskId:input.task.id,
    fingerprint:diagnostic.fingerprint,
    failureKind:String(
     input.failure?.failure?.failureKind||
     input.failure?.failure?.type||
     "validation"
    ),
    summary:diagnostic.summary,
    rootCause:diagnostic.rootCause,
    relevantFiles:diagnostic.relevantFiles,
    repairFiles:repair.files.map(file=>file.path),
    strategy:diagnostic.strategy,
    outcome:"resolved",
    evidence:[
     `repair-attempt:${attempt}`,
     `snapshot:${repairEvolution.snapshot?.id||"unchanged"}`,
     "post-repair validation passed"
    ]
   });

   recovery=finish(recovery.id,"recovered",validation,null);
   event(
    "team.recovery_completed",
    `Recovered after ${attempt} repair attempt${attempt===1?"":"s"}`,
    {
     taskId:input.task.id,
     projectId:input.projectId,
     component:"team-recovery",
     data:{
      goalId:input.goalId,
      workItemId:input.workItemId,
      assignmentId:input.assignmentId,
      attempts:attempt
     }
    }
   );
   return{
    recovered:true,
    recovery,
    development,
    validation
   };
  }
 }

 const message=
  validation?.failure?.stderr||
  validation?.failure?.stdout||
  `Repair budget exhausted after ${attempt} attempts`;

 recovery=finish(recovery.id,"exhausted",validation,message);

 event(
  "team.recovery_exhausted",
  `Repair budget exhausted after ${attempt} attempts`,
  {
   taskId:input.task.id,
   projectId:input.projectId,
   level:"error",
   component:"team-recovery",
   data:{
    goalId:input.goalId,
    workItemId:input.workItemId,
    assignmentId:input.assignmentId,
    attempts:attempt,
    fingerprint:failureFingerprint(validation)
   }
  }
 );

 return{
  recovered:false,
  exhausted:true,
  recovery,
  development,
  validation
 };
}











