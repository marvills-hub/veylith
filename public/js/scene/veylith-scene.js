import * as THREE from "three";
import {loadVeylithModel} from "./veylith-model.js";
import {createClockHalo} from "./clock-halo.js";
import {createAgentWeapons} from "./agent-weapons.js";

let instance=null;

function characterState(team){
 const current=team?.current;
 const agent=current?.agent?.id;
 const state=current?.agent?.state||current?.state;
 if(state==="failed")return"error";
 if(state==="completed")return"success";
 if(agent==="architect"||agent==="planner")return"thinking";
 if(agent==="developer")return"coding";
 if(agent==="validator")return"build";
 if(agent==="reviewer"||agent==="diagnostic")return"thinking";
 if(agent==="repair"||agent==="versioning"||agent==="publisher")return"build";
 return current?.agent?"thinking":"idle";
}

export async function createVeylithScene(container){
 if(instance)return instance;

 const scene=new THREE.Scene();
 scene.fog=new THREE.FogExp2(0x080101,.032);

 const camera=new THREE.PerspectiveCamera(32,1,.1,100);
 camera.position.set(0,.15,13.6);

 const renderer=new THREE.WebGLRenderer({
  antialias:true,
  alpha:true,
  powerPreference:"high-performance"
 });

 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
 renderer.setSize(container.clientWidth,container.clientHeight,false);
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;
 renderer.toneMappingExposure=1.48;
 renderer.setClearColor(0x000000,0);
 container.appendChild(renderer.domElement);

 const ambient=new THREE.HemisphereLight(0xfff1e6,0x180303,1.55);
 scene.add(ambient);

 const faceKey=new THREE.DirectionalLight(0xffead9,3.4);
 faceKey.position.set(-2.2,4.8,7);
 faceKey.target.position.set(0,.65,0);
 scene.add(faceKey,faceKey.target);

 const frontFill=new THREE.PointLight(0xffe2cf,30,16,1.65);
 frontFill.position.set(1.7,.8,6.2);
 scene.add(frontFill);

 const coolFill=new THREE.PointLight(0xc8d9ff,18,13,1.8);
 coolFill.position.set(-4,.9,3.8);
 scene.add(coolFill);

 const redKey=new THREE.PointLight(0xff281c,30,20,2);
 redKey.position.set(-4,2.7,3);
 scene.add(redKey);

 const goldRim=new THREE.PointLight(0xffa632,30,18,2);
 goldRim.position.set(4.5,2.2,1.5);
 scene.add(goldRim);

 const lowerRed=new THREE.PointLight(0xff0800,24,14,2);
 lowerRed.position.set(0,-3.8,2.5);
 scene.add(lowerRed);

 const backLight=new THREE.PointLight(0x9c0808,24,16,2);
 backLight.position.set(0,2,-4);
 scene.add(backLight);

 const silverHairRim=new THREE.DirectionalLight(0xdce7ff,1.7);
 silverHairRim.position.set(-3,5,-1);
 silverHairRim.target.position.set(0,1,0);
 scene.add(silverHairRim,silverHairRim.target);

 const halo=createClockHalo(scene);
 const weapons=createAgentWeapons(scene);
 const character=await loadVeylithModel(scene);

 const floorGroup=new THREE.Group();

 for(let i=0;i<4;i++){
  const ring=new THREE.Mesh(
   new THREE.RingGeometry(1.6+i*.62,1.62+i*.62,96),
   new THREE.MeshBasicMaterial({
    color:i%2?0xd29b3c:0xff2519,
    transparent:true,
    opacity:i===0?.19:.08,
    side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending,
    depthWrite:false
   })
  );
  ring.rotation.x=-Math.PI/2;
  floorGroup.add(ring);
 }

 floorGroup.position.y=-3.08;
 floorGroup.position.z=.15;
 scene.add(floorGroup);

 const grid=new THREE.GridHelper(11,24,0x5b1111,0x210707);
 grid.position.y=-3.1;
 grid.material.transparent=true;
 grid.material.opacity=.14;
 scene.add(grid);

 const particleCount=220;
 const positions=new Float32Array(particleCount*3);
 const speeds=new Float32Array(particleCount);

 for(let i=0;i<particleCount;i++){
  positions[i*3]=(Math.random()-.5)*13;
  positions[i*3+1]=(Math.random()-.5)*9;
  positions[i*3+2]=(Math.random()-.5)*6;
  speeds[i]=.1+Math.random()*.25;
 }

 const particleGeometry=new THREE.BufferGeometry();
 particleGeometry.setAttribute("position",new THREE.BufferAttribute(positions,3));

 const particles=new THREE.Points(
  particleGeometry,
  new THREE.PointsMaterial({
   color:0xff3c24,
   size:.025,
   transparent:true,
   opacity:.62,
   blending:THREE.AdditiveBlending,
   depthWrite:false
  })
 );

 scene.add(particles);

 let members=[];
 let current=null;
 let running=true;
 let pointerX=0;
 let pointerY=0;
 let targetState="idle";

 const clock=new THREE.Clock();

 function pointer(event){
  const rect=container.getBoundingClientRect();
  pointerX=((event.clientX-rect.left)/rect.width-.5)*2;
  pointerY=((event.clientY-rect.top)/rect.height-.5)*2;
 }

 container.addEventListener("pointermove",pointer,{passive:true});

 function resize(){
  const width=Math.max(1,container.clientWidth);
  const height=Math.max(1,container.clientHeight);
  renderer.setSize(width,height,false);
  camera.aspect=width/height;
  camera.updateProjectionMatrix();
 }

 const observer=new ResizeObserver(resize);
 observer.observe(container);
 resize();

 function animateParticles(delta){
  const array=particleGeometry.attributes.position.array;
  for(let i=0;i<particleCount;i++){
   array[i*3+1]+=speeds[i]*delta;
   if(array[i*3+1]>4.6){
    array[i*3+1]=-4.6;
    array[i*3]=(Math.random()-.5)*13;
   }
  }
  particleGeometry.attributes.position.needsUpdate=true;
 }

 function frame(){
  if(!running)return;
  requestAnimationFrame(frame);

  if(document.hidden){
   clock.getDelta();
   return;
  }

  const delta=Math.min(clock.getDelta(),.05);
  const time=clock.elapsedTime;
  const active=members.filter(member=>member.state==="working").length;

  halo.update(delta,1+active*.28);
  weapons.update(time,delta);
  character.update?.(time,delta);

  if(character.mixer)character.mixer.update(delta);

  animateParticles(delta);
  particles.rotation.y+=delta*.004;
  floorGroup.rotation.y+=delta*.035;

  const targetX=pointerX*.22;
  const targetY=.15-pointerY*.12;

  camera.position.x=THREE.MathUtils.lerp(
   camera.position.x,
   targetX,
   Math.min(1,delta*2)
  );

  camera.position.y=THREE.MathUtils.lerp(
   camera.position.y,
   targetY,
   Math.min(1,delta*2)
  );

  camera.lookAt(0,-.1,0);
  renderer.render(scene,camera);
 }

 frame();

 instance={
  scene,
  camera,
  renderer,
  character,
  weapons,
  halo,
  setTeam(team){
   members=team?.team||[];
   current=team?.current||null;
   weapons.setAgents(members);
   targetState=characterState(team);
   character.setState?.(targetState);
   container.dataset.agent=current?.agent?.id||"idle";
   container.dataset.state=targetState;
   container.dataset.model=character.loaded?"veylith":"manifestation";
  },
  destroy(){
   running=false;
   observer.disconnect();
   container.removeEventListener("pointermove",pointer);
   character.dispose?.();
   particleGeometry.dispose();
   particles.material.dispose();
   renderer.dispose();
   container.replaceChildren();
   instance=null;
  }
 };

 return instance;
}
