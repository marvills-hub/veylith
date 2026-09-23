import {db,memory} from "../database/database.js";
import {MAX_REPAIR_ATTEMPTS,now} from "../config/config.js";
import {event,setPhase} from "../core/telemetry.js";
import {designArchitecture} from "../agent/architect.service.js";
import {createDevelopmentPlan} from "../agent/development-planner.service.js";
import {developProject} from "../agent/developer.service.js";
import {reviewProject} from "../agent/reviewer.service.js";
import {repairProject} from "../agent/repair.service.js";
import {diagnoseFailure,repairHistory,failureFingerprint} from "../agent/diagnostic.service.js";
import {applyDevelopment,validateDevelopment} from "./pipeline.service.js";
import {runStep} from "./phase.service.js";
import {checkpoint,successfulRepairCount} from "./checkpoint.service.js";
import {initializeGit,publishToGitHub} from "../git/git.service.js";
import type {ArchitectureResult,DevelopmentPlan,DevelopmentResult,PipelineContext,ReviewResult} from "./pipeline.types.js";

function save(projectId:string,type:string,value:unknown){
 memory(projectId,type,JSON.stringify(value));
}

function updateRepairCount(taskId:string,count:number){
 db.prepare("UPDATE tasks SET repair_attempts=?,updated_at=? WHERE id=?").run(count,now(),taskId);
}

function resumed(task:any,project:any,phase:string,type:string){
 event("checkpoint.resumed",`${phase} restored from checkpoint`,{
  taskId:task.id,
  projectId:project.id,
  data:{phase,type}
 });
}

function progressForRepair(attempt:number){
 return Math.min(72+(attempt-1)*6,84);
}

function progressForValidation(attempt:number){
 return Math.min(76+(attempt-1)*6,88);
}

function progressForReview(attempt:number){
 return Math.min(82+(attempt-1)*4,92);
}

