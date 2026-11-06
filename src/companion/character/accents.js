import { springStep } from './reactions.js';

// These are visual signals only. Message counts are supplied by the host app.
export const AUTO_ACCENTS={attentive:'message',thinking:'thought',working:'sweat',celebrate:'star',surprised:'alert',confused:'question',error:'vein',sleepy:'sleep'};
export const ACCENTS={
  question:{name:'Pregunta',color:'#baa2f5',art:'<path d="M-25-25C-25-49 26-52 28-26C30-9 7-7 4 8L3 16" fill="none" stroke="#baa2f5" stroke-width="16" stroke-linecap="round"/><circle cx="2" cy="42" r="9" fill="#baa2f5"/>'},
  alert:{name:'Exclamación',color:'#f49195',art:'<path d="M-17-39C-19-62 20-62 18-39L9 17C8 28-8 28-9 17Z" fill="#f49195"/><circle cy="45" r="10" fill="#f49195"/>'},
  message:{name:'Mensaje',color:'#91c4ed',art:'<path d="M-28-34H28Q45-34 45-17V11Q45 28 28 28H-9L-31 44Q-36 47-34 40L-31 28Q-47 27-47 11V-17Q-47-34-28-34Z" fill="#91c4ed"/><g fill="#447591"><circle cx="-21" cy="-2" r="5"/><circle cy="-2" r="5"/><circle cx="21" cy="-2" r="5"/></g>'},
  star:{name:'Estrella',color:'#f2c85d',art:'<path d="M-6-44Q0-57 6-44L17-22L42-18Q56-16 46-6L27 13L32 40Q35 54 22 47L0 34L-22 47Q-35 54-32 40L-27 13L-46-6Q-56-16-42-18L-17-22Z" fill="#f2c85d"/><path d="M-8-24L-15-11L-28-8" fill="none" stroke="#fff0c0" stroke-width="5" stroke-linecap="round"/>'},
  thought:{name:'Pensando',color:'#adc7df',art:'<path d="M-32 22C-61 19-58-16-35-20C-32-47 0-49 13-30C40-40 60-10 43 9C43 33 11 38-1 24C-9 33-24 32-32 22Z" fill="#adc7df"/><circle cx="-32" cy="42" r="7" fill="#adc7df"/><circle cx="-44" cy="54" r="4" fill="#adc7df"/><g fill="#718c9c"><circle data-thought-dot="0" cx="-23" cy="-1" r="4.5"/><circle data-thought-dot="1" cy="-1" r="4.5"/><circle data-thought-dot="2" cx="23" cy="-1" r="4.5"/></g>'},
  sleep:{name:'Zzz',color:'#9fbce9',art:'<g fill="none" stroke="#9fbce9" stroke-linecap="round" stroke-linejoin="round"><path data-sleep-z="0" stroke-width="6" d="M-45 26H-28L-45 45H-28"/><path data-sleep-z="1" stroke-width="8" d="M-19-4H5L-19 24H5"/><path data-sleep-z="2" stroke-width="9" d="M15-43H45L15-9H45"/></g>'},
  sweat:{name:'Sudor',color:'#7bc3ec',art:'<path d="M0-48C-3-26-30-5-30 18C-30 57 30 57 30 18C30-5 3-26 0-48Z" fill="#7bc3ec"/><path d="M-15 15C-20 25-15 33-9 35" fill="none" stroke="#dcf2fa" stroke-width="7" stroke-linecap="round"/>'},
  vein:{name:'Vena anime',color:'#ef8f98',art:'<g fill="none" stroke="#ef8f98" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"><path d="M-35-9C-15-9-9-15-9-35"/><path d="M9-35C9-15 15-9 35-9"/><path d="M35 9C15 9 9 15 9 35"/><path d="M-9 35C-9 15-15 9-35 9"/></g>'}
};
export const ACCENT_MODES=['auto','none',...Object.keys(ACCENTS)];

export function accentThumbnail(id){
  if(!ACCENTS[id])return '';
  return '<svg class="accent-thumbnail" viewBox="-64 -64 128 128" aria-hidden="true">'+ACCENTS[id].art+'</svg>';
}

