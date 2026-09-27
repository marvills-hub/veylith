import {DecimalPipe} from '@angular/common';
import {ChangeDetectionStrategy,Component,computed,input} from '@angular/core';
import {DashboardData} from '../../core/models/dashboard.model';
import {projectProgress,projectState} from '../../core/services/dashboard.helpers';

@Component({
 selector:'app-delivery-forecast',
 standalone:true,
 imports:[DecimalPipe],
 templateUrl:'./delivery-forecast.html',
 styleUrl:'./delivery-forecast.scss',
 changeDetection:ChangeDetectionStrategy.OnPush
})
export class DeliveryForecastComponent{
 data=input<DashboardData>({});
 project=computed(()=>{
  const projects=this.data().projects||[];
  return projects.find(p=>['active','queued'].includes(projectState(p)))||projects[0]||null;
 });
 progress=computed(()=>projectProgress(this.project()));
 name=computed(()=>String(this.project()?.name||this.project()?.title||'Waiting for project'));
}