export async function executeAutonomousPipeline(task:any,project:any){
 const context:PipelineContext={task,project};

 event("orchestrator.started","Autonomous development pipeline started",{
  taskId:task.id,
  projectId:project.id,
  data:{attempt:task.attempts+1}
 });

 const savedArchitecture=checkpoint<ArchitectureResult>(project.id,"architecture");
 if(savedArchitecture){
  context.architecture=savedArchitecture;
  resumed(task,project,"architecture","architecture");
 }else{
  context.architecture=await runStep(
   task.id,project.id,"architecture","architect","Design project architecture",10,
   async()=>{
    const result=await designArchitecture(task,project);
    save(project.id,"architecture",result);
    return result;
   },
   {requirement:task.prompt}
  );
 }

 const savedPlan=checkpoint<DevelopmentPlan>(project.id,"development_plan");
 if(savedPlan){
  context.plan=savedPlan;
  resumed(task,project,"planning","development_plan");
 }else{
  context.plan=await runStep(
   task.id,project.id,"planning","planner","Create development plan",20,
   async()=>{
    const result=await createDevelopmentPlan(task,project,context.architecture!);
    save(project.id,"development_plan",result);
    return result;
   },
   context.architecture
  );
 }

 const savedDevelopment=checkpoint<DevelopmentResult>(project.id,"development");
 if(savedDevelopment){
  context.development=savedDevelopment;
  resumed(task,project,"development","development");
 }else{
  context.development=await runStep(
   task.id,project.id,"development","developer","Generate project implementation",40,
   async()=>{
    const result=await developProject(task,project,context.architecture!,context.plan!);
    await applyDevelopment(result,task,project,context.plan);
    save(project.id,"development",result);
    return result;
   },
   context.plan
  );
 }

 let repairAttempt=successfulRepairCount(project.id);
 const latestRepairCheckpoint=repairAttempt>0
  ?checkpoint<DevelopmentResult>(project.id,`repair_${repairAttempt}`)
  :null;
 if(latestRepairCheckpoint){
  context.development=latestRepairCheckpoint;
  resumed(task.id,project.id,"development",`repair_${repairAttempt}`);
 }
 updateRepairCount(task.id,repairAttempt);

 let validation:any;
 const initialValidationType=repairAttempt>0?`repair_validation_${repairAttempt}`:"validation";
 const savedValidation=checkpoint<any>(project.id,initialValidationType);

 if(savedValidation){
  validation=savedValidation;
  resumed(task,project,"validation",initialValidationType);
 }else{
  validation=await runStep(
   task.id,project.id,"validation","runtime",
   repairAttempt>0?`Validate repair - attempt ${repairAttempt}`:"Build and test generated project",
   repairAttempt>0?progressForValidation(repairAttempt):65,
   async()=>{
    const result=await validateDevelopment(context.development!,task,project);
    save(project.id,initialValidationType,result);
    return result;
   }
  );
 }

 let review:ReviewResult|undefined;

 while(true){
  if(validation.success){
   const reviewType=`review_${repairAttempt}`;
   const savedReview=checkpoint<ReviewResult>(project.id,reviewType);

   if(savedReview){
    review=savedReview;
    context.review=review;
    resumed(task,project,"review",reviewType);
   }else{
    review=await runStep(
     task.id,project.id,"review","reviewer","Review generated project",
     progressForReview(repairAttempt),
     async()=>{
      const result=await reviewProject(task,project,context.architecture!,context.plan!,context.development!,validation);
      save(project.id,reviewType,result);
      return result;
     }
    );
    context.review=review;
   }

   if(review.approved)break;
  }

  if(repairAttempt>=MAX_REPAIR_ATTEMPTS){
   const reason=validation.success
    ?`Reviewer rejected the implementation: ${review?.issues?.join("; ")||review?.summary||"unknown issue"}`
    :`Validation failed: ${validation.failure?.stderr||validation.failure?.stdout||"unknown failure"}`;

   const history=repairHistory(project.id);
   const report={
    reason,
    repairAttempts:repairAttempt,
    failureFingerprint:validation.success?null:failureFingerprint(validation),
    validation,
    review:review||null,
    history,
    exhaustedAt:now()
   };

   save(project.id,"diagnostic_failure_report",report);

   event("repair.exhausted","Autonomous repair budget exhausted",{
    taskId:task.id,
    projectId:project.id,
    level:"error",
    data:{
     repairAttempts:repairAttempt,
     fingerprint:report.failureFingerprint,
     history:history.map(item=>({
      attempt:item.attempt,
      summary:item.summary,
      files:item.files,
      fingerprint:item.fingerprint
     }))
    }
   });

   throw new Error(`Autonomous repair limit reached. ${reason}`);
  }

  const nextRepair=repairAttempt+1;
  const repairType=`repair_${nextRepair}`;
  const savedRepair=checkpoint<DevelopmentResult>(project.id,repairType);

  if(savedRepair){
   context.development=savedRepair;
   repairAttempt=nextRepair;
   updateRepairCount(task.id,repairAttempt);
   resumed(task,project,"repair",repairType);
  }else{
   let diagnostic:any;

   if(validation.success){
    diagnostic={
     summary:"Reviewer requested changes after successful validation.",
     rootCause:review?.summary||"Reviewer findings require repair.",
     evidence:review?.issues||[],
     relevantFiles:[],
     previousAttempts:[],
     strategy:review?.issues||[],
     avoid:[],
     confidence:"medium",
     fingerprint:`review_${nextRepair}`
    };
   }else{
    diagnostic=await runStep(
     task.id,
     project.id,
     "diagnosis",
     "diagnostic",
     `Diagnose validation failure - repair ${nextRepair}`,
     Math.max(68,progressForRepair(nextRepair)-3),
     async()=>diagnoseFailure(
      task,
      project,
      context.architecture!,
      context.plan!,
      validation,
      review
     ),
     {
      failure:validation.failure,
      fingerprint:failureFingerprint(validation),
      previousRepairs:repairHistory(project.id).length
     }
    );

    save(project.id,`diagnostic_${nextRepair}`,diagnostic);

    event("diagnostic.completed",diagnostic.summary,{
     taskId:task.id,
     projectId:project.id,
     data:{
      attempt:nextRepair,
      rootCause:diagnostic.rootCause,
      confidence:diagnostic.confidence,
      fingerprint:diagnostic.fingerprint,
      relevantFiles:diagnostic.relevantFiles
     }
    });
   }

   const historyBeforeRepair=repairHistory(project.id);

   const repair=await runStep(
    task.id,
    project.id,
    "repair",
    "repair",
    `Repair implementation - attempt ${nextRepair}`,
    progressForRepair(nextRepair),
    async()=>{
     const failure=validation.success
      ?{type:"review",review}
      :{type:"validation",validation};

     const result=await repairProject(
      task,
      project,
      context.architecture!,
      context.plan!,
      failure,
      review,
      diagnostic,
      historyBeforeRepair
     );

     await applyDevelopment(result,task,project,context.plan);
     save(project.id,repairType,result);
     return result;
    },
    {
     diagnostic,
     previousRepairs:historyBeforeRepair.map(item=>({
      attempt:item.attempt,
      summary:item.summary,
      files:item.files,
      fingerprint:item.fingerprint
     }))
    }
   );

   context.development=repair;
   repairAttempt=nextRepair;
   updateRepairCount(task.id,repairAttempt);
  }

  const repairValidationType=`repair_validation_${repairAttempt}`;
  const repairValidationCheckpoint=checkpoint<any>(project.id,repairValidationType);

  if(repairValidationCheckpoint){
   validation=repairValidationCheckpoint;
   resumed(task,project,"validation",repairValidationType);
  }else{
   validation=await runStep(
    task.id,
    project.id,
    "validation",
    "runtime",
    `Validate repair - attempt ${repairAttempt}`,
    progressForValidation(repairAttempt),
    async()=>{
     const result=await validateDevelopment(context.development!,task,project);
     save(project.id,repairValidationType,result);
     return result;
    }
   );
  }

  if(!validation.success){
   const currentFingerprint=failureFingerprint(validation);
   const history=repairHistory(project.id);
   const sameFailures=history.filter(item=>item.fingerprint===currentFingerprint);

   if(sameFailures.length>1){
    event("repair.stalled","The same validation failure survived multiple repairs",{
     taskId:task.id,
     projectId:project.id,
     level:"warn",
     data:{
      fingerprint:currentFingerprint,
      attempts:sameFailures.map(item=>item.attempt),
      latestFailure:validation.failure
     }
    });
   }
  }
 }

 context.validation=validation;

 const savedGit=checkpoint<any>(project.id,"git");
 if(savedGit){
  resumed(task,project,"versioning","git");
 }else{
  await runStep(
   task.id,project.id,"versioning","git","Create local Git commit",94,
   async()=>{
    const result=await initializeGit(task,project);
    save(project.id,"git",result);
    return result;
   }
  );
 }

 const savedGithub=checkpoint<any>(project.id,"github");

 if(savedGithub){
  context.github=savedGithub;
  resumed(task,project,"publishing","github");
 }else{
  const freshProject=db.prepare("SELECT * FROM projects WHERE id=?").get(project.id) as any;

  context.github=await runStep(
   task.id,project.id,"publishing","github","Publish project to GitHub",97,
   async()=>{
    const result=await publishToGitHub(task,freshProject);
    save(project.id,"github",result);
    return result;
   }
  );
 }

 setPhase(task.id,project.id,"completed",100);

 const result={
  architecture:context.architecture.summary,
  plan:context.plan.summary,
  implementation:context.development?.summary,
  review:context.review?.summary,
  repairAttempts:repairAttempt,
  github:context.github
 };

 save(project.id,"completion",result);

 event("orchestrator.completed","Autonomous development pipeline completed",{
  taskId:task.id,
  projectId:project.id,
  data:{repairAttempts:repairAttempt}
 });

 return result;
}