export class Accents {
  constructor(svg){
    this.svg=svg;this.current=null;this.count=-1;this.time=0;
    this.items={};
    for(const [id,definition] of Object.entries(ACCENTS)){
      const node=document.createElementNS('http://www.w3.org/2000/svg','g');
      node.setAttribute('data-accent',id);node.setAttribute('opacity','0');
      node.innerHTML=definition.art;
      if(id==='message')node.innerHTML+='<g data-message-badge><rect data-badge-shape x="24" y="-56" width="36" height="36" rx="18" fill="#eea5a4" stroke="#f7f5f1" stroke-width="3"/><text data-message-count x="42" y="-32" text-anchor="middle" font-family="Arial, sans-serif" font-size="21" font-weight="700" fill="#4b3338">3</text></g>';
      if(id==='star')node.innerHTML+='<g data-sparkles fill="#fff0bd"><path d="M-55-48L-51-37L-40-33L-51-29L-55-18L-59-29L-70-33L-59-37Z"/><path d="M50 27L53 35L61 38L53 41L50 49L47 41L39 38L47 35Z"/></g>';
      this.svg.append(node);
      this.items[id]={node,value:0,velocity:0,age:0};
    }
    this.counter=this.svg.querySelector('[data-message-count]');
    this.counterShape=this.svg.querySelector('[data-badge-shape]');
    this.dots=[...this.svg.querySelectorAll('[data-thought-dot]')];
    this.zzz=[...this.svg.querySelectorAll('[data-sleep-z]')];
    this.sparkles=this.svg.querySelector('[data-sparkles]');
  }

  update(dt,time,reaction,config,{immediate=false}={}){
    const requested=config.accentMode==='auto'?(AUTO_ACCENTS[reaction.id]||'none'):config.accentMode;
    const id=requested==='message'&&config.messageCount<1?'none':requested;
    const count=config.messageCount;
    if(id!==this.current||(id==='message'&&count!==this.count)){
      if(this.items[id])this.items[id].age=0;
      this.current=id;
      this.svg.dataset.activeAccent=id;
      this.svg.setAttribute('aria-hidden',String(id==='none'));
      this.svg.setAttribute('aria-label',id==='message'?'Mensaje: '+count+' sin leer':(ACCENTS[id]?.name||'Sin icono'));
    }
    if(count!==this.count){
      const label=count>99?'99+':String(count),wide=label.length>2;
      this.counter.textContent=label;
      this.counter.setAttribute('font-size',wide?'16':label.length===2?'19':'21');
      this.counterShape.setAttribute('x',wide?'17':'24');
      this.counterShape.setAttribute('width',wide?'50':'36');
      this.count=count;
    }
    this.time=time;
    for(const [key,item] of Object.entries(this.items)){
      const target=key===id?1:0;
      if(immediate){item.value=target;item.velocity=0;item.age=1;}
      else{springStep(item,target,dt,190,18);item.age+=dt;}
    }
  }

  render(x,y,size,width,height){
    this.svg.setAttribute('viewBox','0 0 '+width+' '+height);
    const t=this.time;
    for(const [id,item] of Object.entries(this.items)){
      const visible=Math.max(0,Math.min(1,item.value));
      item.node.setAttribute('opacity',String(visible));
      if(visible<.001)continue;
      const pop=Math.exp(-item.age*4.5)*Math.sin(item.age*12)*.16;
      const pulse=id==='vein'?1+.12*Math.pow(Math.max(0,Math.sin(t*5)),4):1;
      const scale=size/128*(.72+item.value*.28+pop)*pulse;
      const float=Math.sin(t*1.8)*size*.025;
      const slide=id==='sweat'?(Math.sin(t*1.8)*.5+.5)**2*size*.12:0;
      const offsetY=id==='vein'?size*.08:0;
      const angle=(id==='question'?-11:id==='alert'?8:id==='star'?-9:id==='sweat'?13:-4)+Math.sin(t*1.4)*3;
      item.node.setAttribute('transform','translate('+x+','+(y+float+slide+offsetY+(1-visible)*12)+') rotate('+angle+') scale('+scale+')');
    }
    this.dots.forEach((dot,i)=>dot.setAttribute('opacity',String(.35+.65*(.5+.5*Math.sin(t*3.3-i*.8)))));
    this.zzz.forEach((z,i)=>{
      const phase=(t*.4+i*.26)%1;
      z.setAttribute('opacity',String(.4+.6*Math.sin(phase*Math.PI)));
      z.setAttribute('transform','translate('+(phase*4)+','+(-phase*11)+')');
    });
    this.sparkles.setAttribute('opacity',String(.65+.35*Math.sin(t*2.5)**2));
    this.sparkles.setAttribute('transform','scale('+(1+Math.sin(t*2.5)*.055)+')');
  }
}
