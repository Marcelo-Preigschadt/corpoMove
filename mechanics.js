// Simulação independente do DOM. Coordenadas lógicas: 1280 × 720.
export const W=1280,H=720;
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function handControl(points,width=640,height=480,wasPinching=false){
 const distance=(a,b)=>Math.hypot((a.x-b.x)*width,(a.y-b.y)*height);
 const palm=[0,5,9,13,17].map(i=>points[i]);
 const x=palm.reduce((s,p)=>s+p.x,0)/5,y=palm.reduce((s,p)=>s+p.y,0)/5;
 const ratio=distance(points[4],points[8])/Math.max(8,distance(points[5],points[17]));
 const pinch=ratio<(wasPinching ? .50 : .34);
 const open=!pinch&&[8,12,16,20].filter(i=>distance(points[i],points[0])>distance(points[i-2],points[0])*1.15).length>=3;
 return {x,y,pinch,open,ratio};
}
export function mapHand(hand,bounds,mirror=true,sensitivity=1){
 let nx=(hand.x-bounds.left)/(bounds.right-bounds.left),ny=(hand.y-bounds.top)/(bounds.bottom-bounds.top);
 if(mirror)nx=1-nx;
 nx=clamp((nx-.5)*sensitivity+.5,0,1);ny=clamp((ny-.5)*sensitivity+.5,0,1);
 return {x:45+nx*(W-90),y:135+ny*(H-220)};
}
export function comfortableBounds(hand){
 // A mão percorre somente 36% da imagem; centro individual a cada missão.
 const x=clamp(hand.x,.22,.78),y=clamp(hand.y,.23,.77);
 return {left:x-.18,right:x+.18,top:y-.19,bottom:y+.19};
}
export class HandSmoother{
 constructor(){this.reset();}
 reset(){this.value=null;this.previous=null;this.velocity={x:0,y:0};this.time=0;}
 filter(point,now){
  if(!this.value||now-this.time>.3){this.value={...point};this.previous={...point};this.time=now;return {...point};}
  const dt=clamp(now-this.time,.001,.1),a=1-Math.exp(-dt*2*Math.PI);
  for(const axis of ['x','y']){
   const velocity=(point[axis]-this.previous[axis])/dt;
   this.velocity[axis]+=a*(velocity-this.velocity[axis]);
   // Menos oscilação parado, maior largura de banda em movimentos rápidos.
   const cutoff=2.0+.014*Math.abs(this.velocity[axis]);
   const alpha=1-Math.exp(-dt*2*Math.PI*cutoff);
   this.value[axis]+=alpha*(point[axis]-this.value[axis]);
  }
  this.previous={...point};this.time=now;return {...this.value};
 }
}
export class Mission{
 constructor(duration=60,difficulty='normal',random=Math.random){
  Object.assign(this,{duration,difficulty,random,elapsed:0,score:0,lives:3,ship:{x:W/2,y:H*.72},meteors:[],bullets:[],pickups:[],particles:[],enemies:[],hostile:[],texts:[],spawn:.4,drop:3,enemySpawn:1.2,shot:0,invulnerable:1.5,destroyed:0,dodged:0,kills:0,finished:false,events:[],wave:1,combo:0,comboTime:0,maxCombo:0,weapon:1,weaponTime:0,shield:0,boss:null,bossSpawned:false,bossDefeated:false,shake:0,flash:0,announcement:'SETOR 01 • CINTURÃO DE ASTEROIDES',announcementTime:2.4});
 }
 get multiplier(){return 1+Math.min(4,Math.floor(this.combo/4));}
 get factor(){return {easy:.72,normal:1,hard:1.3}[this.difficulty]||1;}
 burst(x,y,color,count=24){for(let i=0;i<count;i++){const a=this.random()*Math.PI*2,s=60+this.random()*260;this.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.4+this.random()*.6,color});}}
 announce(text){this.announcement=text;this.announcementTime=2.3;this.events.push('start');}
 award(points,x,y,combo=true){
  if(combo){this.combo++;this.maxCombo=Math.max(this.maxCombo,this.combo);this.comboTime=3.5;}
  const earned=points*this.multiplier;this.score+=earned;
  this.texts.push({x,y,text:`+${earned}`,color:this.multiplier>1?'#c4f95b':'#fff',life:1});
 }
 damage(){
  if(this.invulnerable>0)return false;
  if(this.shield>0){this.shield=0;this.invulnerable=.8;this.burst(this.ship.x,this.ship.y,'#a88bff',35);this.events.push('collect');return true;}
  this.lives--;this.invulnerable=1.5;this.combo=0;this.comboTime=0;this.shake=.32;this.flash=.18;
  this.burst(this.ship.x,this.ship.y,'#5cf4f1',38);this.events.push('hit');return true;
 }
 enemyBullet(x,y,vx,vy){this.hostile.push({x,y,vx,vy,r:7});}
 aimedBullet(x,y,speed){const dx=this.ship.x-x,dy=this.ship.y-y,len=Math.max(1,Math.hypot(dx,dy));this.enemyBullet(x,y,dx/len*speed,dy/len*speed);}
 spawnEnemy(){
  const count=this.wave>=2?3:2,center=120+this.random()*(W-240);
  for(let i=0;i<count;i++){
   const type=this.wave>=2&&i===1?'gunner':'scout',x=clamp(center+(i-(count-1)/2)*85,50,W-50);
   this.enemies.push({x,y:-45-i*30,baseX:x,r:type==='gunner'?30:23,type,hp:type==='gunner'?5:2,maxHp:type==='gunner'?5:2,speed:(type==='gunner'?95:135)*this.factor,age:i*.7,fire:1.2+i*.2,dead:false});
  }
 }
 update(dt,target,firing){
  if(this.finished)return;
  this.events=[];this.elapsed=Math.min(this.duration,this.elapsed+dt);
  const alpha=1-Math.exp(-dt*32);this.ship.x+=(target.x-this.ship.x)*alpha;this.ship.y+=(target.y-this.ship.y)*alpha;
  for(const key of ['invulnerable','comboTime','weaponTime','shield','announcementTime','shake','flash'])this[key]=Math.max(0,this[key]-dt);
  if(this.comboTime===0)this.combo=0;
  if(this.weaponTime===0)this.weapon=1;
  const progress=this.elapsed/this.duration,nextWave=progress<.25?1:progress<.62?2:3;
  if(nextWave!==this.wave){this.wave=nextWave;if(nextWave===2)this.announce('SETOR 02 • ESQUADRÃO INIMIGO');}
  if(progress>=.62&&!this.bossSpawned){this.bossSpawned=true;const hp=Math.round(95*this.factor);this.boss={x:W/2,y:-110,hp,maxHp:hp,age:0,fire:1.8,pattern:0};this.announce('ALERTA • NAVE-MÃE DETECTADA');this.hostile=[];}
  this.shot-=dt;
  if(firing&&this.shot<=0){
   const spread=this.weapon===3?[-.3,-.15,0,.15,.3]:this.weapon===2?[-.17,0,.17]:[0,0];
   spread.forEach((angle,i)=>this.bullets.push({x:this.ship.x+(this.weapon===1?(i===0?-10:10):0),y:this.ship.y-22,vx:Math.sin(angle)*850}));
   this.shot=this.weapon>1?.13:.16;this.events.push('laser');
  }
  this.spawn-=dt;this.drop-=dt;this.enemySpawn-=dt;
  if(this.spawn<=0){const r=19+this.random()*27;this.meteors.push({x:40+this.random()*(W-80),y:-r,r,speed:(135+this.random()*100+progress*90)*this.factor,vx:(this.random()-.5)*80,angle:this.random()*6.28,spin:(this.random()-.5)*2,hp:r>36?2:1,seed:this.random()*100});this.spawn=(this.boss?1.1:.78-progress*.25)/this.factor;}
  if(this.enemySpawn<=0){if(!this.boss)this.spawnEnemy();this.enemySpawn=(this.wave===1?4.6:3.1)/this.factor;}
  if(this.drop<=0){const types=['weapon','crystal','shield','weapon','repair'];const type=types[Math.floor(this.random()*types.length)];this.pickups.push({x:100+this.random()*(W-200),y:-20,type});this.drop=4.5+this.random()*2;}
  for(const b of this.bullets){b.y-=850*dt;b.x+=(b.vx||0)*dt;}
  for(const m of this.meteors){
   m.y+=m.speed*dt;m.x+=m.vx*dt;m.angle+=m.spin*dt;
   for(const b of this.bullets)if(!b.dead&&m.hp>0&&Math.hypot(b.x-m.x,b.y-m.y)<m.r){b.dead=true;if(--m.hp<=0){this.destroyed++;this.award(100,m.x,m.y);this.burst(m.x,m.y,'#ffb66d');this.events.push('destroy');}}
   if(m.hp>0&&Math.hypot(this.ship.x-m.x,this.ship.y-m.y)<m.r+15&&this.damage())m.hp=0;
   if(m.hp>0&&m.y>H+m.r){m.hp=0;this.dodged++;this.score+=10;}
  }
  for(const e of this.enemies){
   e.age+=dt;e.y+=e.speed*dt;e.x=e.baseX+Math.sin(e.age*2)*(e.type==='gunner'?45:75);e.fire-=dt;
   if(e.fire<=0&&e.y>45&&e.y<H-100){this.aimedBullet(e.x,e.y+20,(e.type==='gunner'?200:155)*this.factor);if(e.type==='gunner'){this.enemyBullet(e.x,e.y,95,180);this.enemyBullet(e.x,e.y,-95,180);}e.fire=(e.type==='gunner'?1.9:2.8)/this.factor;}
   for(const b of this.bullets)if(!b.dead&&!e.dead&&Math.hypot(b.x-e.x,b.y-e.y)<e.r){b.dead=true;if(--e.hp<=0){e.dead=true;this.kills++;this.award(e.type==='gunner'?350:200,e.x,e.y);this.burst(e.x,e.y,'#ff6faf',32);this.events.push('destroy');if(this.random()<.22)this.pickups.push({x:e.x,y:e.y,type:'weapon'});}}
   if(!e.dead&&Math.hypot(this.ship.x-e.x,this.ship.y-e.y)<e.r+16&&this.damage())e.dead=true;
   if(e.y>H+60)e.dead=true;
  }
  if(this.boss){
   const boss=this.boss;boss.age+=dt;boss.y=Math.min(215,boss.y+105*dt);boss.x=W/2+Math.sin(boss.age*.75)*340;boss.fire-=dt;
   if(boss.y>95&&boss.fire<=0){
    boss.pattern++;
    if(boss.pattern%3===0){this.aimedBullet(boss.x-65,boss.y+45,240*this.factor);this.aimedBullet(boss.x+65,boss.y+45,240*this.factor);}
    else for(let i=-3;i<=3;i++){const a=i*.22+Math.sin(boss.age)*.12;this.enemyBullet(boss.x,boss.y+45,Math.sin(a)*210*this.factor,Math.cos(a)*210*this.factor);}
    boss.fire=1.1/this.factor;
   }
   for(const b of this.bullets)if(!b.dead&&Math.abs(b.x-boss.x)<110&&Math.abs(b.y-boss.y)<48){b.dead=true;boss.hp--;this.burst(b.x,b.y,'#ff6faf',3);}
   if(Math.abs(this.ship.x-boss.x)<118&&Math.abs(this.ship.y-boss.y)<62)this.damage();
   if(boss.hp<=0){this.award(2500,boss.x,boss.y,false);this.burst(boss.x,boss.y,'#ff6faf',100);this.burst(boss.x,boss.y,'#c4f95b',70);this.shake=.5;this.bossDefeated=true;this.boss=null;this.hostile=[];this.announce('NAVE-MÃE DESTRUÍDA • VITÓRIA');}
  }
  for(const b of this.hostile){b.x+=b.vx*dt;b.y+=b.vy*dt;if(Math.hypot(b.x-this.ship.x,b.y-this.ship.y)<b.r+14&&this.damage())b.dead=true;}
  for(const p of this.pickups){
   p.y+=140*dt;
   if(Math.hypot(p.x-this.ship.x,p.y-this.ship.y)<38){
    p.dead=true;this.award(150,p.x,p.y,false);this.burst(p.x,p.y,'#c4f95b',18);this.events.push('collect');
    if(p.type==='weapon'){this.weapon=Math.min(3,this.weapon+1);this.weaponTime=12;this.announce(this.weapon===3?'ARMA MELHORADA • LASER QUÍNTUPLO':'ARMA MELHORADA • LASER TRIPLO');}
    if(p.type==='shield'){this.shield=12;this.announce('ESCUDO ATIVO • 12 SEGUNDOS');}
    if(p.type==='repair'){this.lives=Math.min(3,this.lives+1);this.announce('NAVE REPARADA • +1 VIDA');}
   }
  }
  for(const p of this.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}
  for(const t of this.texts){t.y-=45*dt;t.life-=dt;}
  this.bullets=this.bullets.filter(b=>!b.dead&&b.y>-30&&b.x>-50&&b.x<W+50);this.meteors=this.meteors.filter(m=>m.hp>0);this.enemies=this.enemies.filter(e=>!e.dead);this.hostile=this.hostile.filter(b=>!b.dead&&b.y<H+30&&b.y>-50&&b.x>-30&&b.x<W+30);this.pickups=this.pickups.filter(p=>!p.dead&&p.y<H+30);this.particles=this.particles.filter(p=>p.life>0);this.texts=this.texts.filter(t=>t.life>0);
  if(this.elapsed>=this.duration||this.lives<=0||this.bossDefeated){this.finished=true;this.events.push('finish');}
 }
}
