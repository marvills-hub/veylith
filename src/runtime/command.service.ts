import {db} from "../database/database.js";
import {event,broadcast} from "../core/telemetry.js";
import {now} from "../config/config.js";
import {runSandboxCommand} from "../sandbox/sandbox-manager.service.js";
import {assertWorkspaceCwd} from "../security/workspace-security.service.js";
import {securityAllowed,securityRejected} from "../security/security-telemetry.service.js";

function executionRecord(projectId:string,taskId:string,command:string,args:string[],code:number,stdout:string,stderr:string,duration:number){
 db.prepare("INSERT INTO executions(project_id,task_id,command,args,exit_code,stdout,stderr,duration_ms,created_at) VALUES(?,?,?,?,?,?,?,?,?)").run(
  projectId,
  taskId,
  command,
  JSON.stringify(args),
  code,
  stdout.slice(-12000),
  stderr.slice(-12000),
  duration,
  now()
 );
}

function projectWorkspace(projectId:string){
 const project=db.prepare("SELECT workspace FROM projects WHERE id=?").get(projectId) as {workspace?:string}|undefined;
 if(!project?.workspace)throw new Error(`Project workspace not found: ${projectId}`);
 return project.workspace;
}

export async function runCommand(command:string,args:string[],cwd:string,taskId:string,projectId:string){
 command=command.toLowerCase().trim();
 const started=Date.now();

 try{
  const workspace=projectWorkspace(projectId);
  const safeCwd=assertWorkspaceCwd(workspace,cwd);

  securityAllowed("Command workspace accepted",taskId,projectId,{
   command,
   cwd:safeCwd
  });

  event("command.started",`${command} ${args.join(" ")}`,{
   taskId,
   projectId,
   data:{runtime:"sandbox",cwd:safeCwd}
  });

  const result=await runSandboxCommand(command,args,safeCwd,taskId,projectId,{
   stdout:text=>broadcast("terminal",{
    task_id:taskId,
    project_id:projectId,
    stream:"stdout",
    text
   }),
   stderr:text=>broadcast("terminal",{
    task_id:taskId,
    project_id:projectId,
    stream:"stderr",
    text
   })
  });

  executionRecord(
   projectId,
   taskId,
   command,
   args,
   result.code,
   result.stdout,
   result.stderr,
   result.durationMs
  );

  event(result.code===0?"command.completed":"command.failed",`${command} exited with ${result.code}`,{
   taskId,
   projectId,
   level:result.code===0?"info":"error",
   data:{
    duration:result.durationMs,
    sandboxId:result.sandboxId,
    provider:result.provider,
    isolated:result.isolated
   }
  });

  return{
   code:result.code,
   stdout:result.stdout,
   stderr:result.stderr
  };
 }catch(error){
  const message=error instanceof Error?error.message:String(error);
  const duration=Date.now()-started;

  securityRejected("Command rejected",error,taskId,projectId,{command,cwd});

  broadcast("terminal",{
   task_id:taskId,
   project_id:projectId,
   stream:"stderr",
   text:`${message}\n`
  });

  executionRecord(
   projectId,
   taskId,
   command,
   args,
   -1,
   "",
   message,
   duration
  );

  event("command.sandbox_failed",message,{
   taskId,
   projectId,
   level:"error",
   data:{duration}
  });

  return{
   code:-1,
   stdout:"",
   stderr:message
  };
 }
}
