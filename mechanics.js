// Funções independentes do DOM: controle e simulação usam coordenadas lógicas 1280×720.
export const W = 1280, H = 720;
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function handControl(points, width = 640, height = 480, wasPinching = false) {
  const distance = (a, b) => Math.hypot((a.x-b.x)*width, (a.y-b.y)*height);
  const palm = [0, 5, 9, 13, 17].map(i => points[i]);
  const x = palm.reduce((sum, p) => sum+p.x, 0)/palm.length;
  const y = palm.reduce((sum, p) => sum+p.y, 0)/palm.length;
  const ratio = distance(points[4], points[8])/Math.max(8, distance(points[5], points[17]));
  // Histerese evita alternância involuntária no limiar de pinça.
  const pinch = ratio < (wasPinching ? 0.50 : 0.34);
  const open = !pinch && [8,12,16,20].filter(i => distance(points[i],points[0]) > distance(points[i-2],points[0])*1.15).length >= 3;
  return {x, y, pinch, open, ratio};
}
export function mapHand(hand, bounds, mirror = true, sensitivity = 1) {
  let nx = (hand.x-bounds.left)/(bounds.right-bounds.left);
  let ny = (hand.y-bounds.top)/(bounds.bottom-bounds.top);
  if(mirror) nx = 1-nx;
  nx = clamp((nx-.5)*sensitivity+.5,0,1);
  ny = clamp((ny-.5)*sensitivity+.5,0,1);
  return {x:45+nx*(W-90), y:135+ny*(H-220)};
}
export class Mission {
  constructor(duration=60,difficulty='normal',random=Math.random){
    this.random=random;this.duration=duration;this.difficulty=difficulty;
    this.elapsed=0;this.score=0;this.lives=3;this.ship={x:W/2,y:H*.72};
    this.meteors=[];this.bullets=[];this.pickups=[];this.particles=[];
    this.spawn=.4;this.drop=4;this.shot=0;this.invulnerable=1.5;this.destroyed=0;this.dodged=0;this.finished=false;this.events=[];
  }
  burst(x,y,color,count=18){for(let i=0;i<count;i++){const a=this.random()*Math.PI*2,s=60+this.random()*210;this.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+this.random()*.5,color});}}
  update(dt,target,firing){
    if(this.finished)return;
    this.events=[];this.elapsed=Math.min(this.duration,this.elapsed+dt);
    const alpha=1-Math.exp(-dt*14);
    this.ship.x+=(target.x-this.ship.x)*alpha;this.ship.y+=(target.y-this.ship.y)*alpha;
    this.invulnerable=Math.max(0,this.invulnerable-dt);this.shot-=dt;
    if(firing&&this.shot<=0){this.bullets.push({x:this.ship.x-10,y:this.ship.y-22},{x:this.ship.x+10,y:this.ship.y-22});this.shot=.18;this.events.push('laser');}
    const factor={easy:.72,normal:1,hard:1.35}[this.difficulty]||1;
    const progress=this.elapsed/this.duration;
    this.spawn-=dt;this.drop-=dt;
    if(this.spawn<=0){const r=19+this.random()*27;this.meteors.push({x:40+this.random()*(W-80),y:-r,r,speed:(135+this.random()*100+progress*100)*factor,vx:(this.random()-.5)*80,angle:this.random()*6.28,spin:(this.random()-.5)*2,hp:r>36?2:1,seed:this.random()*100});this.spawn=(.72-progress*.28)/factor;}
    if(this.drop<=0){this.pickups.push({x:80+this.random()*(W-160),y:-20});this.drop=5+this.random()*3;}
    for(const b of this.bullets)b.y-=760*dt;
    for(const m of this.meteors){m.y+=m.speed*dt;m.x+=m.vx*dt;m.angle+=m.spin*dt;
      for(const b of this.bullets){if(!b.dead&&m.hp>0&&Math.hypot(b.x-m.x,b.y-m.y)<m.r){b.dead=true;m.hp--;if(m.hp<=0){this.destroyed++;this.score+=100;this.burst(m.x,m.y,'#ffb66d',24);this.events.push('destroy');}}}
      if(m.hp>0&&this.invulnerable===0&&Math.hypot(this.ship.x-m.x,this.ship.y-m.y)<m.r+15){this.lives--;this.invulnerable=1.5;m.hp=0;this.burst(this.ship.x,this.ship.y,'#5cf4f1',28);this.events.push('hit');}
      if(m.hp>0&&m.y>H+m.r){m.hp=0;this.dodged++;this.score+=10;}
    }
    for(const p of this.pickups){p.y+=150*dt;if(Math.hypot(p.x-this.ship.x,p.y-this.ship.y)<35){p.dead=true;this.score+=150;this.burst(p.x,p.y,'#c4f95b',15);this.events.push('collect');}}
    for(const p of this.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}
    this.bullets=this.bullets.filter(b=>!b.dead&&b.y>-20);this.meteors=this.meteors.filter(m=>m.hp>0);this.pickups=this.pickups.filter(p=>!p.dead&&p.y<H+30);this.particles=this.particles.filter(p=>p.life>0);
    if(this.elapsed>=this.duration||this.lives<=0){this.finished=true;this.events.push('finish');}
  }
}
