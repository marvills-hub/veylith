import fs from "node:fs";

const source=fs.readFileSync(
 "src/team/goal-role-executor.service.ts",
 "utf8"
);

let passed=0;
let failed=0;

function check(name,condition){
 if(condition){
  passed++;
  console.log(`PASS ${name}`);
 }else{
  failed++;
  console.log(`FAIL ${name}`);
 }
}

check(
 "strict development result validates file content",
 source.includes('typeof file.path==="string"&&typeof file.content==="string"')
);

check(
 "persisted development metadata has separate reader",
 source.includes("function developmentMetadataFrom(")
);

check(
 "reviewer reads direct development separately",
 source.includes("const directDevelopment=developmentFrom(dependencies);")
);

check(
 "reviewer reads persisted metadata separately",
 source.includes("const developmentMetadata=developmentMetadataFrom(dependencies);")
);

check(
 "path-only evidence rehydrates from workspace",
 source.includes("hydrateDevelopmentFromWorkspace(developmentMetadata,projectRow.workspace)")
);

check(
 "workspace hydration reads actual file content",
 source.includes('content:fs.readFileSync(absolute,"utf8")')
);

check(
 "workspace hydration rejects missing evidence files",
 source.includes("Development evidence file is missing from workspace")
);

check(
 "workspace hydration rejects path escape",
 source.includes("Development evidence escapes workspace")
);

check(
 "review still requires development evidence",
 source.includes('if(!development)throw new Error("Reviewer requires a development result.");')
);

check(
 "review still requires validation evidence",
 source.includes('if(!validation)throw new Error("Reviewer requires validation evidence.");')
);

console.log(`REVIEW DEVELOPMENT EVIDENCE: ${passed}/${passed+failed}`);

if(failed)process.exitCode=1;
