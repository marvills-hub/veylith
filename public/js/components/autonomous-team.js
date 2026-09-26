import {$,escapeHtml,statusClass} from "../core/utils.js";
import {createVeylithScene} from "../scene/veylith-scene.js";

const agentIcon={
 architect:"ARC",
 planner:"PLN",
 developer:"DEV",
 validator:"VAL",
 reviewer:"REV",
 diagnostic:"DIA",
 repair:"REP",
 versioning:"GIT",
 publisher:"PUB"
};

let scenePromise=null;

function stateLabel(state){
 if(state==="working")return"WORKING";
 if(state==="completed")return"COMPLETE";
 if(state==="failed")return"FAILED";
 return"WAITING";
}

function teamFor(data){
 const teams=data.autonomousTeams||[];
 return teams.find(team=>["active","running"].includes(team.project?.status))||
  teams.find(team=>team.current?.agent)||
  teams[0]||
  null;
}

async function renderScene(team){
 const root=$("veylithScene");
 if(!root)return;
 try{
  scenePromise??=createVeylithScene(root);
  const scene=await scenePromise;
  scene.setTeam(team);
 }catch(error){
  console.error("Veylith 3D scene failed",error);
 }
}

export function renderAutonomousTeam(data){
 const team=teamFor(data);
 renderScene(team);

 if(!team){
  $("teamProject").textContent="NO ACTIVE PROJECT";
  $("currentAgent").innerHTML=`<div class="empty">Veylith is waiting for development work.</div>`;
  $("agentTeam").innerHTML=`<div class="empty">No autonomous agent activity yet.</div>`;
  $("pipeline").innerHTML=`<div class="empty">Pipeline waiting.</div>`;
  return;
 }

 const project=team.project||{};
 const current=team.current||{};
 const agent=current.agent;

 $("teamProject").textContent=project.name||project.id||"PROJECT";

 $("currentAgent").innerHTML=agent?`
  <div class="current-agent-card">
   <div class="agent-avatar working">${escapeHtml(agentIcon[agent.id]||"AI")}</div>
   <div class="current-agent-info">
    <span class="eyebrow">CURRENT AUTONOMOUS ACTIVITY</span>
    <strong>${escapeHtml(agent.name)}</strong>
    <p>${escapeHtml(agent.title||agent.role||current.phase||"Working")}</p>
   </div>
   <div class="current-progress">${Number(current.progress)||0}%</div>
  </div>`:`
  <div class="current-agent-card">
   <div class="agent-avatar waiting">AI</div>
   <div class="current-agent-info">
    <span class="eyebrow">CURRENT AUTONOMOUS ACTIVITY</span>
    <strong>${escapeHtml(project.status||"Waiting")}</strong>
    <p>${escapeHtml(current.phase||project.phase||"No active step")}</p>
   </div>
   <div class="current-progress">${Number(current.progress)||0}%</div>
  </div>`;

 $("agentTeam").innerHTML=(team.team||[]).map(member=>`
  <div class="agent-row ${statusClass(member.state)}">
   <div class="agent-avatar ${statusClass(member.state)}">${escapeHtml(agentIcon[member.id]||"AI")}</div>
   <div class="agent-copy">
    <strong>${escapeHtml(member.name)}</strong>
    <span>${escapeHtml(member.role)}</span>
   </div>
   <span class="agent-state ${statusClass(member.state)}">${stateLabel(member.state)}</span>
  </div>`).join("");

 $("pipeline").innerHTML=(team.pipeline||[]).map(stage=>`
  <div class="pipeline-stage ${statusClass(stage.state)}">
   <span class="pipeline-node">${stage.state==="completed"?"✓":stage.state==="working"?"●":stage.state==="failed"?"!":"○"}</span>
   <span>${escapeHtml(stage.label)}</span>
  </div>`).join("");
}
