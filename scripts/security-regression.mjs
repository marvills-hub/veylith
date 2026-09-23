import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {resolveWorkspacePath} from "../dist/security/workspace-security.service.js";
import {assertGeneratedFilePath,assertSafeGeneratedFiles} from "../dist/security/generated-file-policy.service.js";
import {writeProjectFile} from "../dist/runtime/filesystem.service.js";
import {validateSandboxCommand} from "../dist/sandbox/host-sandbox.service.js";
import {runSandboxCommand,cancelTaskSandboxes,sandboxStatus} from "../dist/sandbox/sandbox-manager.service.js";
import {sandboxEnvironment} from "../dist/sandbox/sandbox-environment.service.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const workspace=path.join(root,"workspaces","security-regression");
const childScript=path.join(workspace,"containment-child.js");
const results=[];

function record(name,pass,detail=""){
 results.push({name,pass,detail});
 console.log(`${pass?"PASS":"FAIL"}  ${name}${detail?` — ${detail}`:""}`);
}

async function expectBlocked(name,fn){
 try{
  await fn();
  record(name,false,"unexpectedly allowed");
 }catch(error){
  record(name,true,error instanceof Error?error.message:String(error));
 }
}

async function test(name,fn){
 try{
  const detail=await fn();
  record(name,true,typeof detail==="string"?detail:"");
 }catch(error){
  record(name,false,error instanceof Error?error.message:String(error));
 }
}

await fs.rm(workspace,{recursive:true,force:true});
await fs.mkdir(path.join(workspace,"src"),{recursive:true});

console.log("");
console.log("VEYLITH SECURITY REGRESSION");
console.log("--------------------------------------------------------");

await expectBlocked("Workspace traversal blocked",()=>Promise.resolve(resolveWorkspacePath(workspace,"../../.env")));

await expectBlocked("Absolute workspace escape blocked",()=>Promise.resolve(
 resolveWorkspacePath(workspace,path.join(root,".env"))
));

await expectBlocked("Protected .env write blocked",()=>Promise.resolve(
 assertGeneratedFilePath(workspace,".env")
));

await expectBlocked("Protected .git write blocked",()=>Promise.resolve(
 assertGeneratedFilePath(workspace,".git/config")
));

await expectBlocked("Protected .npmrc write blocked",()=>Promise.resolve(
 assertGeneratedFilePath(workspace,".npmrc")
));

await expectBlocked("Protected .ssh write blocked",()=>Promise.resolve(
 assertGeneratedFilePath(workspace,".ssh/id_rsa")
));

await expectBlocked("Atomic malicious file set rejected",()=>Promise.resolve(
 assertSafeGeneratedFiles(workspace,[
  {path:"src/good.ts",content:"export const good=true;"},
  {path:"../../escape.ts",content:"bad"}
 ])
));

await test("Atomic rejection writes nothing",async()=>{
 try{
  await fs.access(path.join(workspace,"src","good.ts"));
  throw new Error("good.ts exists after rejected file set");
 }catch(error){
  if(error?.code==="ENOENT")return "no partial write";
  throw error;
 }
});

await test("Valid workspace file write",async()=>{
 await writeProjectFile(workspace,"src/index.ts",'export const secure=true;\n',"security-regression","security-regression");
 const content=await fs.readFile(path.join(workspace,"src","index.ts"),"utf8");
 if(!content.includes("secure=true"))throw new Error("written content mismatch");
 return "src/index.ts";
});

await expectBlocked("Unsupported executable blocked",()=>Promise.resolve(
 validateSandboxCommand("powershell",["-Command","Get-ChildItem"])
));

await expectBlocked("Shell command chaining blocked",()=>Promise.resolve(
 validateSandboxCommand("node",["test.js","&&","whoami"])
));

await expectBlocked("Shell pipe blocked",()=>Promise.resolve(
 validateSandboxCommand("node",["test.js","|","more"])
));

await expectBlocked("Parent traversal argument blocked",()=>Promise.resolve(
 validateSandboxCommand("node",["../outside.js"])
));

await expectBlocked("Long-running npm dev blocked",()=>Promise.resolve(
 validateSandboxCommand("npm",["run","dev"])
));

