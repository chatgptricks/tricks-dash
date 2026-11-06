import {DEFAULT_EYES, springStep, eyePath} from './reactions.js';

export class Eyes {
  constructor(svg) {
    this.svg=svg;
    this.states=Object.fromEntries(Object.entries(DEFAULT_EYES).map(([k,v])=>[k,{value:v,velocity:0}]));
    this.current={...DEFAULT_EYES};
    this.parts={};
    for(const side of ['l','r']){
      this.parts[side]={group:svg.querySelector('#eye-'+side),shape:svg.querySelector('#eye-shape-'+side),closed:svg.querySelector('#eye-closed-'+side),mask:svg.querySelector('#eye-mask-'+side),shine:svg.querySelector('#shine-'+side)};
    }
    this.nextBlink=2.5;
    this.blinkStart=-10;
    this.gaze={x:{value:0,velocity:0},y:{value:0,velocity:0}};
    this.eyesScale=svg.querySelector('#eyes-scale');
  }

  update(dt,time,reaction,config,gaze,age) {
    const intensity=config.intensity/100;
    const target={...DEFAULT_EYES,...reaction.eyes};
    springStep(this.gaze.x,config.follow?gaze.x:0,dt,300,24);
    springStep(this.gaze.y,config.follow?gaze.y:0,dt,300,24);
    const sleepy=reaction.id==='sleepy';
    const blinking=!['happy','celebrate'].includes(reaction.id);
    if(time>this.nextBlink){
      this.blinkStart=time;
      this.nextBlink=time+(sleepy?4.5:2.8)+Math.random()*3.4;
    }
    const blinkAge=time-this.blinkStart;
    const blinkDuration=sleepy?.38:.17;
    let blink=blinking&&blinkAge<blinkDuration&&blinkAge>=0?Math.pow(Math.sin(Math.PI*blinkAge/blinkDuration),.8):0;
    let wink=0;
    if(reaction.id==='greeting'&&age>1.45&&age<1.85)wink=Math.sin((age-1.45)/.4*Math.PI);
    const driftX=(Math.sin(time*.43)+Math.sin(time*.17))*.65;
    const driftY=Math.sin(time*.33)*.8;
    for(const key of Object.keys(this.states)){
      let desired=DEFAULT_EYES[key]+(target[key]-DEFAULT_EYES[key])*intensity;
      if(key==='closed')desired=intensity>0.05?target.closed:0;
      if(key==='lookX')desired+=(config.follow?gaze.x*3:0)+driftX;
      if(key==='lookY')desired+=(config.follow?gaze.y*2:0)+driftY;
      this.current[key]=springStep(this.states[key],desired,dt,210,25);
    }
    const p=this.current;
    this.eyesScale.setAttribute('transform','scale('+(config.eyeSize/100)+')');
    for(const [lower,side] of [['l','L'],['r','R']]){
      const close=Math.max(blink,side==='R'?wink:0);
      const expressionClose=Math.min(1,Math.max(0,p.closed));
      const h=Math.max(3,p['height'+side]*(1-close*.97));
      const curve=p['curve'+side]*(1-close);
      const d=eyePath(p['width'+side],h,curve);
      const part=this.parts[lower];
      const x=(side==='L'?-p.gap:p.gap)+p.lookX;
      const y=p['lift'+side]+p.lookY;
      part.group.setAttribute('transform','translate('+x.toFixed(2)+','+y.toFixed(2)+') rotate('+p['tilt'+side].toFixed(2)+')');
      part.shape.setAttribute('d',d);
      part.mask.setAttribute('d',d);
      const closedVisibility=Math.max(Math.max(0,(close-.72)/.28),expressionClose);
      part.shape.setAttribute('opacity',(1-closedVisibility).toFixed(3));
      const smileArc=Math.max(p['curve'+side]*1.4,side==='R'?wink*22:0);
      const half=p['width'+side]*.43;
      part.closed.setAttribute('d','M'+(-half).toFixed(2)+',4 Q0,'+(-2-smileArc).toFixed(2)+' '+half.toFixed(2)+',4');
      part.closed.setAttribute('stroke-width',(6+expressionClose*4).toFixed(2));
      part.closed.setAttribute('opacity',closedVisibility.toFixed(3));
      const rx=p['width'+side]*.165,ry=Math.min(14.5,h*.16);
      const limitX=p['width'+side]/2-rx-5,limitY=Math.max(0,h/2-ry-5);
      const shineX=Math.max(-limitX,Math.min(limitX,this.gaze.x.value*19+p.lookX*.35-3));
      const shineY=Math.max(-limitY,Math.min(limitY,-h*.16+this.gaze.y.value*h*.35+p.lookY*.4));
      part.shine.setAttribute('cx',shineX.toFixed(2));
      part.shine.setAttribute('cy',shineY.toFixed(2));
      part.shine.setAttribute('rx',rx.toFixed(2));
      part.shine.setAttribute('ry',ry.toFixed(2));
      part.shine.setAttribute('opacity',Math.max(0,p.shine*(1-close)*(1-expressionClose)*Math.min(1,(h-15)/35)).toFixed(3));
    }
  }

}
