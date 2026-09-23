import {$,escapeHtml,statusClass} from "../core/utils.js";
export function renderSystem(data){
 const ai=data.ai||{};
 const sandbox=data.sandbox||{};
 const security=data.security||{};
 const queue=data.queue||{};
 $("aiState").textContent=ai.configured?`${ai.provider||"AI"} · ${ai.model||"configured"}`:"NOT CONFIGURED";
 $("aiState").className=`health-value ${ai.configured?"good":"bad"}`;
 $("sandboxState").textContent=sandbox.mode||sandbox.provider||"UNKNOWN";
 $("sandboxState").className=`health-value ${sandbox.isolated?"good":"warn"}`;
 $("securityState").textContent=security.status||security.mode||"ACTIVE";
 $("securityState").className="health-value good";
 $("queueState").textContent=`${Number(queue.running)||0} RUNNING · ${Number(queue.queued)||0} QUEUED`;
 const circuits=data.providerCircuits||[];
 $("circuits").innerHTML=circuits.length?circuits.map(c=>`
 <div class="health-row">
  <span>${escapeHtml(c.provider)}</span>
  <span class="status ${statusClass(c.state)}">${escapeHtml(c.state)}</span>
 </div>`).join(""):`<div class="health-row"><span>Provider circuits</span><span class="status completed">HEALTHY</span></div>`;
}