await test("Environment secrets stripped",async()=>{
 const previous={
  OPENAI_API_KEY:process.env.OPENAI_API_KEY,
  OLLAMA_API_KEY:process.env.OLLAMA_API_KEY,
  GITHUB_TOKEN:process.env.GITHUB_TOKEN,
  TEST_PUBLIC_VALUE:process.env.TEST_PUBLIC_VALUE
 };
 process.env.OPENAI_API_KEY="security-secret-openai";
 process.env.OLLAMA_API_KEY="security-secret-ollama";
 process.env.GITHUB_TOKEN="security-secret-github";
 process.env.TEST_PUBLIC_VALUE="visible";
 try{
  const env=sandboxEnvironment();
  if(env.OPENAI_API_KEY)throw new Error("OPENAI_API_KEY leaked");
  if(env.OLLAMA_API_KEY)throw new Error("OLLAMA_API_KEY leaked");
  if(env.GITHUB_TOKEN)throw new Error("GITHUB_TOKEN leaked");
  return "AI/GitHub secrets absent";
 }finally{
  for(const [key,value] of Object.entries(previous)){
   if(value===undefined)delete process.env[key];
   else process.env[key]=value;
  }
 }
});

await test("Valid Node sandbox execution",async()=>{
 const result=await runSandboxCommand("node",["--version"],workspace,"security-node","security-regression");
 if(result.code!==0)throw new Error(result.stderr||`exit ${result.code}`);
 if(!result.stdout.trim().startsWith("v"))throw new Error("unexpected Node output");
 return result.stdout.trim();
});

await test("Concurrent sandbox execution",async()=>{
 const executions=await Promise.all([
  runSandboxCommand("node",["--version"],workspace,"security-concurrent-1","security-regression"),
  runSandboxCommand("node",["--version"],workspace,"security-concurrent-2","security-regression"),
  runSandboxCommand("node",["--version"],workspace,"security-concurrent-3","security-regression")
 ]);
 if(executions.some(item=>item.code!==0))throw new Error("one or more concurrent commands failed");
 return `${executions.length} commands`;
});

await fs.writeFile(childScript,`
import {spawn} from "node:child_process";
const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{
 stdio:"ignore",
 windowsHide:true
});
console.log("PARENT="+process.pid);
console.log("CHILD="+child.pid);
setInterval(()=>{},1000);
`,"utf8");

await test("Active process-tree cancellation",async()=>{
 const taskId="security-cancellation";
 let output="";
 const running=runSandboxCommand(
  "node",
  ["containment-child.js"],
  workspace,
  taskId,
  "security-regression",
  {stdout:text=>output+=text}
 );
 await new Promise(resolve=>setTimeout(resolve,1500));
 const cancellation=await cancelTaskSandboxes(taskId,"cancel");
 const result=await running;
 if(cancellation.requested!==1)throw new Error(`expected 1 process, got ${cancellation.requested}`);
 if(cancellation.terminated!==1)throw new Error(`expected termination, got ${cancellation.terminated}`);
 if(result.durationMs>=15000)throw new Error(`cancellation too slow: ${result.durationMs}ms`);
 if(!output.includes("PARENT=")||!output.includes("CHILD="))throw new Error("child-process test did not start correctly");
 return `${result.durationMs}ms`;
});

await test("Sandbox process registry cleanup",async()=>{
 const status=await sandboxStatus();
 if(status.processes.length!==0)throw new Error(`${status.processes.length} process entries remain`);
 return "0 active processes";
});

await test("Sandbox execution registry cleanup",async()=>{
 const status=await sandboxStatus();
 if(status.registry.active.length!==0)throw new Error(`${status.registry.active.length} sandbox executions remain`);
 return "0 active sandboxes";
});

await test("Host security classification correct",async()=>{
 const status=await sandboxStatus();
 if(status.policy.provider!=="host")return `provider=${status.policy.provider}`;
 if(status.policy.securityLevel!=="restricted-host")throw new Error(`unexpected security level ${status.policy.securityLevel}`);
 if(status.health.isolated!==false)throw new Error("host provider incorrectly reports isolated=true");
 return "restricted-host / isolated=false";
});

await fs.rm(workspace,{recursive:true,force:true}).catch(()=>{});

const passed=results.filter(item=>item.pass).length;
const failed=results.length-passed;

console.log("--------------------------------------------------------");
console.log(`${passed} passed`);
console.log(`${failed} failed`);
console.log("");

if(failed){
 console.log("FAILED TESTS");
 for(const result of results.filter(item=>!item.pass))console.log(`- ${result.name}: ${result.detail}`);
 process.exitCode=1;
}else{
 console.log("VEYLITH v0.7 SECURITY REGRESSION PASSED");
}

