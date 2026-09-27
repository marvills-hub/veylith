import {$,escapeHtml,statusClass} from "../core/utils.js";
import {api} from "../api/client.js";

let loaded=false;
let loading=false;

function levelCount(stats,level){
 if(!stats)return 0;
 if(typeof stats[level]==="number")return stats[level];
 if(stats.levels&&typeof stats.levels[level]==="number")return stats.levels[level];
 if(Array.isArray(stats.byLevel)){
  const row=stats.byLevel.find(item=>String(item.level).toLowerCase()===level);
  return Number(row?.count)||0;
 }
 return 0;
}

function renderLogs(logs){
 $("opsLogs").innerHTML=logs.length?logs.map(log=>`
  <div class="ops-log ${statusClass(log.level)}">
   <span>${escapeHtml(log.createdAt||log.created_at||"")}</span>
   <b>${escapeHtml(log.level||"info")}</b>
   <span>${escapeHtml(log.component||"system")}</span>
   <p>${escapeHtml(log.message||"")}</p>
  </div>`).join(""):`<div class="empty">No matching logs.</div>`;
}

function renderSecurityEvents(events){
 $("securityEvents").innerHTML=events.length?events.map(item=>`
  <div class="security-event">
   <div>
    <strong>${escapeHtml(item.type||item.action||"security")}</strong>
    <span>${escapeHtml(item.created_at||item.createdAt||item.time||"")}</span>
   </div>
   <p>${escapeHtml(item.message||item.reason||item.path||JSON.stringify(item.data||{}))}</p>
  </div>`).join(""):`<div class="empty">No recent security events.</div>`;
}

function providerRows(ai){
 const providers=ai?.providers||[];
 if(Array.isArray(providers)){
  return providers.map(provider=>{
   if(typeof provider==="string")return{name:provider,status:"available"};
   return{
    name:provider.name||provider.provider||provider.id||"provider",
    status:provider.status||provider.state||(provider.configured?"configured":"available"),
    model:provider.model||""
   };
  });
 }
 return Object.entries(providers).map(([name,value])=>({
  name,
  status:value?.status||value?.state||(value?.configured?"configured":"available"),
  model:value?.model||""
 }));
}

export async function loadOperations(force=false){
 if(loading)return;
 if(loaded&&!force)return;

 loading=true;
 $("opsRefresh").disabled=true;
 $("opsRefresh").textContent="REFRESHING...";

 try{
  const [logsResult,statsResult,security,sandbox,securityResult,ai]=await Promise.all([
   api.logs("limit=150"),
   api.logStats(),
   api.security(),
   api.sandbox(),
   api.securityEvents(75),
   api.ai()
  ]);

  const stats=statsResult?.stats||statsResult||{};
  const logs=logsResult?.logs||[];
  const events=securityResult?.events||[];

  $("logTotal").textContent=String(stats.total??logs.length);
  $("logErrors").textContent=String(levelCount(stats,"error")+levelCount(stats,"fatal"));
  $("logWarnings").textContent=String(levelCount(stats,"warn"));

  $("securityMode").textContent=security?.status||security?.mode||"ACTIVE";
  $("securityMode").className="ops-value good";

  $("sandboxMode").textContent=sandbox?.mode||sandbox?.provider||"UNKNOWN";
  $("sandboxMode").className=`ops-value ${sandbox?.isolated?"good":"warn"}`;

  $("isolationMode").textContent=sandbox?.isolated?"ISOLATED":"RESTRICTED HOST";
  $("isolationMode").className=`ops-value ${sandbox?.isolated?"good":"warn"}`;

  const active=ai?.active||{};
  $("activeProvider").textContent=active.provider||active.name||"UNAVAILABLE";
  $("activeProvider").className=`ops-value ${active.ok===false?"bad":"good"}`;
  $("activeModel").textContent=active.model||"—";

  const providers=providerRows(ai);
  $("providerList").innerHTML=providers.length?providers.map(provider=>`
   <div class="provider-row">
    <div>
     <strong>${escapeHtml(provider.name)}</strong>
     <span>${escapeHtml(provider.model||"")}</span>
    </div>
    <span class="status ${statusClass(provider.status)}">${escapeHtml(provider.status)}</span>
   </div>`).join(""):`<div class="empty">No provider information.</div>`;

  renderLogs(logs);
  renderSecurityEvents(events);
  loaded=true;
 }catch(error){
  $("opsLogs").innerHTML=`<div class="operation-error">${escapeHtml(error.message)}</div>`;
 }finally{
  loading=false;
  $("opsRefresh").disabled=false;
  $("opsRefresh").textContent="REFRESH";
 }
}

export function setupOperations(){
 $("opsRefresh").onclick=()=>loadOperations(true);

 $("logLevel").onchange=async()=>{
  const level=$("logLevel").value;
  try{
   const result=await api.logs(`limit=150${level?`&level=${encodeURIComponent(level)}`:""}`);
   renderLogs(result.logs||[]);
  }catch(error){
   $("opsLogs").innerHTML=`<div class="operation-error">${escapeHtml(error.message)}</div>`;
  }
 };
}
