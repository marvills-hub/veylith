import{commandSafetyDecision}from"../src/security/command-safety.service.js";

const cases=[
 ["npm",["test"],true],
 ["npm",["run","build"],true],
 ["npm",["run","lint"],true],
 ["node",["--test"],true],
 ["node",["test/health.test.js"],true],
 ["npx",["tsc","--noEmit"],true],
 ["npm",["start"],false],
 ["npm",["run","start"],false],
 ["npm",["run","dev"],false],
 ["npm",["run","serve"],false],
 ["npm",["run","watch"],false],
 ["node",["server.js"],false],
 ["node",["src/server.ts"],false],
 ["node",["app.mjs"],false],
 ["node",["tests/test.js","--watch"],false],
 ["nodemon",["server.js"],false],
 ["ng",["serve"],false],
 ["next",["dev"],false]
 ] as const;

let failed=0;
for(const[testCommand,args,expected]of cases){
 const result=commandSafetyDecision(testCommand,[...args]);
 const pass=result.allowed===expected;
 console.log(`${pass?"PASS":"FAIL"} ${testCommand} ${args.join(" ")} => ${result.allowed?"allowed":"blocked"}`);
 if(!pass)failed++;
}
console.log(`COMMAND SAFETY: ${cases.length-failed}/${cases.length}`);
process.exitCode=failed?1:0;
