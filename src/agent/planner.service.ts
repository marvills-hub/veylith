import {MAX_REPAIR_ATTEMPTS} from "../config/config.js";
import {projectMemory} from "../database/database.js";
import {writeProjectFile} from "../runtime/filesystem.service.js";
import {runCommand} from "../runtime/command.service.js";
import {aiJSON} from "./ai.service.js";
import {repositoryIntelligence} from "../intelligence/repository-intelligence.service.js";

function demoPlan(project:any){
 return{
  summary:"Create and verify Veylith's autonomous hello API.",
  files:[
   {path:"package.json",content:JSON.stringify({name:project.slug,version:"1.0.0",private:true,type:"module",scripts:{test:"node test.js",start:"node src/server.js"}},null,2)},
   {path:"src/server.js",content:`import http from "node:http";\nconst server=http.createServer((req,res)=>{res.setHeader("Content-Type","application/json");if(req.url==="/hello"){res.writeHead(200);res.end(JSON.stringify({message:"Hello from Veylith"}));return;}res.writeHead(404);res.end(JSON.stringify({error:"Not found"}));});\nserver.listen(Number(process.env.PORT||0),"127.0.0.1");\nexport default server;\n`},
   {path:"test.js",content:`import server from "./src/server.js";\nawait new Promise((resolve,reject)=>{if(server.listening)return resolve();server.once("listening",resolve);server.once("error",reject);});\nconst address=server.address();\nif(!address||typeof address!=="object")throw new Error("Server did not provide a listening address");\ntry{\nconst r=await fetch("http://127.0.0.1:"+address.port+"/hello");\nconst b=await r.json();\nif(r.status!==200||b.message!=="Hello from Veylith")throw new Error("Unexpected response: "+r.status+" "+JSON.stringify(b));\nconsole.log("PASS /hello on port "+address.port);\n}finally{await new Promise(resolve=>server.close(resolve));}\n`}
  ],
  commands:[{command:"node",args:["test.js"]}]
 };
}

export async function createPlan(task:any,project:any){
 if(task.prompt.startsWith("[VEYLITH_DEMO]"))return demoPlan(project);
 const intelligence=await repositoryIntelligence(project.workspace,task.prompt,50000);
 const system=`You are Veylith's senior autonomous software engineering planner.
Design and implement complete runnable changes against the ACTUAL repository.
Return ONLY JSON.
Schema:
{"summary":"implementation summary","architecture":["decision"],"files":[{"path":"relative/path","content":"COMPLETE file content"}],"commands":[{"command":"npm|npx|node","args":["argument"]}]}
Rules:
- REPOSITORY CONTEXT is authoritative evidence of the existing project.
- Preserve existing architecture and behavior not related to the request.
- Prefer targeted modifications instead of recreating an existing project.
- All returned file contents must be complete.
- Paths must be relative.
- Prefer existing dependencies and project conventions.
- Add dependencies only when genuinely required.
- Include finite build/test/lint commands appropriate for the project.
- Prefer existing validation scripts when available.
- Do not use shell operators.
- Do not use destructive commands.
- Do not include git commands.
- Do not access paths outside the project.
- Never include npm start, npm run start, npm run dev, watch mode, development servers, production servers or interactive commands.
- Every validation command must terminate automatically.`;
 return aiJSON(
  system,
  `PROJECT:
${project.name}

REQUEST:
${task.prompt}

REPOSITORY CONTEXT:
${intelligence.prompt}`,
  task.id,
  project.id
 );
}

export async function repairPlan(task:any,project:any,failure:any,attempt:number){
 const memories=projectMemory(project.id);
 const failureData=failure?.failure||failure||{};
 const query=[
  task.prompt,
  String(failureData.command||""),
  JSON.stringify(failureData.args||[]),
  String(failureData.stderr||"").slice(-8000),
  String(failureData.stdout||"").slice(-8000),
  "repair validation failure"
 ].join(" ");
 const intelligence=await repositoryIntelligence(project.workspace,query,60000);
 const system=`You are Veylith's autonomous repair engineer.
A generated project failed validation.
Analyze the ACTUAL repository and ACTUAL failure and return ONLY JSON.
Schema:
{"analysis":"root cause","files":[{"path":"relative/path","content":"COMPLETE replacement file content"}],"commands":[{"command":"npm|npx|node","args":["argument"]}]}
Rules:
- REPOSITORY CONTEXT is authoritative for the current selected source.
- Diagnose and fix the root cause rather than only the visible symptom.
- Change only files necessary to repair the failure.
- Preserve behavior that is already correct.
- Return complete replacement contents.
- Never weaken valid tests merely to make validation pass.
- Do not use shell operators or destructive commands.
- Commands must validate the repair and terminate automatically.
- Prefer the smallest validation that reproduces the failure, then broader validation when useful.
- Never include npm start, npm run start, npm run dev, watch mode or server commands.
- Do not use git commands.`;
 return aiJSON(
  system,
  `TASK:
${task.prompt}

REPAIR ATTEMPT:
${attempt}/${MAX_REPAIR_ATTEMPTS}

FAILURE:
${JSON.stringify(failure,null,2)}

MEMORY:
${JSON.stringify(memories,null,2)}

REPOSITORY CONTEXT:
${intelligence.prompt}`,
  task.id,
  project.id
 );
}

export async function applyPlan(plan:any,task:any,project:any){
 if(!Array.isArray(plan.files)||!Array.isArray(plan.commands))throw new Error("Invalid development plan.");
 for(const file of plan.files){
  if(typeof file.path!=="string"||typeof file.content!=="string")throw new Error("Invalid file operation.");
  await writeProjectFile(project.workspace,file.path,file.content,task.id,project.id);
 }
}

export async function validatePlan(plan:any,task:any,project:any){
 const results:any[]=[];
 if(!plan.commands.length)throw new Error("Development plan did not provide validation commands.");
 for(const item of plan.commands){
  if(typeof item.command!=="string"||!Array.isArray(item.args))throw new Error("Invalid validation command.");
  const result=await runCommand(item.command,item.args,project.workspace,task.id,project.id);
  results.push({
   command:item.command,
   args:item.args,
   code:result.code,
   stdout:result.stdout.slice(-6000),
   stderr:result.stderr.slice(-6000)
  });
  if(result.code!==0)return{success:false,results,failure:results[results.length-1]};
 }
 return{success:true,results};
}
