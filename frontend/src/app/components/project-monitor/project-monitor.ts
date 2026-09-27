import {ChangeDetectionStrategy,Component,input} from '@angular/core';
import {DecimalPipe} from '@angular/common';
import {DashboardData,VeylithProject} from '../../core/models/dashboard.model';
import {projectProgress,projectState} from '../../core/services/dashboard.helpers';

@Component({
 selector:'app-project-monitor',
 standalone:true,
 imports:[DecimalPipe],
 templateUrl:'./project-monitor.html',
 styleUrl:'./project-monitor.scss',
 changeDetection:ChangeDetectionStrategy.OnPush
})
export class ProjectMonitorComponent{
 data=input<DashboardData>({});
 progress=projectProgress;
 state=projectState;
 name(project:VeylithProject){return String(project.name||project.title||project.id||'Project')}
}

