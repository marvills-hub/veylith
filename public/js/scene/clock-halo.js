import * as THREE from "three";

export function createClockHalo(scene){
 const group=new THREE.Group();
 group.name="VeylithClockHalo";
 group.position.set(0,.2,-1.8);

 const gold=new THREE.MeshBasicMaterial({
  color:0xe0ad52,
  transparent:true,
  opacity:.66,
  blending:THREE.AdditiveBlending,
  depthWrite:false
 });

 const red=new THREE.MeshBasicMaterial({
  color:0xd92218,
  transparent:true,
  opacity:.44,
  blending:THREE.AdditiveBlending,
  depthWrite:false
 });

 const dim=new THREE.MeshBasicMaterial({
  color:0x66100d,
  transparent:true,
  opacity:.28,
  blending:THREE.AdditiveBlending,
  depthWrite:false
 });

 const rings=[];

 [
  [3.35,.018,gold],
  [3.08,.009,red],
  [2.68,.014,gold],
  [2.32,.008,red],
  [1.78,.006,dim]
 ].forEach(([radius,tube,material])=>{
  const ring=new THREE.Mesh(
   new THREE.TorusGeometry(radius,tube,6,128),
   material
  );
  group.add(ring);
  rings.push(ring);
 });

 const outerMarks=new THREE.Group();

 for(let i=0;i<60;i++){
  const angle=i/60*Math.PI*2;
  const major=i%5===0;

  const mark=new THREE.Mesh(
   new THREE.BoxGeometry(
    major?.045:.018,
    major?.42:.18,
    .018
   ),
   major?gold:red
  );

  const radius=3.02;
  mark.position.set(
   Math.sin(angle)*radius,
   Math.cos(angle)*radius,
   0
  );
  mark.rotation.z=-angle;
  outerMarks.add(mark);
 }

 group.add(outerMarks);

 const innerMarks=new THREE.Group();

 for(let i=0;i<24;i++){
  const angle=i/24*Math.PI*2;

  const mark=new THREE.Mesh(
   new THREE.BoxGeometry(.025,.25,.014),
   i%3===0?gold:dim
  );

  const radius=2.43;
  mark.position.set(
   Math.sin(angle)*radius,
   Math.cos(angle)*radius,
   0
  );
  mark.rotation.z=-angle;
  innerMarks.add(mark);
 }

 group.add(innerMarks);

 const mechanism=new THREE.Group();

 for(let i=0;i<12;i++){
  const angle=i/12*Math.PI*2;

  const spoke=new THREE.Mesh(
   new THREE.BoxGeometry(.018,1.38,.012),
   i%3===0?red:dim
  );

  spoke.position.set(
   Math.sin(angle)*.72,
   Math.cos(angle)*.72,
   0
  );

  spoke.rotation.z=-angle;
  mechanism.add(spoke);
 }

 group.add(mechanism);

 const handMaterial=new THREE.MeshBasicMaterial({
  color:0xe73728,
  transparent:true,
  opacity:.7,
  blending:THREE.AdditiveBlending
 });

 const hourHand=new THREE.Mesh(
  new THREE.BoxGeometry(.035,1.28,.02),
  handMaterial
 );
 hourHand.position.y=.64;

 const minuteHand=new THREE.Mesh(
  new THREE.BoxGeometry(.02,1.78,.015),
  gold
 );
 minuteHand.position.y=.89;

 const hourPivot=new THREE.Group();
 const minutePivot=new THREE.Group();

 hourPivot.add(hourHand);
 minutePivot.add(minuteHand);
 group.add(hourPivot,minutePivot);

 const center=new THREE.Mesh(
  new THREE.RingGeometry(.08,.16,24),
  gold
 );
 group.add(center);

 scene.add(group);

 return{
  group,
  update(delta,intensity=1){
   rings[0].rotation.z+=delta*.018*intensity;
   rings[1].rotation.z-=delta*.032*intensity;
   rings[2].rotation.z+=delta*.05*intensity;
   rings[3].rotation.z-=delta*.08*intensity;
   rings[4].rotation.z+=delta*.12*intensity;

   outerMarks.rotation.z-=delta*.012*intensity;
   innerMarks.rotation.z+=delta*.024*intensity;
   mechanism.rotation.z-=delta*.017*intensity;

   minutePivot.rotation.z-=delta*.18*intensity;
   hourPivot.rotation.z-=delta*.035*intensity;
  }
 };
}
