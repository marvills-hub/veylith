import {$} from "../core/utils.js";
const red="#e32222";
const grid="#1c1c1c";
Chart.defaults.color="#666";
Chart.defaults.borderColor=grid;
Chart.defaults.font.family="Inter,Arial,sans-serif";
function line(id){
 return new Chart($(id),{
  type:"line",
  data:{labels:[],datasets:[{data:[],borderColor:red,backgroundColor:"#e3222218",fill:true,tension:.35,pointRadius:0,borderWidth:1.5}]},
  options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false}},scales:{x:{display:false},y:{beginAtZero:true,grid:{color:grid}}}}
 });
}
const cpu=line("cpuChart");
const memory=line("memoryChart");
export function metric(metric){
 const label=new Date(metric.created_at).toLocaleTimeString();
 for(const [chart,value] of [[cpu,metric.cpu],[memory,metric.memory]]){
  chart.data.labels.push(label);
  chart.data.datasets[0].data.push(value);
  if(chart.data.labels.length>50){
   chart.data.labels.shift();
   chart.data.datasets[0].data.shift();
  }
  chart.update("none");
 }
 $("cpuText").textContent=`${metric.cpu}%`;
 $("memoryText").textContent=`${metric.memory}%`;
}
export function metrics(items){
 cpu.data.labels=[];
 cpu.data.datasets[0].data=[];
 memory.data.labels=[];
 memory.data.datasets[0].data=[];
 (items||[]).slice(-50).forEach(metric);
}
