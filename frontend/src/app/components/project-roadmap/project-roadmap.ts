import {ChangeDetectionStrategy,Component,computed,input} from '@angular/core';
import {DashboardData} from '../../core/models/dashboard.model';
import {activeAgent,roleLabel} from '../../core/services/dashboard.helpers';

@Component({
 selector:'app-project-roadmap',
 standalone:true,
 templateUrl:'./project-roadmap.html',
 styleUrl:'./project-roadmap.scss',
 changeDetection:ChangeDetectionStrategy.OnPush
})
export class ProjectRoadmapComponent{
 data=input<DashboardData>({});
 stages=['ARCHITECT','PLANNER','DEVELOPMENT','VALIDATION','REVIEWER','DIAGNOSTIC','REPAIR','GIT','PUBLISHER'];
 current=computed(()=>roleLabel(activeAgent(this.data())));
 project=computed(()=>{
  const p=this.data().projects?.[0];
  return String(p?.name||p?.title||'WAITING');
 });
 active(stage:string){
  const current=this.current();
  if(stage==='DEVELOPMENT')return current==='DEVELOPER';
  if(stage==='VALIDATION')return current==='VALIDATOR';
  return current===stage;
 }
}
