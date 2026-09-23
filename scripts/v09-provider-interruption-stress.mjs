import {db} from "../dist/database/database.js";
import {AIProviderError} from "../dist/core/ai-error.service.js";
import {classifyJobFailure} from "../dist/jobs/job-failure-classifier.service.js";
import * as circuit from "../dist/core/provider-circuit.service.js";

const provider=`b6p4-${Date.now()}-${Math.random().toString(16).slice(2)}`;
let passed=0,failed=0;

function check(name,value,detail=""){
 if(value){
  passed++;
  console.log(`PASS ${String(passed+failed).padStart(2,"0")} ${name}`);
 }else{
  failed++;
  console.log(`FAIL ${String(passed+failed).padStart(2,"0")} ${name}${detail?` — ${detail}`:""}`);
 }
}

function state(){
 return circuit.providerCircuits().find(item=>item.provider===provider)||null;
}

function cleanup(){
 try{db.prepare("DELETE FROM provider_circuits WHERE provider=?").run(provider)}catch{}
}

console.log("\n============================================================");
console.log(" VEYLITH v0.9 BATCH 6 PASS 4");
console.log(" PROVIDER FAILURE + CIRCUIT BREAKER STRESS");
console.log("============================================================");
console.log(`Provider fixture: ${provider}`);
console.log("Network/API calls: NONE\n");

cleanup();

