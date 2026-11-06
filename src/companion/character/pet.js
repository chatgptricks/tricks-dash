import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { reactionById, springStep } from './reactions.js';
import { Eyes } from './eyes.js';
import { Accents } from './accents.js';

export const DEFAULT_CONFIG={intensity:75,elasticity:60,speed:100,eyeSize:100,follow:true,background:'dark',accentMode:'auto',messageCount:3};

const SEAMS=[
  {a:[.04,.65],b:[1.03,1.21]},
  {a:[-1.03,-1.21],b:[-.04,-.65]}
];

// Insert exact crease edges before deforming the inflated surface.
// This keeps a zero-width seam continuous instead of sampling it on a voxel grid.
function splitTrianglesAtPlane(data,origin,normal){
  const output=[];
  const distance=p=>(p[0]-origin[0])*normal[0]+(p[1]-origin[1])*normal[1];
  const clip=(poly,sign)=>{
    const result=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],da=distance(a)*sign,db=distance(b)*sign;
      if(da>=-1e-8)result.push(a);
      if((da>1e-8&&db< -1e-8)||(da< -1e-8&&db>1e-8)){
        const t=da/(da-db);
        result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]);
      }
    }
    return result;
  };
  const append=poly=>{
    for(let k=1;k<poly.length-1;k++){
      const a=poly[0],b=poly[k],c=poly[k+1];
      const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
      const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
      if(Math.hypot(...cross)>1e-10)output.push(...a,...b,...c);
    }
  };
  for(let i=0;i<data.length;i+=9){
    const triangle=[[data[i],data[i+1],data[i+2]],[data[i+3],data[i+4],data[i+5]],[data[i+6],data[i+7],data[i+8]]];
    const distances=triangle.map(distance);
    if(Math.min(...distances)<-1e-8&&Math.max(...distances)>1e-8){
      append(clip(triangle,1));append(clip(triangle,-1));
    }else append(triangle);
  }
  return output;
}

