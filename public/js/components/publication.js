import {$,escapeHtml,statusClass} from "../core/utils.js";

function currentPublication(data){
 const items=data.publications||[];
 return items.find(item=>item.publishing)||
  items.find(item=>item.stage&&item.stage!=="none"&&!item.verified)||
  items.find(item=>item.verified)||
  items[0]||
  null;
}

function stageSymbol(state){
 if(state==="completed")return"✓";
 if(state==="working")return"●";
 if(state==="failed")return"!";
 return"○";
}

function stageText(stage){
 if(stage==="repository_ready")return"REPOSITORY READY";
 return String(stage||"none").replaceAll("_"," ").toUpperCase();
}

function safeGitHubLink(url){
 if(!url)return"";
 try{
  const parsed=new URL(url,location.origin);
  if(parsed.protocol!=="https:"||parsed.hostname.toLowerCase()!=="github.com")return"";
  return parsed.href;
 }catch{
  return"";
 }
}

export function renderPublication(data){
 const publication=currentPublication(data);

 if(!publication){
  $("publicationProject").textContent="NO PUBLICATION";
  $("publicationState").innerHTML=`<div class="empty">No Git publication state yet.</div>`;
  $("publicationPipeline").innerHTML="";
  $("publicationMeta").innerHTML="";
  return;
 }

 const project=publication.project||{};
 const url=safeGitHubLink(publication.githubUrl);

 $("publicationProject").textContent=project.name||project.id||"PROJECT";

 $("publicationState").innerHTML=`
  <div class="publication-current">
   <div class="git-mark">GIT</div>
   <div class="publication-copy">
    <span class="eyebrow">PUBLICATION STATE</span>
    <strong>${escapeHtml(stageText(publication.stage))}</strong>
    <p>${publication.verified?"Remote commit verified on GitHub":publication.publishing?"Veylith is publishing this project":"Publication checkpoint persisted"}</p>
   </div>
   <span class="publication-badge ${publication.verified?"completed":publication.failed?"failed":publication.publishing?"working":"waiting"}">
    ${publication.verified?"VERIFIED":publication.failed?"FAILED":publication.publishing?"PUBLISHING":escapeHtml(stageText(publication.stage))}
   </span>
  </div>`;

 $("publicationPipeline").innerHTML=(publication.stages||[]).map(stage=>`
  <div class="git-stage ${statusClass(stage.state)}">
   <span class="git-stage-node">${stageSymbol(stage.state)}</span>
   <div>
    <strong>${escapeHtml(stage.label)}</strong>
    <span>${stage.time?escapeHtml(new Date(stage.time).toLocaleString()):"Waiting"}</span>
   </div>
  </div>`).join("");

 $("publicationMeta").innerHTML=`
  <div class="git-meta-card"><span>COMMIT</span><strong title="${escapeHtml(publication.commitSha||"")}">${escapeHtml(publication.shortSha||"—")}</strong></div>
  <div class="git-meta-card"><span>BRANCH</span><strong>${escapeHtml(publication.branch||"—")}</strong></div>
  <div class="git-meta-card"><span>OWNER</span><strong>${escapeHtml(publication.owner||"—")}</strong></div>
  <div class="git-meta-card"><span>REPOSITORY</span><strong>${escapeHtml(publication.repository||"—")}</strong></div>
  <div class="git-meta-card wide"><span>REMOTE</span><strong>${escapeHtml(publication.remoteUrl||"—")}</strong></div>
  <div class="git-meta-card wide"><span>GITHUB</span>${url?`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">OPEN REPOSITORY ↗</a>`:`<strong>NOT PUBLISHED</strong>`}</div>`;

 $("publicationError").style.display=publication.error?"block":"none";
 $("publicationError").textContent=publication.error||"";
}
