import {ChangeDetectionStrategy,Component,OnDestroy,OnInit} from '@angular/core';
import {DashboardService} from './core/services/dashboard.service';
import {HeaderComponent} from './components/header/header';
import {RuntimeTerminalComponent} from './components/runtime-terminal/runtime-terminal';
import {AgentPerformanceComponent} from './components/agent-performance/agent-performance';
import {ProjectMonitorComponent} from './components/project-monitor/project-monitor';
import {ProjectExecutionComponent} from './components/project-execution/project-execution';
import {VeylithStageComponent} from './components/veylith-stage/veylith-stage';
import {DevelopmentTerminalComponent} from './components/development-terminal/development-terminal';
import {ProjectPortfolioComponent} from './components/project-portfolio/project-portfolio';
import {ProjectVelocityComponent} from './components/project-velocity/project-velocity';
import {AutonomousWorkloadComponent} from './components/autonomous-workload/autonomous-workload';
import {DeliveryForecastComponent} from './components/delivery-forecast/delivery-forecast';
import {ProjectRoadmapComponent} from './components/project-roadmap/project-roadmap';
import {SystemMonitorComponent} from './components/system-monitor/system-monitor';

@Component({
 selector:'app-root',
 standalone:true,
 imports:[
  HeaderComponent,
  RuntimeTerminalComponent,
  AgentPerformanceComponent,
  ProjectMonitorComponent,
  ProjectExecutionComponent,
  VeylithStageComponent,
  DevelopmentTerminalComponent,
  ProjectPortfolioComponent,
  ProjectVelocityComponent,
  AutonomousWorkloadComponent,
  DeliveryForecastComponent,
  ProjectRoadmapComponent,
  SystemMonitorComponent
 ],
 templateUrl:'./app.html',
 styleUrl:'./app.scss',
 changeDetection:ChangeDetectionStrategy.OnPush
})
export class App implements OnInit,OnDestroy{
 constructor(readonly dashboard:DashboardService){}
 ngOnInit(){void this.dashboard.start()}
 ngOnDestroy(){this.dashboard.destroy()}
}


