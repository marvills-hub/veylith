import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {DRACOLoader} from "three/addons/loaders/DRACOLoader.js";

const MODEL_URL="/assets/models/veylith.glb?v=4";

function findClip(animations,names){
 for(const name of names){
  const clip=animations.find(item=>item.name.toLowerCase().includes(name));
  if(clip)return clip;
 }
 return null;
}

function createManifestation(){
 const root=new THREE.Group();
 root.name="VeylithManifestation";

 const red=new THREE.MeshBasicMaterial({
  color:0xff2418,
  transparent:true,
  opacity:.5,
  blending:THREE.AdditiveBlending,
  depthWrite:false
 });

 const gold=new THREE.MeshBasicMaterial({
  color:0xffba55,
  transparent:true,
  opacity:.58,
  blending:THREE.AdditiveBlending,
  depthWrite:false
 });

 const dark=new THREE.MeshStandardMaterial({
  color:0x090404,
  metalness:.96,
  roughness:.18,
  emissive:0x310000,
  emissiveIntensity:.6
 });

 const base=new THREE.Mesh(
  new THREE.CylinderGeometry(1.65,1.95,.16,48),
  dark
 );
 base.position.y=-3.08;
 root.add(base);

 const rings=[];

 for(let i=0;i<4;i++){
  const ring=new THREE.Mesh(
   new THREE.TorusGeometry(.85+i*.32,.015,6,72),
   i%2?gold:red
  );

  ring.rotation.x=Math.PI/2;
  ring.position.y=-2.94+i*.035;
  root.add(ring);
  rings.push(ring);
 }

 const coreMaterial=new THREE.MeshStandardMaterial({
  color:0xff2a18,
  metalness:.35,
  roughness:.08,
  emissive:0xff0900,
  emissiveIntensity:4
 });

 const core=new THREE.Mesh(
  new THREE.IcosahedronGeometry(.22,1),
  coreMaterial
 );

 core.position.y=-1.45;
 root.add(core);

 const verticalRing=new THREE.Mesh(
  new THREE.TorusGeometry(.72,.012,6,64),
  gold
 );

 verticalRing.position.y=-1.45;
 verticalRing.rotation.y=Math.PI/2;
 root.add(verticalRing);

 const horizontalRing=new THREE.Mesh(
  new THREE.TorusGeometry(.95,.012,6,64),
  red
 );

 horizontalRing.position.y=-1.45;
 horizontalRing.rotation.x=Math.PI/2;
 root.add(horizontalRing);

 const beam=new THREE.Mesh(
  new THREE.CylinderGeometry(.24,.75,3.5,24,1,true),
  new THREE.MeshBasicMaterial({
   color:0xff1d12,
   transparent:true,
   opacity:.035,
   blending:THREE.AdditiveBlending,
   side:THREE.DoubleSide,
   depthWrite:false
  })
 );

 beam.position.y=-1.15;
 root.add(beam);

 return{
  root,
  update(time,delta,state){
   core.rotation.x+=delta*.75;
   core.rotation.y+=delta*1.15;
   verticalRing.rotation.z+=delta*.55;
   horizontalRing.rotation.z-=delta*.72;

   rings.forEach((ring,index)=>{
    ring.rotation.z+=delta*(index%2?-.25:.32)*(index+1);
   });

   const active=state!=="idle";
   const pulse=1+Math.sin(time*(active?5:2))*(active?.1:.045);
   core.scale.setScalar(pulse);
   coreMaterial.emissiveIntensity=active?5:3.2;
  }
 };
}

export async function loadVeylithModel(scene){
 const root=new THREE.Group();
 root.name="Veylith";
 scene.add(root);

 const draco=new DRACOLoader();
 draco.setDecoderPath("/vendor/three/examples/jsm/libs/draco/");

 const loader=new GLTFLoader();
 loader.setDRACOLoader(draco);

 try{
  const gltf=await loader.loadAsync(MODEL_URL);
  const model=gltf.scene;

  model.name="VeylithCharacter";

  const box=new THREE.Box3().setFromObject(model);
  const size=new THREE.Vector3();
  const center=new THREE.Vector3();

  box.getSize(size);
  box.getCenter(center);

  const targetHeight=5.65;
  const scale=size.y>0?targetHeight/size.y:1;

  model.scale.setScalar(scale);

  const scaledBox=new THREE.Box3().setFromObject(model);
  const scaledCenter=new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);

  model.position.x-=scaledCenter.x;
  model.position.z-=scaledCenter.z;
  model.position.y=-3.08-scaledBox.min.y;

  const materials=new Set();

  model.traverse(node=>{
   if(!node.isMesh)return;

   node.castShadow=false;
   node.receiveShadow=false;
   node.frustumCulled=true;

   const list=Array.isArray(node.material)
    ?node.material
    :[node.material];

   for(const material of list){
    if(!material)continue;
    materials.add(material);

    if("envMapIntensity" in material){
     material.envMapIntensity=.8;
    }

    material.needsUpdate=true;
   }
  });

  root.add(model);

  const mixer=gltf.animations.length
   ?new THREE.AnimationMixer(model)
   :null;

  const clips={
   idle:findClip(gltf.animations,["idle","breath","stand"]),
   thinking:findClip(gltf.animations,["think","thinking"]),
   coding:findClip(gltf.animations,["code","coding","type"]),
   build:findClip(gltf.animations,["build","compile"]),
   error:findClip(gltf.animations,["error","fail","damage"]),
   success:findClip(gltf.animations,["success","complete","victory"])
  };

  if(!clips.idle&&gltf.animations.length){
   clips.idle=gltf.animations[0];
  }

  let currentAction=null;
  let currentState="idle";

  function play(state){
   if(!mixer)return;

   const clip=clips[state]||clips.idle;
   if(!clip)return;

   const next=mixer.clipAction(clip);

   if(next===currentAction)return;

   next.reset();
   next.enabled=true;
   next.setEffectiveWeight(1);
   next.setEffectiveTimeScale(1);
   next.play();

   if(currentAction){
    currentAction.crossFadeTo(next,.3,false);
   }

   currentAction=next;
  }

  play("idle");

  return{
   root,
   model,
   mixer,
   animations:gltf.animations,
   clips,
   loaded:true,
   manifestation:false,
   state:"idle",

   setState(state){
    if(state===currentState)return;
    currentState=state;
    this.state=state;
    play(state);
   },

   update(time,delta){
    root.position.y=Math.sin(time*1.1)*.018;
   },

   dispose(){
    draco.dispose();

    model.traverse(node=>{
     if(node.geometry)node.geometry.dispose();
    });

    for(const material of materials){
     material.dispose();
    }
   }
  };
 }catch(error){
  draco.dispose();

  const manifestation=createManifestation();
  root.add(manifestation.root);

  let state="idle";

  return{
   root,
   model:manifestation.root,
   mixer:null,
   animations:[],
   clips:{},
   loaded:false,
   manifestation:true,
   state,

   setState(next){
    state=next;
    this.state=next;
   },

   update(time,delta){
    manifestation.update(time,delta,state);
   },

   dispose(){}
  };
 }
}



