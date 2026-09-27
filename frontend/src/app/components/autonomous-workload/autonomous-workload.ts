import {ChangeDetectionStrategy,Component,computed,input} from '@angular/core';
import {DashboardData,VeylithAgent} from '../../core/models/dashboard.model';
import {activeTeam,agentState,members} from '../../core/services/dashboard.helpers';

@Component({
 selector:'app-autonomous-workload',
 standalone:true,
 templateUrl:'./autonomous-workload.html',
 styleUrl:'./autonomous-workload.scss',
 changeDetection:ChangeDetectionStrategy.OnPush
})
export class AutonomousWorkloadComponent{
 data=input<DashboardData>({});
 agents=computed(()=>members(activeTeam(this.data())));
 state=agentState;
 name(agent:VeylithAgent){return String(agent.role||agent.name||agent.id||'AGENT').toUpperCase()}
 width(agent:VeylithAgent){
  const value=this.state(agent);
  return value==='working'?100:value==='completed'?100:value==='queued'?18:value==='failed'?100:8;
 }
}
