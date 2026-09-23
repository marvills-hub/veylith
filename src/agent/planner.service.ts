import {MAX_REPAIR_ATTEMPTS} from "../config/config.js";
import {projectMemory} from "../database/database.js";
import {sourceSnapshot,writeProjectFile} from "../runtime/filesystem.service.js";
import {runCommand} from "../runtime/command.service.js";
import {aiJSON} from "./ai.service.js";
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
 const system=`You are Veylith's senior autonomous software engineering planner.
Design complete runnable implementations, not snippets.
Return ONLY JSON.
Schema:
{"summary":"implementation summary","architecture":["decision"],"files":[{"path":"relative/path","content":"COMPLETE file content"}],"commands":[{"command":"npm|npx|node","args":["argument"]}]}
Rules:
- All file contents must be complete.
- Paths must be relative.
- Prefer minimal dependencies.
- Include build/test commands appropriate for the project.
- Do not use shell operators.
- Do not use destructive commands.
- Do not include git commands.
- Do not access paths outside the project.`;
 return aiJSON(system,`PROJECT: ${project.name}\nREQUEST:\n${task.prompt}`,task.id,project.id);
}
export async function repairPlan(task:any,project:any,failure:any,attempt:number){
 const snapshot=await sourceSnapshot(project.workspace);
 const memories=projectMemory(project.id);
 const system=`You are Veylith's autonomous repair engineer.
A generated project failed validation.
Analyze the actual failure and return ONLY JSON.
Schema:
{"analysis":"root cause","files":[{"path":"relative/path","content":"COMPLETE replacement file content"}],"commands":[{"command":"npm|npx|node","args":["argument"]}]}
Rules:
- Change only files necessary to repair the failure.
- Return complete replacement contents.
- Do not use shell operators or destructive commands.
- Commands must validate the repair.
- Do not use git commands.`;
 return aiJSON(system,`TASK:\n${task.prompt}\nREPAIR ATTEMPT: ${attempt}/${MAX_REPAIR_ATTEMPTS}\nFAILURE:\n${JSON.stringify(failure,null,2)}\nMEMORY:\n${JSON.stringify(memories,null,2)}\nCURRENT PROJECT:\n${snapshot}`,task.id,project.id);
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
  results.push({command:item.command,args:item.args,code:result.code,stdout:result.stdout.slice(-6000),stderr:result.stderr.slice(-6000)});
  if(result.code!==0)return{success:false,results,failure:results[results.length-1]};
 }
 return{success:true,results};
}
