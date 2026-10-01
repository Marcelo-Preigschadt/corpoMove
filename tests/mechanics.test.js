import test from 'node:test';
import assert from 'node:assert/strict';
import {Mission,handControl,mapHand,W,H} from '../mechanics.js';
test('Mapeamento espelhado, saturação e sensibilidade',()=>{
  const bounds={left:.2,right:.8,top:.2,bottom:.8};
  assert.equal(mapHand({x:.2,y:.2},bounds,true).x,W-45);
  assert.equal(mapHand({x:.8,y:.8},bounds,true).x,45);
  assert.ok(Math.abs(mapHand({x:.5,y:.5},bounds,false).x-W/2)<1e-9);
  assert.equal(mapHand({x:-1,y:3},bounds,false).y,H-85);
});
test('Pinça proporcional à palma e histerese entre os limiares',()=>{
  const points=Array.from({length:21},()=>({x:.5,y:.5}));points[5]={x:.4,y:.5};points[17]={x:.6,y:.5};
  points[4]={x:.5,y:.3};points[8]={x:.55,y:.3};
  assert.equal(handControl(points,640,480).pinch,true);
  points[8].x=.58;
  assert.equal(handControl(points,640,480,false).pinch,false);
  assert.equal(handControl(points,640,480,true).pinch,true);
});
test('Tiro destrói meteoro e pontua uma única vez',()=>{
  const m=new Mission(60,'normal',()=>.5);m.spawn=10;m.drop=10;m.ship={x:640,y:500};
  m.meteors=[{x:630,y:458,r:24,speed:0,vx:0,angle:0,spin:0,hp:1,seed:0}];
  m.update(.02,{x:640,y:500},true);
  assert.equal(m.destroyed,1);assert.equal(m.score,100);assert.equal(m.meteors.length,0);
  m.update(.02,{x:640,y:500},false);assert.equal(m.score,100);
});
test('Colisão concede invulnerabilidade e não desconta várias vidas no mesmo quadro',()=>{
  const m=new Mission();m.invulnerable=0;m.spawn=10;m.drop=10;
  m.meteors=Array.from({length:3},()=>({x:m.ship.x,y:m.ship.y,r:24,speed:0,vx:0,angle:0,spin:0,hp:1,seed:0}));
  m.update(.01,{...m.ship},false);assert.equal(m.lives,2);assert.ok(m.invulnerable>0);
  m.update(.01,{...m.ship},false);assert.equal(m.lives,2);
});
test('Cronômetro encerra a missão e simulação não avança depois do fim',()=>{
  const m=new Mission(1);m.spawn=10;m.drop=10;m.update(1,{...m.ship},false);assert.equal(m.finished,true);assert.equal(m.elapsed,1);
  const score=m.score;m.update(10,{x:0,y:0},true);assert.equal(m.elapsed,1);assert.equal(m.score,score);
});
test('Cristal coleta e meteoro desviado geram pontuação',()=>{
  const m=new Mission();m.spawn=10;m.drop=10;m.pickups=[{...m.ship}];
  m.meteors=[{x:50,y:H+80,r:20,speed:0,vx:0,angle:0,spin:0,hp:1,seed:0}];
  m.update(.01,{...m.ship},false);assert.equal(m.score,160);assert.equal(m.dodged,1);assert.equal(m.pickups.length,0);
});

test('Área confortável permite alcançar os lados sem sair do quadro da câmera',async()=>{
 const {comfortableBounds}=await import('../mechanics.js');const hand={x:.5,y:.5};const b=comfortableBounds(hand);
 assert.ok(b.left>=.2&&b.right<=.8);
 assert.equal(mapHand({x:.33,y:.5},b,true,1.1).x,W-45);
 assert.equal(mapHand({x:.67,y:.5},b,true,1.1).x,45);
});
test('Filtro reduz tremor e acompanha deslocamento rápido',async()=>{
 const {HandSmoother}=await import('../mechanics.js');const f=new HandSmoother();f.filter({x:640,y:400},0);
 const jitter=f.filter({x:645,y:400},.033);assert.ok(jitter.x>640&&jitter.x<645);
 const fast=f.filter({x:950,y:400},.066);assert.ok(fast.x>900);
});
test('Arma, escudo e reparo são coletados e afetam a missão',()=>{
 const m=new Mission();m.spawn=10;m.drop=10;m.enemySpawn=10;m.lives=2;
 m.pickups=['weapon','shield','repair'].map(type=>({...m.ship,type}));m.update(.01,{...m.ship},false);
 assert.equal(m.weapon,2);assert.equal(m.shield,12);assert.equal(m.lives,3);
 m.invulnerable=0;assert.equal(m.damage(),true);assert.equal(m.lives,3);assert.equal(m.shield,0);
});
test('Combo amplia pontuação e expira',()=>{
 const m=new Mission();for(let i=0;i<4;i++)m.award(100,100,100);
 assert.equal(m.multiplier,2);assert.equal(m.score,500);
 m.comboTime=.01;m.spawn=10;m.drop=10;m.enemySpawn=10;m.update(.02,{...m.ship},false);assert.equal(m.combo,0);
});
test('Chefe aparece no setor final, ataca e encerra a missão ao ser destruído',()=>{
 const m=new Mission(60,'normal',()=>.5);m.spawn=100;m.drop=100;m.enemySpawn=100;m.elapsed=38;
 m.update(.02,{...m.ship},false);assert.ok(m.boss);assert.equal(m.wave,3);
 m.boss.y=150;m.boss.fire=0;m.update(.02,{...m.ship},false);assert.ok(m.hostile.length>0);
 const hp=m.boss.hp,x=m.boss.x,y=m.boss.y;
 m.bullets=Array.from({length:hp},()=>({x,y:y+8.5,vx:0}));m.update(.01,{...m.ship},false);
 assert.equal(m.bossDefeated,true);assert.equal(m.finished,true);assert.ok(m.score>=2500);
});
