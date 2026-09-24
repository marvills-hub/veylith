import fs from"node:fs";
import path from"node:path";
import type{
 ValidationCommand,
 ValidationStage,
 ValidationStrategy,
 ValidationStrategyOptions
}from"./validation-strategy.types.js";

interface PackageManifest{
 scripts?:Record<string,string>;
 dependencies?:Record<string,string>;
 devDependencies?:Record<string,string>;
}

function exists(file:string){
 try{return fs.existsSync(file);}catch{return false;}
}

function readJson<T>(file:string):T|null{
 try{
  return JSON.parse(fs.readFileSync(file,"utf8")) as T;
 }catch{
  return null;
 }
}

function commandId(stage:ValidationStage,script?:string){
 return script?`${stage}:${script}`:stage;
}

function packageManager(workspace:string){
 const candidates=[
  {name:"pnpm" as const,file:"pnpm-lock.yaml"},
  {name:"yarn" as const,file:"yarn.lock"},
  {name:"bun" as const,file:"bun.lockb"},
  {name:"bun" as const,file:"bun.lock"},
  {name:"npm" as const,file:"package-lock.json"}
 ];
 for(const candidate of candidates){
  const full=path.join(workspace,candidate.file);
  if(exists(full))return{
   name:candidate.name,
   lockfilePath:full
  };
 }
 return{name:"npm" as const,lockfilePath:null};
}

function scriptCommand(
 workspace:string,
 manager:"npm"|"pnpm"|"yarn"|"bun",
 stage:ValidationStage,
 script:string,
 required=true
):ValidationCommand{
 if(manager==="npm"){
  return{
   id:commandId(stage,script),
   stage,
   command:"npm",
   args:["run",script],
   cwd:workspace,
   script,
   required,
   source:"package-script"
  };
 }
 if(manager==="yarn"){
  return{
   id:commandId(stage,script),
   stage,
   command:"yarn",
   args:[script],
   cwd:workspace,
   script,
   required,
   source:"package-script"
  };
 }
 return{
  id:commandId(stage,script),
  stage,
  command:manager,
  args:["run",script],
  cwd:workspace,
  script,
  required,
  source:"package-script"
 };
}

function installCommand(
 workspace:string,
 manager:"npm"|"pnpm"|"yarn"|"bun",
 lockfile:boolean
):ValidationCommand{
 if(manager==="npm"){
  return{
   id:"install",
   stage:"install",
   command:"npm",
   args:[lockfile?"ci":"install"],
   cwd:workspace,
   required:true,
   source:"repository"
  };
 }
 if(manager==="pnpm"){
  return{
   id:"install",
   stage:"install",
   command:"pnpm",
   args:["install",...(lockfile?["--frozen-lockfile"]:[])],
   cwd:workspace,
   required:true,
   source:"repository"
  };
 }
 if(manager==="yarn"){
  return{
   id:"install",
   stage:"install",
   command:"yarn",
   args:["install",...(lockfile?["--frozen-lockfile"]:[])],
   cwd:workspace,
   required:true,
   source:"repository"
  };
 }
 return{
  id:"install",
  stage:"install",
  command:"bun",
  args:["install",...(lockfile?["--frozen-lockfile"]:[])],
  cwd:workspace,
  required:true,
  source:"repository"
 };
}

function hasTypeScript(
 workspace:string,
 manifest:PackageManifest
){
 if(
  exists(path.join(workspace,"tsconfig.json"))||
  exists(path.join(workspace,"tsconfig.app.json"))||
  exists(path.join(workspace,"tsconfig.build.json"))
 )return true;
 const deps={
  ...(manifest.dependencies??{}),
  ...(manifest.devDependencies??{})
 };
 return Boolean(deps.typescript);
}

function findScript(
 scripts:Record<string,string>,
 candidates:string[]
){
 for(const candidate of candidates){
  if(typeof scripts[candidate]==="string"&&scripts[candidate].trim()){
   return candidate;
  }
 }
 return null;
}

function dedupe(commands:ValidationCommand[]){
 const seen=new Set<string>();
 return commands.filter(command=>{
  const key=[
   command.stage,
   command.command,
   ...command.args
  ].join("\u0000");
  if(seen.has(key))return false;
  seen.add(key);
  return true;
 });
}

export function createValidationStrategy(
 options:ValidationStrategyOptions
):ValidationStrategy{
 const workspace=path.resolve(options.workspace);
 const manifestPath=path.join(workspace,"package.json");
 const manifest=readJson<PackageManifest>(manifestPath);

 if(!manifest){
  return{
   workspace,
   ecosystem:"unknown",
   packageManager:null,
   manifestPath:null,
   lockfilePath:null,
   typescript:false,
   commands:[],
   generatedAt:new Date().toISOString()
  };
 }

 const manager=packageManager(workspace);
 const scripts=manifest.scripts??{};
 const typescript=hasTypeScript(workspace,manifest);
 const commands:ValidationCommand[]=[];

 if(options.includeInstall!==false){
  commands.push(
   installCommand(
    workspace,
    manager.name,
    Boolean(manager.lockfilePath)
   )
  );
 }

 const build=findScript(scripts,[
  "build",
  "build:prod",
  "compile"
 ]);

 if(build){
  commands.push(
   scriptCommand(workspace,manager.name,"build",build)
  );
 }

 const typecheck=findScript(scripts,[
  "typecheck",
  "type-check",
  "check:types",
  "types"
 ]);

 if(typecheck){
  commands.push(
   scriptCommand(workspace,manager.name,"typecheck",typecheck)
  );
 }else if(typescript){
  commands.push({
   id:"typecheck:tsc",
   stage:"typecheck",
   command:"npx",
   args:["tsc","--noEmit"],
   cwd:workspace,
   required:true,
   source:"typescript"
  });
 }

 const lint=findScript(scripts,[
  "lint",
  "lint:check",
  "check:lint"
 ]);

 if(lint){
  commands.push(
   scriptCommand(workspace,manager.name,"lint",lint)
  );
 }

 const test=findScript(scripts,[
  "test",
  "test:ci",
  "test:unit"
 ]);

 if(test){
  commands.push(
   scriptCommand(workspace,manager.name,"test",test)
  );
 }

 return{
  workspace,
  ecosystem:"node",
  packageManager:manager.name,
  manifestPath,
  lockfilePath:manager.lockfilePath,
  typescript,
  commands:dedupe(commands),
  generatedAt:new Date().toISOString()
 };
}
