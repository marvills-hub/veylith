import fs from "node:fs";
import path from "node:path";

let passed=0;
let failed=0;

function check(name:string,value:boolean){
 if(value){
  passed++;
  console.log(`PASS ${name}`);
 }else{
  failed++;
  console.error(`FAIL ${name}`);
 }
}

const root=process.cwd();

const service=fs.readFileSync(
 path.join(root,"src/dependencies/dependency-provisioning.service.ts"),
 "utf8"
);

const pipeline=fs.readFileSync(
 path.join(root,"src/orchestration/pipeline.service.ts"),
 "utf8"
);

const host=fs.readFileSync(
 path.join(root,"src/sandbox/host-sandbox.service.ts"),
 "utf8"
);

const strategy=fs.readFileSync(
 path.join(root,"src/validation/validation-strategy.service.ts"),
 "utf8"
);

check(
 "dedicated provisioning service exists",
 fs.existsSync(
  path.join(
   root,
   "src/dependencies/dependency-provisioning.service.ts"
  )
 )
);

check(
 "provisioner reads package.json",
 service.includes('"package.json"')
);

check(
 "provisioner considers dependencies",
 service.includes("value.dependencies")
);

check(
 "provisioner considers devDependencies",
 service.includes("value.devDependencies")
);

check(
 "provisioner considers optionalDependencies",
 service.includes("value.optionalDependencies")
);

check(
 "no dependencies skip provisioning",
 service.includes("Project declares no package dependencies.")
);

check(
 "package state fingerprinted",
 service.includes('createHash("sha256")')
);

check(
 "node_modules state checked",
 service.includes('"node_modules"')
);

check(
 "durable provisioning marker used",
 service.includes('".veylith-dependencies"')
);

check(
 "lockfile compatibility is inspected",
 service.includes("lockfileCompatible")
);

check(
 "compatible lock selects npm ci",
 service.includes('compatibleLock?"ci":"install"')
);

check(
 "stale or absent lock selects npm install",
 service.includes(
  "Package lock is stale or incompatible"
 )
 &&service.includes(
  "No package lock exists"
 )
);

check(
 "provisioning uses runtime command service",
 service.includes("await runCommand(")
 &&service.includes('"npm"')
);

check(
 "provision failure returned deterministically",
 service.includes("Dependency provisioning failed.")
);

check(
 "provision success emitted",
 service.includes('"dependencies.provisioned"')
);

check(
 "provision failure emitted",
 service.includes('"dependencies.failed"')
);

check(
 "pipeline imports provisioner",
 pipeline.includes("provisionProjectDependencies")
);

check(
 "pipeline provisions before developer command loop",
 pipeline.indexOf("await provisionProjectDependencies")
 <
 pipeline.indexOf("for(const item of result.commands)")
);

check(
 "provision failure enters validation result",
 pipeline.includes('purpose:"Provision project dependencies"')
);

check(
 "provision failure stops validation",
 pipeline.includes(
  "return{success:false,results,failure:record};"
 )
);

check(
 "developer validation commands preserved",
 pipeline.includes("for(const item of result.commands)")
);

check(
 "npm allowed by host sandbox",
 host.includes('"node","npm","npx","git"')
);

check(
 "npm normalized on Windows",
 host.includes(
  'normalized==="npm"||normalized==="npx"'
 )
);

check(
 "persistent npm scripts remain blocked",
 host.includes("serverScripts")
);

check(
 "validation strategy models install command",
 strategy.includes('args:[lockfile?"ci":"install"]')
);

check(
 "provisioner never mutates pretest",
 !service.includes("pretest")
);

check(
 "provisioner does not call AI",
 !service.includes("getAIProvider")
);

check(
 "provisioner does not call GitHub",
 !service.toLowerCase().includes("github")
);

check(
 "provisioner contains no trial-specific implementation",
 !service.includes("veylith-task-api-v1-trial")
);

const failureBranch=service.indexOf(
 "if(execution.code!==0)"
);

const finalFingerprint=service.indexOf(
 "const finalFingerprint"
);

const markerWrite=service.lastIndexOf(
 "writeMarker("
);

check(
 "final fingerprint computed only after successful command",
 failureBranch>=0
 &&finalFingerprint>failureBranch
);

check(
 "marker written only after successful command",
 failureBranch>=0
 &&markerWrite>failureBranch
);

check(
 "marker uses final synchronized fingerprint",
 service.includes(
  "writeMarker("
 )
 &&service.includes(
  "finalFingerprint"
 )
);

console.log(
 `\n7.4J FINAL STATIC REGRESSION: ${passed}/${passed+failed}`
);

if(failed){
 process.exitCode=1;
}
