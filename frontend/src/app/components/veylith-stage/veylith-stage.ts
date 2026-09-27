import {AfterViewInit,ChangeDetectionStrategy,Component,ElementRef,OnDestroy,ViewChild} from '@angular/core';
import * as THREE from 'three';

@Component({
 selector:'app-veylith-stage',
 standalone:true,
 templateUrl:'./veylith-stage.html',
 styleUrl:'./veylith-stage.scss',
 changeDetection:ChangeDetectionStrategy.OnPush
})
export class VeylithStageComponent implements AfterViewInit,OnDestroy{
 @ViewChild('host',{static:true}) host!:ElementRef<HTMLDivElement>;
 private renderer?:THREE.WebGLRenderer;
 private frame=0;
 private observer?:ResizeObserver;
 private scene?:THREE.Scene;

 ngAfterViewInit(){void this.create()}

 private async create(){
  const host=this.host.nativeElement;
  const scene=new THREE.Scene();
  this.scene=scene;

  const camera=new THREE.PerspectiveCamera(36,1,.1,100);
  camera.position.set(0,.2,10);

  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setClearColor(0x000000,0);
  host.appendChild(renderer.domElement);
  this.renderer=renderer;

  scene.fog=new THREE.FogExp2(0x080000,.035);

  const halo=new THREE.Group();
  const ringMaterial=new THREE.MeshBasicMaterial({
   color:0x8f241d,
   transparent:true,
   opacity:.72
  });

  for(const [radius,tube] of [[3.15,.018],[2.72,.012],[2.28,.009]] as [number,number][]){
   const mesh=new THREE.Mesh(
    new THREE.TorusGeometry(radius,tube,8,160),
    ringMaterial.clone()
   );
   halo.add(mesh);
  }

  scene.add(halo);

  const texture=await new THREE.TextureLoader().loadAsync('/assets/images/veylith.png?v=1');
  texture.colorSpace=THREE.SRGBColorSpace;

  const image=texture.image as HTMLImageElement;
  const height=5.72;
  const width=height*(image.width/image.height);

  const character=new THREE.Mesh(
   new THREE.PlaneGeometry(width,height),
   new THREE.MeshBasicMaterial({
    map:texture,
    transparent:true,
    alphaTest:.015,
    side:THREE.DoubleSide,
    toneMapped:false
   })
  );

  character.position.set(0,-.25,.55);
  character.renderOrder=10;
  scene.add(character);

  const stars=new THREE.BufferGeometry();
  const positions=new Float32Array(420*3);

  for(let i=0;i<420;i++){
   const a=Math.random()*Math.PI*2;
   const r=3.4+Math.random()*2.8;
   positions[i*3]=Math.cos(a)*r;
   positions[i*3+1]=(Math.random()-.5)*6.8;
   positions[i*3+2]=-1-Math.random()*2;
  }

  stars.setAttribute('position',new THREE.BufferAttribute(positions,3));

  scene.add(new THREE.Points(
   stars,
   new THREE.PointsMaterial({
    color:0xa62b21,
    size:.018,
    transparent:true,
    opacity:.5
   })
  ));

  const resize=()=>{
   const width=host.clientWidth;
   const height=host.clientHeight;
   renderer.setSize(width,height,false);
   camera.aspect=width/Math.max(height,1);
   camera.updateProjectionMatrix();
  };

  this.observer=new ResizeObserver(resize);
  this.observer.observe(host);
  resize();

  const clock=new THREE.Clock();

  const draw=()=>{
   const t=clock.getElapsedTime();
   halo.rotation.z=t*.035;
   character.position.y=-.25+Math.sin(t*.9)*.018;
   renderer.render(scene,camera);
   this.frame=requestAnimationFrame(draw);
  };

  draw();
 }

 ngOnDestroy(){
  cancelAnimationFrame(this.frame);
  this.observer?.disconnect();
  this.renderer?.dispose();
  this.renderer?.domElement.remove();
 }


}





