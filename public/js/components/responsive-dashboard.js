function node(selector){
 return document.querySelector(selector);
}

function create(tag,className,parent){
 const element=document.createElement(tag);
 element.className=className;
 parent.appendChild(element);
 return element;
}

function move(element,parent){
 if(element&&parent&&element.parentElement!==parent)parent.appendChild(element);
}

export function setupResponsiveDashboard(){
 if(document.querySelector(".v35-dashboard"))return;

 const stage=node(".command-stage");
 if(!stage)return;

 const dashboard=create("div","v35-dashboard",stage);
 const left=create("section","v35-column v35-left",dashboard);
 const center=create("section","v35-column v35-center",dashboard);
 const right=create("section","v35-column v35-right",dashboard);

 const leftHeader=create("div","v35-left-header",left);
 const leftContent=create("div","v35-left-content",left);

 const identity=node(".identity");
 if(identity)move(identity,leftHeader);

 const systemLive=
  document.querySelector(".system-live")||
  document.querySelector("#systemLive")||
  [...document.querySelectorAll("body *")].find(element=>
   element.children.length===0&&
   String(element.textContent||"").trim().toUpperCase()==="SYSTEM LIVE"
  );

 if(systemLive){
  systemLive.classList.add("v35-system-live");
  const identityTitle=
   identity?.querySelector("h1")||
   identity?.querySelector(".brand")||
   identity?.querySelector(".logo")||
   identity?.firstElementChild;

  if(identityTitle){
   let brandRow=identity.querySelector(".v42-brand-row");
   if(!brandRow){
    brandRow=document.createElement("div");
    brandRow.className="v42-brand-row";
    identity.insertBefore(brandRow,identityTitle);
    brandRow.appendChild(identityTitle);
   }
   move(systemLive,brandRow);
  }else{
   move(systemLive,leftHeader);
  }
 }

 const terminal=node(".main-terminal");
 const agents=node(".agent-performance")||node(".workforce-panel");
 const projects=node(".all-project-monitor");
 const execution=node(".project-execution-overview");

 move(terminal,leftContent);
 move(agents,leftContent);
 move(projects,leftContent);
 move(execution,leftContent);

 const sceneWrap=create("div","v35-scene-wrap",center);
 const scene=node(".veylith-center");
 move(scene,sceneWrap);

 const development=node(".activity-terminal");
 move(development,center);

 const intelligence=node(".project-intelligence");
 const roadmap=node(".project-roadmap");
 move(intelligence,right);
 move(roadmap,right);

 document.body.classList.add("v35-responsive");

 const relayout=()=>{
  document.documentElement.style.setProperty(
   "--v35-vh",
   `${window.innerHeight}px`
  );
 };

 relayout();
 window.addEventListener("resize",relayout,{passive:true});
}


