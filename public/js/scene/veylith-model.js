import * as THREE from "three";

const IMAGE_URL="/assets/images/veylith.png?v=1";

export async function loadVeylithModel(scene){
 const root=new THREE.Group();
 root.name="Veylith";
 scene.add(root);

 const loader=new THREE.TextureLoader();
 const texture=await loader.loadAsync(IMAGE_URL);

 texture.colorSpace=THREE.SRGBColorSpace;
 texture.minFilter=THREE.LinearMipmapLinearFilter;
 texture.magFilter=THREE.LinearFilter;
 texture.generateMipmaps=true;

 const image=texture.image;
 const aspect=image.width/image.height;
 const targetHeight=5.72;
 const targetWidth=targetHeight*aspect;

 const material=new THREE.MeshBasicMaterial({
  map:texture,
  transparent:true,
  alphaTest:.015,
  side:THREE.DoubleSide,
  depthWrite:true,
  depthTest:true,
  toneMapped:false
 });

 const geometry=new THREE.PlaneGeometry(targetWidth,targetHeight,1,1);
 const model=new THREE.Mesh(geometry,material);

 model.name="VeylithCharacter2D";
 model.position.set(0,-.22,.62);
 model.renderOrder=5;

 root.add(model);

 let state="idle";
 let stateTime=0;

 const baseScale=new THREE.Vector3(1,1,1);

 function setState(next){
  if(next===state)return;
  state=next;
  stateTime=0;
 }

 function update(time,delta){
  stateTime+=delta;

  let floatY=Math.sin(time*.92)*.018;
  let scale=1;
  let rotation=0;

  if(state==="thinking"){
   floatY+=Math.sin(time*1.6)*.008;
   scale=1+Math.sin(time*1.3)*.0025;
  }else if(state==="coding"){
   floatY+=Math.sin(time*1.9)*.009;
   scale=1+Math.sin(time*2.1)*.002;
  }else if(state==="build"){
   floatY+=Math.sin(time*1.5)*.01;
   scale=1+Math.sin(time*1.7)*.003;
  }else if(state==="error"){
   rotation=Math.sin(time*18)*.0018;
  }else if(state==="success"){
   scale=1+Math.sin(Math.min(stateTime,1)*Math.PI)*.012;
  }

  root.position.y=floatY;
  model.rotation.z=rotation;
  model.scale.copy(baseScale).multiplyScalar(scale);
 }

 return{
  root,
  model,
  mixer:null,
  animations:[],
  clips:{},
  loaded:true,
  manifestation:false,
  imageMode:true,
  state,

  setState(next){
   setState(next);
   this.state=next;
  },

  update,

  dispose(){
   geometry.dispose();
   material.dispose();
   texture.dispose();
  }
 };
}