function makeBodyGeometry() {
  // Inflated body with two pinched, zero-opening 3D seams.
  // Only the eyes use the independent SVG face.
  const resolution=104,domain=5.5,bodyRadius=.89;
  const surface=new MarchingCubes(resolution,new THREE.MeshBasicMaterial(),false,false,140000);
  surface.isolation=0;
  const distanceToSegment=(x,y,ax,ay,bx,by)=>{
    const dx=bx-ax,dy=by-ay;
    const t=THREE.MathUtils.clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy),0,1);
    return Math.hypot(x-ax-t*dx,y-ay-t*dy);
  };
  const rings=new Float32Array(resolution*resolution*2);
  for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
    const px=(x/resolution-.5)*domain,py=(y/resolution-.5)*domain;
    const offset=(y*resolution+x)*2;
    rings[offset]=distanceToSegment(px,py,-.467,.282,1.266,1.195);
    rings[offset+1]=distanceToSegment(px,py,-1.267,-1.196,.466,-.283);
  }
  for(let z=0;z<resolution;z++){
    const worldZ=(z/resolution-.5)*domain;
    for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
      const offset=(y*resolution+x)*2;
      const pz=worldZ/.98;
      const a=Math.hypot(rings[offset],pz)-bodyRadius;
      const b=Math.hypot(rings[offset+1],pz)-bodyRadius;
      const smoothing=.18;
      const h=Math.max(smoothing-Math.abs(a-b),0)/smoothing;
      const bodyDistance=Math.min(a,b)-h*h*smoothing*.25;
      surface.field[z*resolution*resolution+y*resolution+x]=-bodyDistance;
    }
  }
  surface.update();
  const count=surface.geometry.drawRange.count;
  let geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(surface.geometry.attributes.position.array.slice(0,count*3),3));
  geometry.scale(domain/2,domain/2,domain/2);
  surface.geometry.dispose();surface.material.dispose();
  let triangles=Array.from(geometry.attributes.position.array);
  for(const seam of SEAMS){
    const dx=seam.b[0]-seam.a[0],dy=seam.b[1]-seam.a[1],length=Math.hypot(dx,dy);
    const along=[dx/length,dy/length],across=[-dy/length,dx/length];
    triangles=splitTrianglesAtPlane(triangles,seam.a,across);
    for(const offset of [-.6,-.43,-.27,-.15,-.07,-.03,-.012,-.004,.004,.012,.03,.07,.15,.27,.43,.6]){
      triangles=splitTrianglesAtPlane(triangles,[seam.a[0]+across[0]*offset,seam.a[1]+across[1]*offset],across);
    }
    triangles=splitTrianglesAtPlane(triangles,seam.a,along);
    triangles=splitTrianglesAtPlane(triangles,seam.b,along);
  }
  geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(triangles),3));
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('normal');
  geometry=mergeVertices(geometry,1e-4);
  geometry.computeVertexNormals();
  geometry=geometry.toNonIndexed();
  const base=geometry.attributes.position.array;
  const normals=geometry.attributes.normal.array;
  const colors=new Float32Array(base.length);
  for(let i=0;i<base.length;i+=3){
    const x=base[i],y=base[i+1],z=base[i+2];
    let seam=Infinity,dx=0,dy=0;
    for(const line of SEAMS){
      const lx=line.b[0]-line.a[0],ly=line.b[1]-line.a[1],length=Math.hypot(lx,ly);
      const along=THREE.MathUtils.clamp(((x-line.a[0])*lx+(y-line.a[1])*ly)/(length*length),0,1);
      const sx=x-line.a[0]-lx*along,sy=y-line.a[1]-ly*along,distance=Math.hypot(sx,sy);
      if(distance>=seam)continue;
      seam=distance;
      if(distance>1e-5){dx=sx/distance;dy=sy/distance;}
      else{
        const triangle=Math.floor(i/9)*9;
        const cx=(base[triangle]+base[triangle+3]+base[triangle+6])/3;
        const cy=(base[triangle+1]+base[triangle+4]+base[triangle+7])/3;
        const side=Math.sign((cx-line.a[0])*(-ly)+(cy-line.a[1])*lx)||1;
        dx=-ly/length*side;dy=lx/length*side;
      }
    }
    if(z>0){
      // A welded balloon: the inflated skins meet at a line and roll out in
      // a broad round shoulder, rather than descending into a narrow channel.
      const shoulder=.72,weldHeight=.018,foldDepth=.30;
      const q=Math.min(1,seam/shoulder);
      const rounded=Math.sin(q*Math.PI/2);
      const inflated=rounded+.30*Math.sin(Math.PI*q)**2;
      const thickness=Math.min(foldDepth,Math.max(0,z-weldHeight));
      base[i+2]=z-thickness*(1-inflated);
      // Transform the smooth inflated normal analytically. Duplicated vertices
      // on the crease keep opposite normals, so the two sides meet at one line.
      const slope=q<1?-(Math.PI/2*Math.cos(q*Math.PI/2)+.30*Math.PI*Math.sin(2*Math.PI*q))/shoulder:0;
      const zScale=z>weldHeight&&z<weldHeight+foldDepth?inflated:1;
      const nx=normals[i]*zScale+normals[i+2]*slope*dx*thickness;
      const ny=normals[i+1]*zScale+normals[i+2]*slope*dy*thickness;
      const nz=normals[i+2],length=Math.hypot(nx,ny,nz);
      normals[i]=nx/length;normals[i+1]=ny/length;normals[i+2]=nz/length;
    }
    const endpoint=Math.min(...SEAMS.flatMap(line=>[Math.hypot(x-line.a[0],y-line.a[1]),Math.hypot(x-line.b[0],y-line.b[1])]));
    const occlusion=(.18*Math.exp(-Math.pow(seam/.008,2))+.15*Math.exp(-Math.pow(seam/.20,2))+.10*Math.exp(-Math.pow(endpoint/.22,2)))*THREE.MathUtils.smoothstep(z,-.65,-.35);
    const shade=1-occlusion;
    colors[i]=shade;colors[i+1]=shade;colors[i+2]=shade;
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  geometry=mergeVertices(geometry,1e-5);
  const vertices=geometry.attributes.position.array;
  const baseNormals=geometry.attributes.normal.array;
  const deformations=[
    (x,y,z)=>[x*1.115,y*.82,z*1.08],
    (x,y,z)=>[x*.92,y*1.19,z*.95],
    (x,y,z)=>[x+.115*(y*y-.75),y+.045*x*y,z],
    (x,y,z)=>[x-.115*(y*y-.75),y-.045*x*y,z],
    (x,y,z)=>{const a=y*.13;return [x*Math.cos(a)+z*Math.sin(a),y,z*Math.cos(a)-x*Math.sin(a)];},
    (x,y,z)=>{const a=-y*.13;return [x*Math.cos(a)+z*Math.sin(a),y,z*Math.cos(a)-x*Math.sin(a)];}
  ];
  geometry.morphAttributes.position=[];
  geometry.morphAttributes.normal=[];
  for(let n=0;n<deformations.length;n++){
    const positions=new Float32Array(vertices.length),morphNormals=new Float32Array(vertices.length);
    const transform=deformations[n],epsilon=.0001;
    for(let i=0;i<vertices.length;i+=3){
      const x=vertices[i],y=vertices[i+1],z=vertices[i+2];
      const v=transform(x,y,z);
      positions[i]=v[0];positions[i+1]=v[1];positions[i+2]=v[2];
      const a=transform(x+epsilon,y,z).map((p,j)=>(p-v[j])/epsilon);
      const b=transform(x,y+epsilon,z).map((p,j)=>(p-v[j])/epsilon);
      const c=transform(x,y,z+epsilon).map((p,j)=>(p-v[j])/epsilon);
      const nx=baseNormals[i],ny=baseNormals[i+1],nz=baseNormals[i+2];
      const transformed=[
        (b[1]*c[2]-b[2]*c[1])*nx+(c[1]*a[2]-c[2]*a[1])*ny+(a[1]*b[2]-a[2]*b[1])*nz,
        (b[2]*c[0]-b[0]*c[2])*nx+(c[2]*a[0]-c[0]*a[2])*ny+(a[2]*b[0]-a[0]*b[2])*nz,
        (b[0]*c[1]-b[1]*c[0])*nx+(c[0]*a[1]-c[1]*a[0])*ny+(a[0]*b[1]-a[1]*b[0])*nz
      ];
      const length=Math.hypot(...transformed);
      morphNormals[i]=transformed[0]/length;morphNormals[i+1]=transformed[1]/length;morphNormals[i+2]=transformed[2]/length;
    }
    const position=new THREE.BufferAttribute(positions,3);
    position.name=['compress','stretch','bend_right','bend_left','twist_right','twist_left'][n];
    geometry.morphAttributes.position.push(position);
    geometry.morphAttributes.normal.push(new THREE.BufferAttribute(morphNormals,3));
  }
  geometry.computeBoundingSphere();
  return geometry;
}

