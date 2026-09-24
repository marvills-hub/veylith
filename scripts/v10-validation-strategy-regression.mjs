import fs from"node:fs";
import os from"node:os";
import path from"node:path";
import{
 createValidationStrategy
}from"../dist/validation/validation-strategy.service.js";

let passed=0;
let failed=0;

function check(name,condition,detail=""){
 if(condition){
  passed++;
  console.log(`PASS ${name}`);
 }else{
  failed++;
  console.log(`FAIL ${name}`);
  if(detail)console.log(detail);
 }
}

function writeJson(file,value){
 fs.writeFileSync(file,JSON.stringify(value,null,2));
}

const root=fs.mkdtempSync(
 path.join(os.tmpdir(),"veylith-v10-validation-")
);

try{
 const npmWorkspace=path.join(root,"npm-project");
 fs.mkdirSync(npmWorkspace,{recursive:true});

 writeJson(path.join(npmWorkspace,"package.json"),{
  name:"validation-npm-project",
  scripts:{
   build:"tsc",
   lint:"eslint .",
   test:"jest"
  },
  devDependencies:{
   typescript:"^5.0.0"
  }
 });

 writeJson(path.join(npmWorkspace,"package-lock.json"),{
  name:"validation-npm-project",
  lockfileVersion:3,
  packages:{}
 });

 writeJson(path.join(npmWorkspace,"tsconfig.json"),{
  compilerOptions:{
   target:"ES2022"
  }
 });

 const npmStrategy=createValidationStrategy({
  workspace:npmWorkspace
 });

 check(
  "Node ecosystem detected",
  npmStrategy.ecosystem==="node"
 );

 check(
  "npm package manager detected",
  npmStrategy.packageManager==="npm"
 );

 check(
  "package manifest persisted in strategy",
  npmStrategy.manifestPath===path.join(npmWorkspace,"package.json")
 );

 check(
  "npm lockfile detected",
  npmStrategy.lockfilePath===path.join(npmWorkspace,"package-lock.json")
 );

 check(
  "TypeScript repository detected",
  npmStrategy.typescript===true
 );

 const install=npmStrategy.commands.find(
  command=>command.stage==="install"
 );

 check(
  "install validation generated",
  Boolean(install)
 );

 check(
  "npm lockfile chooses npm ci",
  install?.command==="npm"&&
  install?.args.join(" ")==="ci"
 );

 const build=npmStrategy.commands.find(
  command=>command.stage==="build"
 );

 check(
  "build script detected",
  build?.script==="build"
 );

 check(
  "build uses package script",
  build?.source==="package-script"
 );

 const typecheck=npmStrategy.commands.find(
  command=>command.stage==="typecheck"
 );

 check(
  "TypeScript fallback typecheck generated",
  typecheck?.command==="npx"&&
  typecheck?.args.join(" ")==="tsc --noEmit"
 );

 check(
  "TypeScript fallback identified as deterministic source",
  typecheck?.source==="typescript"
 );

 const lint=npmStrategy.commands.find(
  command=>command.stage==="lint"
 );

 check(
  "lint script detected",
  lint?.script==="lint"
 );

 const test=npmStrategy.commands.find(
  command=>command.stage==="test"
 );

 check(
  "test script detected",
  test?.script==="test"
 );

 check(
  "all npm validation commands use workspace cwd",
  npmStrategy.commands.every(
   command=>command.cwd===npmWorkspace
  )
 );

 check(
  "validation command ids unique",
  new Set(npmStrategy.commands.map(command=>command.id)).size===
  npmStrategy.commands.length
 );

 const explicitWorkspace=path.join(root,"explicit-typecheck");
 fs.mkdirSync(explicitWorkspace,{recursive:true});

 writeJson(path.join(explicitWorkspace,"package.json"),{
  name:"explicit-typecheck",
  scripts:{
   typecheck:"tsc --noEmit",
   "test:ci":"node --test"
  },
  devDependencies:{
   typescript:"^5.0.0"
  }
 });

 const explicit=createValidationStrategy({
  workspace:explicitWorkspace,
  includeInstall:false
 });

 check(
  "install can be excluded",
  !explicit.commands.some(command=>command.stage==="install")
 );

 const explicitTypecheck=explicit.commands.filter(
  command=>command.stage==="typecheck"
 );

 check(
  "explicit typecheck preferred over fallback",
  explicitTypecheck.length===1&&
  explicitTypecheck[0].script==="typecheck"
 );

 check(
  "test ci fallback detected",
  explicit.commands.some(
   command=>
    command.stage==="test"&&
    command.script==="test:ci"
  )
 );

 const pnpmWorkspace=path.join(root,"pnpm-project");
 fs.mkdirSync(pnpmWorkspace,{recursive:true});

 writeJson(path.join(pnpmWorkspace,"package.json"),{
  name:"pnpm-project",
  scripts:{
   build:"vite build"
  }
 });

 fs.writeFileSync(
  path.join(pnpmWorkspace,"pnpm-lock.yaml"),
  "lockfileVersion: '9.0'\n"
 );

 const pnpm=createValidationStrategy({
  workspace:pnpmWorkspace
 });

 check(
  "pnpm lockfile selects pnpm",
  pnpm.packageManager==="pnpm"
 );

 const pnpmInstall=pnpm.commands.find(
  command=>command.stage==="install"
 );

 check(
  "pnpm install freezes lockfile",
  pnpmInstall?.command==="pnpm"&&
  pnpmInstall?.args.includes("--frozen-lockfile")
 );

 check(
  "JavaScript project does not invent TypeScript validation",
  !pnpm.commands.some(
   command=>command.stage==="typecheck"
  )
 );

 const unknownWorkspace=path.join(root,"unknown-project");
 fs.mkdirSync(unknownWorkspace,{recursive:true});

 const unknown=createValidationStrategy({
  workspace:unknownWorkspace
 });

 check(
  "repository without package manifest remains unknown",
  unknown.ecosystem==="unknown"
 );

 check(
  "unknown repository has no package manager",
  unknown.packageManager===null
 );

 check(
  "unknown repository invents no validation commands",
  unknown.commands.length===0
 );

 const invalidWorkspace=path.join(root,"invalid-package");
 fs.mkdirSync(invalidWorkspace,{recursive:true});
 fs.writeFileSync(
  path.join(invalidWorkspace,"package.json"),
  "{not-valid-json"
 );

 const invalid=createValidationStrategy({
  workspace:invalidWorkspace
 });

 check(
  "invalid package manifest fails closed",
  invalid.ecosystem==="unknown"&&
  invalid.commands.length===0
 );

 const yarnWorkspace=path.join(root,"yarn-project");
 fs.mkdirSync(yarnWorkspace,{recursive:true});

 writeJson(path.join(yarnWorkspace,"package.json"),{
  name:"yarn-project",
  scripts:{
   lint:"eslint ."
  }
 });

 fs.writeFileSync(
  path.join(yarnWorkspace,"yarn.lock"),
  "# yarn lockfile\n"
 );

 const yarn=createValidationStrategy({
  workspace:yarnWorkspace
 });

 check(
  "yarn lockfile selects yarn",
  yarn.packageManager==="yarn"
 );

 check(
  "yarn package script command generated correctly",
  yarn.commands.some(
   command=>
    command.stage==="lint"&&
    command.command==="yarn"&&
    command.args.length===1&&
    command.args[0]==="lint"
  )
 );

 const bunWorkspace=path.join(root,"bun-project");
 fs.mkdirSync(bunWorkspace,{recursive:true});

 writeJson(path.join(bunWorkspace,"package.json"),{
  name:"bun-project",
  scripts:{
   test:"bun test"
  }
 });

 fs.writeFileSync(
  path.join(bunWorkspace,"bun.lock"),
  ""
 );

 const bun=createValidationStrategy({
  workspace:bunWorkspace
 });

 check(
  "bun lockfile selects bun",
  bun.packageManager==="bun"
 );

 check(
  "bun package script command generated correctly",
  bun.commands.some(
   command=>
    command.stage==="test"&&
    command.command==="bun"&&
    command.args.join(" ")==="run test"
  )
 );

 check(
  "strategy records generation timestamp",
  Boolean(npmStrategy.generatedAt)
 );
}finally{
 fs.rmSync(root,{recursive:true,force:true});
}

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 4 PASS 4.1");
console.log(" VALIDATION STRATEGY ENGINE");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("\nVEYLITH v1.0 BATCH 4 PASS 4.1 PASSED");
}else{
 console.log("\nVEYLITH v1.0 BATCH 4 PASS 4.1 NOT YET CLOSED");
 process.exitCode=1;
}
