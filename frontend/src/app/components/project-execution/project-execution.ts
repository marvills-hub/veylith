import {ChangeDetectionStrategy,Component,computed,input} from '@angular/core';
import {DashboardData} from '../../core/models/dashboard.model';
import {activeAgent,projectState,roleLabel} from '../../core/services/dashboard.helpers';

@Component({
 selector:'app-project-execution',
 standalone:true,
 templateUrl:'./project-execution.html',
 styleUrl:'./project-execution.scss',
 changeDetection:ChangeDetectionStrategy.OnPush
})
export class ProjectExecutionComponent{
 data=input<DashboardData>({});
 counts=computed(()=>{
  const projects=this.data().projects||[];
  const count=(value:string)=>projects.filter(p=>projectState(p)===value).length;
  return {active:count('active'),queued:count('queued'),completed:count('completed'),failed:count('failed')};
 });
 worker=computed(()=>activeAgent(this.data()));
 role=computed(()=>roleLabel(this.worker()));
}
