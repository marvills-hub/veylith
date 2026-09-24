import fs from"node:fs";

let failures=0;
function check(name:string,ok:boolean){
 console.log(`${ok?"PASS":"FAIL"} ${name}`);
 if(!ok)failures++;
}

const validation=fs.readFileSync(
 "src/validation/validation-repair.service.ts",
 "utf8"
);
const repair=fs.readFileSync(
 "src/agent/repair.service.ts",
 "utf8"
);
const scope=fs.readFileSync(
 "src/intelligence/repair-scope.service.ts",
 "utf8"
);

check(
 "validation repair does not recreate diagnostic-only file scope",
 !validation.includes("const diagnosticFiles=new Set(")
);

check(
 "validation repair does not perform duplicate focused rejection",
 !validation.includes("Focused repair attempted unrelated files")
);

check(
 "repair agent retains centralized scope enforcement",
 repair.includes("assertRepairScope(targeted.scope,result)")
);

check(
 "repair scope derives diagnosed files",
 scope.includes("const diagnosedFiles=unique(diagnostic.relevantFiles||[])")
);

check(
 "repair scope derives previous repair files",
 scope.includes("const previousFiles=unique(history.flatMap(item=>item.files||[]))")
);

check(
 "repair scope derives planned files",
 scope.includes("const plannedFiles=unique((plan.files||[]).map(file=>file.path))")
);

check(
 "repair scope combines diagnosed files into allowed files",
 scope.includes("...diagnosedFiles")
);

check(
 "repair scope combines previous files into allowed files",
 scope.includes("...previousFiles")
);

check(
 "repair scope combines planned files into allowed files",
 scope.includes("...plannedFiles")
);

check(
 "focused repair remains bounded",
 scope.includes('expansion==="focused"')
);

console.log(`REPAIR SCOPE AUTHORITY: ${10-failures}/10`);
process.exitCode=failures?1:0;
