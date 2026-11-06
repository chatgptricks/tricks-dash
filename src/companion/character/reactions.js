export const DEFAULT_EYES = {widthL:64,widthR:64,heightL:111,heightR:111,gap:46,tiltL:0,tiltR:0,liftL:0,liftR:0,curveL:0,curveR:0,closed:0,shine:1,lookX:0,lookY:0};
export const REACTIONS = [
  {id:'idle',name:'En reposo',moment:'Entre conversaciones',description:'Respira, parpadea y espera tu siguiente idea.',eyes:{},body:{},duration:4200},
  {id:'attentive',name:'Atento',moment:'Llega un mensaje',description:'Abre la mirada y se acerca un poquito.',eyes:{heightL:121,heightR:121,widthL:66,widthR:66,lookY:-3},body:{stretch:.22,forward:.16},duration:3500},
  {id:'curious',name:'Curioso',moment:'Algo le interesa',description:'Inclina el cuerpo y levanta un ojo con curiosidad.',eyes:{heightL:116,heightR:94,liftL:-6,liftR:5,tiltL:-6,tiltR:4,lookX:7,lookY:-4},body:{bend:.35,roll:-.11},duration:3800},
  {id:'thinking',name:'Pensando',moment:'Busca una respuesta',description:'Mira hacia arriba mientras se balancea suavemente.',eyes:{heightL:94,heightR:90,lookX:13,lookY:-12,tiltL:-3,tiltR:-3},body:{bend:-.17,roll:.06},duration:4400},
  {id:'working',name:'Trabajando',moment:'Ejecuta una tarea',description:'Entrecierra los ojos y mantiene un pulso constante.',eyes:{heightL:65,heightR:65,widthL:66,widthR:66,liftL:7,liftR:7,tiltL:7,tiltR:-7,shine:.7},body:{squash:.15,forward:.08},duration:4500},
  {id:'happy',name:'Contento',moment:'Una buena noticia',description:'Los ojos dibujan una sonrisa; el cuerpo se relaja.',eyes:{heightL:18,heightR:18,widthL:68,widthR:68,curveL:34,curveR:34,liftL:-2,liftR:-2,closed:1,shine:0},body:{squash:.14,stretch:.07},duration:3600},
  {id:'celebrate',name:'Celebrando',moment:'Tarea completada',description:'Sonríe con los ojos y da pequeños saltos elásticos.',eyes:{heightL:21,heightR:21,widthL:72,widthR:72,curveL:40,curveR:40,liftL:-4,liftR:-4,closed:1,shine:0},body:{stretch:.12},duration:4200},
  {id:'surprised',name:'Sorprendido',moment:'Algo inesperado',description:'Se estira de golpe y abre mucho la mirada.',eyes:{heightL:128,heightR:128,widthL:77,widthR:77,gap:49,lookY:-3},body:{stretch:.65,forward:.15},duration:3200},
  {id:'confused',name:'Confundido',moment:'Necesita contexto',description:'Alterna la inclinación con una mirada asimétrica.',eyes:{heightL:114,heightR:63,widthL:61,widthR:68,liftL:-7,liftR:13,tiltL:-12,tiltR:9,lookX:-5},body:{bend:-.32,roll:.09},duration:4200},
  {id:'sleepy',name:'Con sueño',moment:'Un rato sin actividad',description:'Los párpados caen y todo se mueve más despacio.',eyes:{heightL:29,heightR:26,widthL:66,widthR:66,liftL:17,liftR:19,tiltL:3,tiltR:-3,shine:.15},body:{squash:.53,roll:-.04},duration:4500},
  {id:'error',name:'Preocupado',moment:'Algo salió mal',description:'Baja la mirada y se encoge un poco antes de intentar de nuevo.',eyes:{heightL:84,heightR:84,widthL:62,widthR:62,liftL:9,liftR:9,tiltL:-16,tiltR:16,lookY:8,shine:.75},body:{squash:.35,bend:.1,roll:.04},duration:3800},
  {id:'greeting',name:'Saludando',moment:'Te da la bienvenida',description:'Se balancea para saludarte y termina con un guiño.',eyes:{heightL:111,heightR:106,widthL:67,widthR:67,lookY:-2},body:{stretch:.12},duration:4400}
];
export const reactionById = Object.fromEntries(REACTIONS.map(r=>[r.id,r]));

export function springStep(state, target, dt, stiffness=150, damping=20) {
  const step = Math.min(dt, 1/30);
  state.velocity += (target-state.value)*stiffness*step;
  state.velocity *= Math.exp(-damping*step);
  state.value += state.velocity*step;
  return state.value;
}

export function eyePath(width,height,curve=0) {
  const w=Math.max(8,width), h=Math.max(3,height), x=w/2, y=h/2;
  const r=Math.min(x,y), k=.5522847498;
  const p=(px,py)=>px.toFixed(2)+','+(py+curve*(4*px*px/(w*w)-.5)).toFixed(2);
  const arch=curve*4*(x-r)*(x-r)/(w*w);
  return 'M'+p(-x+r,-y)+'Q'+p(0,-y-arch)+' '+p(x-r,-y)+
    'C'+p(x-r+k*r,-y)+' '+p(x,-y+r-k*r)+' '+p(x,-y+r)+
    'L'+p(x,y-r)+'C'+p(x,y-r+k*r)+' '+p(x-r+k*r,y)+' '+p(x-r,y)+
    'Q'+p(0,y-arch)+' '+p(-x+r,y)+'C'+p(-x+r-k*r,y)+' '+p(-x,y-r+k*r)+' '+p(-x,y-r)+
    'L'+p(-x,-y+r)+'C'+p(-x,-y+r-k*r)+' '+p(-x+r-k*r,-y)+' '+p(-x+r,-y)+'Z';
}

export function eyeThumbnail(reaction) {
  const e={...DEFAULT_EYES,...reaction.eyes};
  let s='<svg class="eye-preview" viewBox="-108 -80 216 160" aria-hidden="true">';
  for (const side of ['L','R']) {
    const x=side==='L'?-e.gap:e.gap;
    s+='<g transform="translate('+x+','+e['lift'+side]+') rotate('+e['tilt'+side]+')">';
    if(e.closed){
      const half=e['width'+side]*.43;
      s+='<path fill="none" stroke="#26331e" stroke-width="10" stroke-linecap="round" d="M'+(-half)+',4 Q0,'+(-2-e['curve'+side]*1.4)+' '+half+',4"/>';
    }else{
      s+='<path fill="#26331e" d="'+eyePath(e['width'+side],e['height'+side],e['curve'+side])+'"/>';
    }
    if(e.shine>.4)s+='<ellipse cx="-10" cy="'+(-e['height'+side]*.27)+'" rx="10" ry="13" fill="#f9faf6"/>';
    s+='</g>';
  }
  return s+'</svg>';
}
