import {normalizeProposedTaskGraph} from "../src/goals/goal-task-graph.service.js";
import {roleForWorkKind} from "../src/team/team-role.service.js";

const graph=normalizeProposedTaskGraph({
 items:[{
  key:"review",
  title:"Review implementation",
  description:"Review completed implementation.",
  kind:"review",
  priority:60,
  dependencies:[]
 }]
});

const work=graph.items[0];
let failed=0;

function check(name,ok,detail=""){
 if(ok)console.log(`PASS ${name}`);
 else{
  console.log(`FAIL ${name}${detail?`: ${detail}`:""}`);
  failed++;
 }
}

check("review item exists",!!work);
check("review survives normalization",work?.kind==="review",`kind=${work?.kind}`);
check("normalized review routes to reviewer",roleForWorkKind(work?.kind)==="reviewer",`role=${roleForWorkKind(work?.kind)}`);

if(!failed)console.log("REVIEW NORMALIZATION + AUTHORITY: PASS");
process.exitCode=failed?1:0;
