import {ChangeDetectionStrategy,Component,computed,input} from '@angular/core';
import {DashboardData,VeylithAgent} from '../../core/models/dashboard.model';
import {activeTeam,agentState,members} from '../../core/services/dashboard.helpers';

@Component({
 selector:'app-agent-performance',
 standalone:true,
 templateUrl:'./agent-performance.html',
 styleUrl:'./agent-performance.scss',
 changeDetection:ChangeDetectionStrategy.OnPush
})
export class AgentPerformanceComponent{
 data=input<DashboardData>({});
 agents=computed(()=>{
  const found=members(activeTeam(this.data()));
  if(found.length)return found;
  return [
   {id:'architect',name:'Architect'},
   {id:'planner',name:'Development Planner'},
   {id:'developer',name:'Developer'},
   {id:'validator',name:'Validator'},
   {id:'reviewer',name:'Reviewer'},
   {id:'diagnostic',name:'Diagnostic Engineer'},
   {id:'repair',name:'Repair Engineer'},
   {id:'versioning',name:'Version Controller'},
   {id:'publisher',name:'Publisher'}
  ] as VeylithAgent[];
 });
 state=agentState;
 label(agent:VeylithAgent){
  return String(agent.name||agent.role||agent.id||'Agent');
 }
}