try{
 check(
  "Circuit module exposes providerCircuits",
  typeof circuit.providerCircuits==="function"
 );

 check(
  "Circuit module exposes recordProviderFailure",
  typeof circuit.recordProviderFailure==="function"
 );

 check(
  "Circuit module exposes recordProviderSuccess",
  typeof circuit.recordProviderSuccess==="function"
 );

 const retryStatuses=[408,429,500,502,503,504];

 for(const status of retryStatuses){
  const error=new AIProviderError(`Synthetic provider interruption ${status}`,{
   provider,
   status,
   retryable:true
  });

  const result=classifyJobFailure(error);

  check(
   `${status} retryable provider interruption classified correctly`,
   result.kind==="provider_retryable"
  );

  check(
   `${status} interruption preserves execution attempt`,
   result.consumeAttempt===false
  );

  check(
   `${status} interruption remains resumable`,
   result.pause===true&&result.terminal===false
  );
 }

 const permanentCases=[
  {status:400,code:"invalid_request"},
  {status:401,code:"invalid_api_key"},
  {status:403,code:"forbidden"}
 ];

 for(const item of permanentCases){
  const error=new AIProviderError(`Synthetic permanent ${item.status}`,{
   provider,
   status:item.status,
   code:item.code,
   retryable:false
  });

  const result=classifyJobFailure(error);

  check(
   `${item.status} permanent provider failure classified correctly`,
   result.kind==="provider_permanent"
  );

  check(
   `${item.status} permanent failure preserves execution attempt`,
   result.consumeAttempt===false
  );

  check(
   `${item.status} permanent failure is terminal`,
   result.terminal===true
  );
 }

 console.log("\n--- CIRCUIT OPEN STRESS ---");

 const outage=new Error("Batch 6 synthetic provider outage");
 let openAt=null;

 for(let i=1;i<=20;i++){
  circuit.recordProviderFailure(provider,outage);
  const current=state();

  check(
   `Failure ${i} persisted circuit state`,
   current!==null
  );

  if(current?.state==="open"){
   openAt=i;
   console.log(`INFO Circuit opened after failure ${i}`);
   break;
  }
 }

 const opened=state();

 check(
  "Repeated failures open provider circuit",
  opened?.state==="open",
  `state=${opened?.state}`
 );

 check(
  "Circuit opened within bounded failure count",
  openAt!==null&&openAt<=20,
  `openAt=${openAt}`
 );

 check(
  "Open circuit records failure count",
  Number(opened?.consecutiveFailures||0)>=1
 );

 check(
  "Open circuit records last failure",
  Boolean(opened?.lastFailureAt)
 );

 check(
  "Open circuit records provider error",
  String(opened?.lastError||"").includes("Batch 6 synthetic provider outage")
 );

 check(
  "Open circuit records cooldown",
  Number(opened?.cooldownMs||0)>0
 );

 check(
  "Open circuit records retry time",
  Boolean(opened?.retryAt)
 );

 const retryAtBefore=opened?.retryAt;
 const cooldownBefore=Number(opened?.cooldownMs||0);

 console.log("\n--- PERSISTENCE CHECK ---");

 const persisted=db.prepare(
  "SELECT * FROM provider_circuits WHERE provider=?"
 ).get(provider);

 check(
  "Circuit state persisted in SQLite",
  Boolean(persisted)
 );

 check(
  "SQLite persisted open state",
  persisted?.state==="open"
 );

 check(
  "SQLite persisted failure count",
  Number(persisted?.consecutive_failures??persisted?.consecutiveFailures??0)>=1
 );

 console.log("\n--- HALF-OPEN / RECOVERY STRESS ---");

 if(retryAtBefore){
  db.prepare(`
   UPDATE provider_circuits
   SET retry_at=?
   WHERE provider=?
  `).run(Date.now()-1000,provider);
 }

 let allowedResult=null;

 if(typeof circuit.providerRequestAllowed==="function"){
  allowedResult=circuit.providerRequestAllowed(provider);
  check(
   "Expired cooldown allows recovery probe",
   allowedResult===true
  );
 }else if(typeof circuit.canUseProvider==="function"){
  allowedResult=circuit.canUseProvider(provider);
  check(
   "Expired cooldown allows recovery probe",
   allowedResult===true
  );
 }else if(typeof circuit.providerAvailable==="function"){
  allowedResult=circuit.providerAvailable(provider);
  check(
   "Expired cooldown allows recovery probe",
   allowedResult===true
  );
 }else if(typeof circuit.assertProviderAvailable==="function"){
  try{
   circuit.assertProviderAvailable(provider);
   allowedResult=true;
  }catch{
   allowedResult=false;
  }
  check(
   "Expired cooldown allows recovery probe",
   allowedResult===true
  );
 }else{
  const current=state();
  check(
   "Circuit exposes recovery availability API",
   false,
   `exports=${Object.keys(circuit).join(",")}`
  );
 }

 const halfOpen=state();

 check(
  "Recovery probe transitions circuit to half-open",
  halfOpen?.state==="half_open",
  `state=${halfOpen?.state}`
 );

 circuit.recordProviderFailure(
  provider,
  new Error("Synthetic recovery probe failure")
 );

 const reopened=state();

 check(
  "Failed half-open probe reopens circuit",
  reopened?.state==="open",
  `state=${reopened?.state}`
 );

 check(
  "Failed recovery probe increases or preserves cooldown",
  Number(reopened?.cooldownMs||0)>=cooldownBefore,
  `before=${cooldownBefore} after=${reopened?.cooldownMs}`
 );

 check(
  "Reopened circuit receives new retry time",
  Boolean(reopened?.retryAt)
 );

 if(reopened?.retryAt){
  db.prepare(`
   UPDATE provider_circuits
   SET retry_at=?
   WHERE provider=?
  `).run(Date.now()-1000,provider);
 }

 if(typeof circuit.providerRequestAllowed==="function"){
  circuit.providerRequestAllowed(provider);
 }else if(typeof circuit.canUseProvider==="function"){
  circuit.canUseProvider(provider);
 }else if(typeof circuit.providerAvailable==="function"){
  circuit.providerAvailable(provider);
 }else if(typeof circuit.assertProviderAvailable==="function"){
  try{circuit.assertProviderAvailable(provider)}catch{}
 }

 check(
  "Second recovery window enters half-open",
  state()?.state==="half_open",
  `state=${state()?.state}`
 );

 for(let i=1;i<=20&&state()?.state!=="closed";i++){
  circuit.recordProviderSuccess(provider);
 }

 const recovered=state();

 check(
  "Successful recovery probe closes circuit",
  recovered?.state==="closed",
  `state=${recovered?.state}`
 );

 check(
  "Closed circuit clears consecutive failures",
  Number(recovered?.consecutiveFailures||0)===0
 );

 check(
  "Closed circuit clears retry time",
  recovered?.retryAt==null
 );

 check(
  "Closed circuit clears last error",
  recovered?.lastError==null
 );

 console.log("\n--- REPEATED INTERRUPTION CYCLES ---");

 for(let cycle=1;cycle<=5;cycle++){
  circuit.recordProviderFailure(
   provider,
   new Error(`Interruption cycle ${cycle}`)
  );

  let current=state();

  for(let i=0;i<20&&current?.state!=="open";i++){
   circuit.recordProviderFailure(
    provider,
    new Error(`Interruption cycle ${cycle}`)
   );
   current=state();
  }

  check(
   `Interruption cycle ${cycle} opens circuit`,
   current?.state==="open"
  );

  if(current?.retryAt){
   db.prepare(`
    UPDATE provider_circuits
    SET retry_at=?
    WHERE provider=?
   `).run(Date.now()-1,provider);
  }

  if(typeof circuit.providerRequestAllowed==="function"){
   circuit.providerRequestAllowed(provider);
  }else if(typeof circuit.canUseProvider==="function"){
   circuit.canUseProvider(provider);
  }else if(typeof circuit.providerAvailable==="function"){
   circuit.providerAvailable(provider);
  }else if(typeof circuit.assertProviderAvailable==="function"){
   try{circuit.assertProviderAvailable(provider)}catch{}
  }

  check(
   `Interruption cycle ${cycle} enters half-open`,
   state()?.state==="half_open"
  );

  for(let i=0;i<20&&state()?.state!=="closed";i++){
   circuit.recordProviderSuccess(provider);
  }

  check(
   `Interruption cycle ${cycle} recovers to closed`,
   state()?.state==="closed"
  );
 }

 console.log("\n--- DATABASE INTEGRITY ---");

 const duplicates=db.prepare(`
  SELECT provider,COUNT(*) count
  FROM provider_circuits
  WHERE provider=?
  GROUP BY provider
  HAVING COUNT(*)>1
 `).all(provider);

 check(
  "Provider circuit has no duplicate persistence rows",
  duplicates.length===0
 );

 const beforeCleanup=Number(
  db.prepare(
   "SELECT COUNT(*) count FROM provider_circuits WHERE provider=?"
  ).get(provider)?.count||0
 );

 check(
  "Exactly one circuit record exists before cleanup",
  beforeCleanup===1,
  `rows=${beforeCleanup}`
 );

 cleanup();

 const afterCleanup=Number(
  db.prepare(
   "SELECT COUNT(*) count FROM provider_circuits WHERE provider=?"
  ).get(provider)?.count||0
 );

 check(
  "Synthetic provider circuit cleaned",
  afterCleanup===0
 );

}catch(error){
 console.error(`\nPASS 4 ERROR: ${error.stack||error.message}`);
 failed++;
 try{cleanup()}catch{}
}

console.log("\n============================================================");
console.log(" BATCH 6 PASS 4 RESULT");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed){
 console.log("\nPROVIDER FAILURE / CIRCUIT STRESS FAILED.");
 process.exitCode=1;
}else{
 console.log("\nPROVIDER FAILURE / CIRCUIT STRESS PASSED.");
 console.log("Retryable classification:       PASS");
 console.log("Permanent classification:       PASS");
 console.log("Execution-budget preservation:  PASS");
 console.log("Circuit opening:                PASS");
 console.log("Circuit persistence:            PASS");
 console.log("Half-open recovery:             PASS");
 console.log("Failed-probe reopening:         PASS");
 console.log("Cooldown escalation:            PASS");
 console.log("Successful recovery:            PASS");
 console.log("5 interruption cycles:          PASS");
 console.log("Database integrity:             PASS");
 console.log("External AI/API usage:          NONE");
}


