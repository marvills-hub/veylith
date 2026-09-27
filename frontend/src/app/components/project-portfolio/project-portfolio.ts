import {ChangeDetectionStrategy,Component,computed,input} from '@angular/core';
import {DashboardData} from '../../core/models/dashboard.model';
import {projectState} from '../../core/services/dashboard.helpers';

@Component({
 selector:'app-project-portfolio',
 standalone:true,
 templateUrl:'./project-portfolio.html',
 styleUrl:'./project-portfolio.scss',
 changeDetection:ChangeDetectionStrategy.OnPush
})
export class ProjectPortfolioComponent{
 data=input<DashboardData>({});
 counts=computed(()=>{
  const projects=this.data().projects||[];
  const count=(s:string)=>projects.filter(p=>projectState(p)===s).length;
  return {total:projects.length,active:count('active'),queued:count('queued'),completed:count('completed'),failed:count('failed')};
 });
}
