import * as THREE from "three";

const AGENTS=[
 ["architect","ARC"],["planner","PLN"],["developer","DEV"],
 ["validator","VAL"],["reviewer","REV"],["diagnostic","DIA"],
 ["repair","REP"],["versioning","GIT"],["publisher","PUB"]
];

const dark=()=>new THREE.MeshStandardMaterial({color:0x090606,metalness:.96,roughness:.2});
const metal=()=>new THREE.MeshStandardMaterial({color:0x27100d,metalness:1,roughness:.16,emissive:0x210000,emissiveIntensity:.4});
const red=()=>new THREE.MeshStandardMaterial({color:0xa81510,metalness:.88,roughness:.14,emissive:0x650000,emissiveIntensity:1});
const gold=()=>new THREE.MeshStandardMaterial({color:0xa77a35,metalness:1,roughness:.16,emissive:0x4a2404,emissiveIntensity:.55});

function mesh(geometry,material,parent,position=[0,0,0],rotation=[0,0,0]){
 const object=new THREE.Mesh(geometry,material);
 object.position.set(...position);
 object.rotation.set(...rotation);
 parent.add(object);
 return object;
}

function createWeapon(){
 const root=new THREE.Group();
 const body=new THREE.Group();
 root.add(body);

 const shellMaterial=dark();
 const armorMaterial=metal();
 const redMaterial=red();
 const goldMaterial=gold();

 const spine=mesh(new THREE.CylinderGeometry(.1,.17,1.55,8),shellMaterial,body,[0,0,0]);
 mesh(new THREE.ConeGeometry(.22,.8,5),shellMaterial,body,[0,-1.02,0],[0,0,Math.PI]);
 mesh(new THREE.ConeGeometry(.15,.5,5),goldMaterial,body,[0,-1.48,0],[0,0,Math.PI]);

 const shoulderA=mesh(new THREE.BoxGeometry(.18,.85,.18),armorMaterial,body,[-.28,.13,0],[0,0,-.32]);
 const shoulderB=mesh(new THREE.BoxGeometry(.18,.85,.18),armorMaterial,body,[.28,.13,0],[0,0,.32]);

 mesh(new THREE.ConeGeometry(.16,.62,4),shellMaterial,body,[-.42,-.35,0],[0,0,-.28]);
 mesh(new THREE.ConeGeometry(.16,.62,4),shellMaterial,body,[.42,-.35,0],[0,0,.28]);

 const ring=new THREE.Mesh(new THREE.TorusGeometry(.31,.035,6,28),goldMaterial);
 ring.rotation.x=Math.PI/2;
 ring.position.y=.34;
 body.add(ring);

 const coreMaterial=new THREE.MeshStandardMaterial({
  color:0xff2518,
  metalness:.45,
  roughness:.08,
  emissive:0xff0800,
  emissiveIntensity:2.4
 });
 const core=mesh(new THREE.OctahedronGeometry(.18,0),coreMaterial,body,[0,.34,0]);

 const lensMaterial=new THREE.MeshBasicMaterial({
  color:0xff3a20,
  transparent:true,
  opacity:.22,
  blending:THREE.AdditiveBlending,
  depthWrite:false
 });
 const lens=mesh(new THREE.SphereGeometry(.31,16,12),lensMaterial,body,[0,.34,0]);

 const fins=new THREE.Group();
 body.add(fins);
 for(let i=0;i<4;i++){
  const fin=mesh(new THREE.BoxGeometry(.045,.62,.11),redMaterial,fins,[0,.88,0]);
  fin.rotation.z=(i-1.5)*.28;
  fin.position.x=(i-1.5)*.15;
 }

 const orbit=new THREE.Group();
 body.add(orbit);
 for(let i=0;i<3;i++){
  const satellite=mesh(
   new THREE.BoxGeometry(.09,.22,.09),
   i===1?goldMaterial:redMaterial,
   orbit
  );
  const angle=i/3*Math.PI*2;
  satellite.position.set(Math.cos(angle)*.48,.34,Math.sin(angle)*.48);
 }

 return{root,body,core,lens,ring,orbit,spine,shoulderA,shoulderB};
}

export function createAgentWeapons(scene){
 const group=new THREE.Group();
 group.name="AgentWeapons";
 group.position.z=-1.15;
 scene.add(group);

 const weapons=new Map();

 AGENTS.forEach(([id,label],index)=>{
  const weapon=createWeapon();
  const angle=index/AGENTS.length*Math.PI*2+Math.PI/2;
  const radius=4.08;
  const base=new THREE.Vector3(
   Math.cos(angle)*radius,
   Math.sin(angle)*radius*.71+.15,
   index%2===0?-.15:-.45
  );

  weapon.root.position.copy(base);
  weapon.root.rotation.z=angle-Math.PI/2;
  weapon.root.scale.setScalar(.78);
  weapon.root.userData={
   id,label,index,state:"waiting",base,
   baseRotation:angle-Math.PI/2,
   phase:index*.71
  };

  group.add(weapon.root);
  weapons.set(id,weapon);
 });

 function setAgents(members=[]){
  const states=new Map(members.map(member=>[member.id,member.state||"waiting"]));

  for(const [id,weapon] of weapons){
   const state=states.get(id)||"waiting";
   weapon.root.userData.state=state;

   const working=state==="working";
   const failed=state==="failed";
   const completed=state==="completed";

   weapon.core.material.color.setHex(
    failed?0xff1010:
    completed?0xffc05a:
    working?0xff311f:
    0x7e1712
   );

   weapon.core.material.emissive.setHex(
    completed?0xff8a18:0xff0800
   );

   weapon.core.material.emissiveIntensity=
    working?5.5:
    failed?4:
    completed?3.5:
    1.15;

   weapon.lens.material.opacity=
    working?.48:
    failed?.38:
    completed?.3:
    .12;
  }
 }

 function update(time,delta){
  for(const weapon of weapons.values()){
   const data=weapon.root.userData;
   const active=data.state==="working";
   const failed=data.state==="failed";
   const completed=data.state==="completed";

   const pulse=.5+.5*Math.sin(time*(active?7:2)+data.phase);
   const target=data.base.clone();

   if(active){
    target.multiplyScalar(1.11);
    target.z=.25;
   }else if(completed){
    target.multiplyScalar(1.025);
    target.z=-.2;
   }else if(failed){
    target.z=.1;
   }

   target.y+=Math.sin(time*1.25+data.phase)*.07;

   weapon.root.position.lerp(target,Math.min(1,delta*3.6));

   const scale=
    active?.93+.055*pulse:
    failed?.84+.045*pulse:
    completed?.84+.025*pulse:
    .78+.012*pulse;

   weapon.root.scale.setScalar(
    THREE.MathUtils.lerp(weapon.root.scale.x,scale,Math.min(1,delta*4))
   );

   const targetRotation=data.baseRotation+(active?Math.sin(time*1.6+data.phase)*.08:0);
   weapon.root.rotation.z=THREE.MathUtils.lerp(
    weapon.root.rotation.z,
    targetRotation,
    Math.min(1,delta*3)
   );

   weapon.body.rotation.y=Math.sin(time*.8+data.phase)*.14;
   weapon.ring.rotation.z+=delta*(active?2.6:.35);
   weapon.orbit.rotation.y+=delta*(active?4:1);
   weapon.orbit.rotation.z+=delta*(active?1.7:.3);

   if(failed){
    weapon.root.position.x+=Math.sin(time*28+data.phase)*.012;
    weapon.root.position.y+=Math.cos(time*31+data.phase)*.009;
   }
  }
 }

 return{group,weapons,setAgents,update};
}