export class SentientPet {
  constructor(canvas,stage,face,options={}) {
    this.canvas=canvas;this.stage=stage;this.face=face;
    this.config={...DEFAULT_CONFIG,...options};
    this.reaction=reactionById.idle;
    this.time=0;this.reactionStart=0;this.paused=false;this.visible=true;
    this.pointer={x:0,y:0,active:false};
    this.drag={active:false,moved:false,x:0,y:0,startX:0,startY:0,rx:0,ry:0};
    this.orbit={x:{value:0,velocity:0},y:{value:0,velocity:0}};
    this.headGaze={x:{value:0,velocity:0},y:{value:0,velocity:0}};
    this.bodyValues={};
    for(const key of ['squash','stretch','bend','twist','roll','forward','y'])this.bodyValues[key]={value:0,velocity:0};
    this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'default'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    this.renderer.setClearColor(0x000000,0);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=.95;
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.scene=new THREE.Scene();
    this.camera=new THREE.OrthographicCamera(-3,3,3,-3,.1,40);
    this.camera.position.set(0,0,12);
    this.camera.lookAt(0,0,0);
    const pmrem=new THREE.PMREMGenerator(this.renderer);
    const room=new RoomEnvironment();
    this.environment=pmrem.fromScene(room,.04);
    this.scene.environment=this.environment.texture;
    room.dispose();pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x646464,.36));
    const key=new THREE.DirectionalLight(0xffffff,2.8);
    key.position.set(-4.5,6,4);
    key.castShadow=true;
    key.shadow.mapSize.set(2048,2048);
    Object.assign(key.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.5,far:22});
    key.shadow.bias=-.0004;key.shadow.normalBias=.025;
    key.shadow.camera.updateProjectionMatrix();
    this.scene.add(key);
    const fill=new THREE.DirectionalLight(0xffffff,.25);
    fill.position.set(5,1,5);this.scene.add(fill);
    const rim=new THREE.DirectionalLight(0xffffff,1.6);
    rim.position.set(1,5,-4);this.scene.add(rim);
    this.root=new THREE.Group();
    this.scene.add(this.root);
    this.body=new THREE.Mesh(makeBodyGeometry(),new THREE.MeshPhysicalMaterial({
      color:0xf7f7f7,roughness:.30,metalness:.035,clearcoat:.30,clearcoatRoughness:.30,envMapIntensity:.25,vertexColors:true
    }));
    this.body.material.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 vPetRestPosition;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPetRestPosition = position;');
      shader.fragmentShader='varying vec3 vPetRestPosition;\nfloat petLineDistance(vec2 p, vec2 a, vec2 b){vec2 ab=b-a;float t=clamp(dot(p-a,ab)/dot(ab,ab),0.0,1.0);return length(p-a-t*ab);}\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat seamD=min(petLineDistance(vPetRestPosition.xy,vec2(0.04,0.65),vec2(1.03,1.21)),petLineDistance(vPetRestPosition.xy,vec2(-1.03,-1.21),vec2(-0.04,-0.65)));\nfloat seamAA=max(fwidth(seamD),0.001);\nfloat seamInk=(1.0-smoothstep(0.001,0.001+seamAA,seamD))*smoothstep(-0.1,0.1,vPetRestPosition.z);\ndiffuseColor.rgb *= 1.0-0.52*seamInk;');
    };
    this.body.material.customProgramCacheKey=()=>'sentient-fine-seam-v1';
    this.body.castShadow=true;this.body.receiveShadow=true;
    this.root.add(this.body);
    this.facePoint=new THREE.Object3D();
    this.facePoint.position.set(0,.01,1.03);
    this.root.add(this.facePoint);
    this.accentPoint=new THREE.Object3D();
    this.accentPoint.position.set(1.8,1.85,1.15);
    this.root.add(this.accentPoint);
    this.projection=new THREE.Vector3();
    this.eyes=new Eyes(document.getElementById('pet-face'));
    this.accents=new Accents(document.getElementById('pet-accents'));
    this.accents.update(0,0,this.reaction,this.config,{immediate:true});
    this.addShadow();
    this.abort=new AbortController();
    this.bindPointer();
    this.resizeObserver=new ResizeObserver(()=>{this.resize();this.render();});
    this.resizeObserver.observe(stage);
    this.visibilityObserver=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;},{threshold:0});
    this.visibilityObserver.observe(stage);
    this.resize();
    this.eyes.update(.016,0,this.reaction,this.config,this.pointer,0);
    this.render();
    this.face.style.opacity='1';
    this.last=performance.now();
    this.animate=this.animate.bind(this);
    this.frame=requestAnimationFrame(this.animate);
    document.addEventListener('visibilitychange',()=>{this.last=performance.now();},{signal:this.abort.signal});
    canvas.addEventListener('webglcontextlost',event=>{
      event.preventDefault();this.setPaused(true);
      const node=document.getElementById('stage-loading');
      node.textContent='Se interrumpió la vista 3D. Recargá el HTML para continuar.';
      node.hidden=false;
    },{signal:this.abort.signal});
  }

  addShadow(){
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
    const ctx=canvas.getContext('2d');
    const gradient=ctx.createRadialGradient(128,64,0,128,64,62);
    gradient.addColorStop(0,'rgba(85,85,85,.38)');gradient.addColorStop(.5,'rgba(85,85,85,.18)');gradient.addColorStop(1,'rgba(85,85,85,0)');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,256,128);
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    this.shadow=new THREE.Mesh(new THREE.PlaneGeometry(4.8,.8),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,opacity:.65}));
    this.shadow.position.set(0,-2.52,-1);
    this.scene.add(this.shadow);
  }

  resize(){
    const rect=this.stage.getBoundingClientRect();
    this.width=Math.max(1,rect.width);this.height=Math.max(1,rect.height);
    const aspect=this.width/this.height;
    const vertical=Math.max(6,5.75/aspect);
    this.viewHeight=vertical;
    this.camera.left=-vertical*aspect/2;this.camera.right=vertical*aspect/2;
    this.camera.top=vertical/2;this.camera.bottom=-vertical/2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width,this.height,false);
  }

  bindPointer(){
    const signal=this.abort.signal;
    window.addEventListener('pointermove',event=>{
      const rect=this.canvas.getBoundingClientRect();
      this.pointer.x=THREE.MathUtils.clamp((event.clientX-rect.left)/rect.width*2-1,-1,1);
      this.pointer.y=THREE.MathUtils.clamp((event.clientY-rect.top)/rect.height*2-1,-1,1);
    },{signal});
    this.canvas.addEventListener('pointermove',event=>{
      const rect=this.canvas.getBoundingClientRect();
      this.pointer.x=THREE.MathUtils.clamp((event.clientX-rect.left)/rect.width*2-1,-1,1);
      this.pointer.y=THREE.MathUtils.clamp((event.clientY-rect.top)/rect.height*2-1,-1,1);
      this.pointer.active=true;
      if(this.drag.active){
        const dx=event.clientX-this.drag.startX,dy=event.clientY-this.drag.startY;
        if(Math.hypot(dx,dy)>5)this.drag.moved=true;
        this.drag.rx=THREE.MathUtils.clamp(this.drag.x+dy*.004,-.4,.4);
        this.drag.ry=THREE.MathUtils.clamp(this.drag.y+dx*.004,-.65,.65);
        if(this.paused){this.orbit.x.value=this.drag.rx;this.orbit.y.value=this.drag.ry;this.updateBody(1/60);this.render();}
      }
    },{signal});
    this.canvas.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      this.drag.active=true;this.drag.moved=false;
      this.drag.startX=event.clientX;this.drag.startY=event.clientY;
      this.drag.x=this.drag.rx;this.drag.y=this.drag.ry;
      this.canvas.setPointerCapture(event.pointerId);
    },{signal});
    this.canvas.addEventListener('pointerup',event=>{
      if(!this.drag.active)return;
      this.drag.active=false;
      if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);
      if(!this.drag.moved)this.onPet?.();
    },{signal});
    this.canvas.addEventListener('pointercancel',()=>{this.drag.active=false;},{signal});
  }

  setReaction(id){
    if(!reactionById[id])throw new Error('Unknown reaction: '+id);
    this.reaction=reactionById[id];this.reactionStart=this.time;
    this.accents.update(0,this.time,this.reaction,this.config,{immediate:this.paused});
    if(id==='surprised')this.bodyValues.stretch.velocity+=1.6;
    if(id==='greeting')this.bodyValues.roll.velocity+=.35;
  }
  setConfig(config){Object.assign(this.config,config);this.accents.update(0,this.time,this.reaction,this.config,{immediate:this.paused});this.render();}
  setPaused(paused){this.paused=Boolean(paused);this.last=performance.now();this.stage.dataset.paused=String(this.paused);this.onPause?.(this.paused);}
  resetView(){this.drag.rx=0;this.drag.ry=0;this.orbit.x={value:0,velocity:0};this.orbit.y={value:0,velocity:0};this.root.rotation.set(0,0,.1);this.render();}

  updateBody(dt){
    const t=this.time,age=t-this.reactionStart,id=this.reaction.id;
    const cfg=this.config;
    const e=cfg.elasticity/100, intensity=cfg.intensity/100;
    const b=this.reaction.body;
    const breath=Math.sin(t*1.55);
    const target={squash:(b.squash||0)*intensity+.035*(1+breath),stretch:(b.stretch||0)*intensity+.028*(1-breath),bend:(b.bend||0)*intensity,twist:Math.sin(t*.6)*.055,roll:(b.roll||0)*intensity,forward:(b.forward||0)*intensity,y:Math.sin(t*1.15)*.047};
    if(id==='thinking'){target.roll+=Math.sin(t*1.1)*.035;target.bend+=Math.sin(t*.7)*.12;}
    if(id==='working'){target.squash+=Math.pow(Math.sin(t*3.4),2)*.1*intensity;target.twist+=Math.sin(t*1.7)*.12*intensity;}
    if(id==='celebrate'){
      const jump=Math.max(0,Math.sin(age*4.1));
      target.y+=jump*.29*intensity;
      target.stretch+=jump*.22*intensity;
      target.squash+=Math.max(0,-Math.sin(age*4.1))*.38*intensity;
      target.roll+=Math.sin(age*4.1)*.07*intensity;
    }
    if(id==='surprised'){target.y+=Math.exp(-age*1.2)*.18*intensity;}
    if(id==='confused'){target.roll+=Math.sin(age*1.5)*.07*intensity;target.bend+=Math.sin(age*1.3)*.15*intensity;}
    if(id==='greeting'){const wave=Math.sin(age*6)*Math.exp(-age*.45);target.roll+=wave*.16*intensity;target.bend+=wave*.3*intensity;}
    if(id==='sleepy'){target.y-=.09*intensity;target.roll+=Math.sin(t*.5)*.045;}
    const damping=24-e*12;
    const values={};
    for(const key of Object.keys(target))values[key]=springStep(this.bodyValues[key],target[key],dt,165,damping);
    const weights=this.body.morphTargetInfluences;
    weights[0]=Math.max(0,values.squash)*e;
    weights[1]=Math.max(0,values.stretch)*e;
    weights[2]=Math.max(0,values.bend)*e;
    weights[3]=Math.max(0,-values.bend)*e;
    weights[4]=Math.max(0,values.twist)*e;
    weights[5]=Math.max(0,-values.twist)*e;
    springStep(this.orbit.x,this.drag.rx,dt,110,23);
    springStep(this.orbit.y,this.drag.ry,dt,110,23);
    const gazeX=springStep(this.headGaze.x,cfg.follow?this.pointer.x*.43:0,dt,110,22);
    const gazeY=springStep(this.headGaze.y,cfg.follow?this.pointer.y*.27:0,dt,110,22);
    this.root.rotation.set(
      THREE.MathUtils.clamp(.10+this.orbit.x.value+gazeY,-.55,.55),
      THREE.MathUtils.clamp(-.16+this.orbit.y.value+gazeX+Math.sin(t*.55)*.025,-.85,.85),
      .105+values.roll
    );
    this.root.position.set(0,values.y+.02,values.forward);
    this.shadow.scale.setScalar(1-values.y*.15);
    this.shadow.material.opacity=(cfg.background==='dark'?.55:.9)-values.y*.2;
  }

  render(){
    this.scene.updateMatrixWorld();
    this.facePoint.getWorldPosition(this.projection);
    this.projection.project(this.camera);
    const x=(this.projection.x*.5+.5)*this.width;
    const y=(-this.projection.y*.5+.5)*this.height;
    const size=1.96/this.viewHeight*this.height;
    this.face.style.left=x+'px';this.face.style.top=y+'px';
    this.face.style.width=size+'px';this.face.style.height=size*.75+'px';
    this.accentPoint.getWorldPosition(this.projection);
    this.projection.project(this.camera);
    const accentSize=1.28/this.viewHeight*this.height;
    const accentX=THREE.MathUtils.clamp((this.projection.x*.5+.5)*this.width,accentSize*.6,this.width-accentSize*.6);
    const accentY=THREE.MathUtils.clamp((-this.projection.y*.5+.5)*this.height,Math.max(90,accentSize*.65),this.height-accentSize*.65);
    this.accents.render(accentX,accentY,accentSize,this.width,this.height);
    this.renderer.render(this.scene,this.camera);
  }

  animate(now){
    this.frame=requestAnimationFrame(this.animate);
    const elapsed=Math.min((now-this.last)/1000,.04);
    this.last=now;
    if(document.hidden||!this.visible)return;
    if(this.paused)return;
    const dt=elapsed*this.config.speed/100;
    this.time+=dt;
    this.onTick?.(dt);
    this.updateBody(dt);
    this.eyes.update(dt,this.time,this.reaction,this.config,this.pointer,this.time-this.reactionStart);
    this.accents.update(dt,this.time,this.reaction,this.config);
    this.render();
  }

  async capture(){
    const exportScale=2;
    const livePixelRatio=this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(exportScale);
    this.render();
    const faceFrame={width:parseFloat(this.face.style.width),height:parseFloat(this.face.style.height),x:parseFloat(this.face.style.left),y:parseFloat(this.face.style.top)};
    const svg=this.eyes.svg.cloneNode(true);
    const accents=this.accents.svg.cloneNode(true);
    const out=document.createElement('canvas');
    out.width=Math.round(this.width*exportScale);out.height=Math.round(this.height*exportScale);
    const ctx=out.getContext('2d');
    if(this.config.background!=='transparent'){
      const dark=this.config.background==='dark';
      const gradient=ctx.createRadialGradient(out.width*.48,out.height*.38,0,out.width*.5,out.height*.4,out.height*.82);
      gradient.addColorStop(0,dark?'#2a322d':'#ffffff');
      gradient.addColorStop(.5,dark?'#1d2420':'#f7f7f7');
      gradient.addColorStop(1,dark?'#131915':'#f0f0f0');
      ctx.fillStyle=gradient;ctx.fillRect(0,0,out.width,out.height);
    }
    ctx.shadowColor='rgba(65,65,65,.24)';ctx.shadowOffsetY=12*exportScale;ctx.shadowBlur=11*exportScale;
    ctx.drawImage(this.canvas,0,0,out.width,out.height);
    this.renderer.setPixelRatio(livePixelRatio);
    this.render();
    ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    svg.setAttribute('width','960');svg.setAttribute('height','720');
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
    try{
      const image=new Image();
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});
      const w=faceFrame.width*exportScale,h=faceFrame.height*exportScale;
      const x=faceFrame.x*exportScale-w/2,y=faceFrame.y*exportScale-h/2;
      ctx.shadowColor='rgba(70,70,70,.32)';ctx.shadowOffsetY=8*exportScale;ctx.shadowBlur=5*exportScale;
      ctx.drawImage(image,x,y,w,h);
    }finally{URL.revokeObjectURL(url);}
    ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    accents.setAttribute('width',String(out.width));accents.setAttribute('height',String(out.height));
    const accentUrl=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(accents)],{type:'image/svg+xml'}));
    try{
      const image=new Image();
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=accentUrl;});
      ctx.shadowColor='rgba(65,65,65,.12)';ctx.shadowOffsetY=3*exportScale;ctx.shadowBlur=3*exportScale;
      ctx.drawImage(image,0,0,out.width,out.height);
    }finally{URL.revokeObjectURL(accentUrl);}
    return new Promise(resolve=>out.toBlob(resolve,'image/png'));
  }

  dispose(){
    cancelAnimationFrame(this.frame);this.abort.abort();this.resizeObserver.disconnect();this.visibilityObserver.disconnect();
    this.scene.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});
    this.environment.dispose();this.renderer.dispose();
  }
}
