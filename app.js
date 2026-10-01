import {Mission, W, H, clamp, handControl, mapHand, comfortableBounds, HandSmoother} from './mechanics.js?v=2';
const $=id=>document.getElementById(id);
const canvas=$('game'),ctx=canvas.getContext('2d'),video=$('video'),overlay=$('landmarks'),octx=overlay.getContext('2d');
let state='idle',mode='hand',mission=null,stream=null,worker=null,workerReady=false,busy=false,cameraBusy=false;
let target={x:W/2,y:H*.72},hand=null,lastSeen=0,seenSince=0,pinching=false,mouseDown=false,spaceDown=false;
let lastFrame=0,lastInference=0,lastVideoTime=-1,countdown=3,hold=0,resultSeconds=30,saved=false,pauseReason='manual';
let soundEnabled=false,audio=null,lastSound=0,inferenceFailures=0,cameraEpoch=0;
let calibration=null,customCalibration=false,bounds={left:.32,right:.68,top:.31,bottom:.69};
const handSmoother=new HandSmoother();
const options={duration:60,difficulty:'normal',sensitivity:1.1,mirror:true,autoFire:false};
const STORAGE='corpoMove-ranking-v2';
let records=[],storageAvailable=true;
try{const parsed=JSON.parse(localStorage.getItem(STORAGE)||'[]');if(Array.isArray(parsed))records=parsed.filter(r=>typeof r.name==='string'&&Number.isFinite(r.score)&&r.score>=0&&[60,90,120].includes(r.duration)&&['easy','normal','hard'].includes(r.difficulty)).slice(0,300);}catch{storageAvailable=false;}
const stars=Array.from({length:160},()=>({x:Math.random()*W,y:Math.random()*H,s:.4+Math.random()*1.8,speed:8+Math.random()*30}));
const demoMeteors=Array.from({length:6},(_,i)=>({x:780+Math.random()*450,y:Math.random()*H,r:20+Math.random()*27,angle:i,seed:i*13,hp:1}));
function visible(id,on){$(id).hidden=!on;}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function setState(next){
  state=next;document.body.classList.toggle('playing',!['idle','calibrating'].includes(next));
  for(const [id,s] of Object.entries({intro:'idle',hud:'playing',countdown:'countdown',pause:'paused',result:'result',calibration:'calibrating'}))visible(id,next===s);
  visible('leaderboard',next==='idle');visible('notice',next==='playing');visible('missionBar',next==='playing');visible('bossBar',false);
  if(next==='playing')$('hint').textContent='Pinça: disparar • W: arma • S: escudo • +: reparar • Cristal: pontos';
  else $('hint').textContent='Use seu corpo. Descubra o que a Computação pode criar.';
}
function ranking(){
  $('ranking').replaceChildren();
  const filtered=records.filter(r=>r.duration===options.duration&&r.difficulty===options.difficulty).sort((a,b)=>b.score-a.score).slice(0,5);
  if(!filtered.length){const li=document.createElement('li');li.className='empty-ranking';li.textContent='O primeiro lugar pode ser seu. Aceita a missão?';$('ranking').append(li);}
  filtered.forEach((r,i)=>{const li=document.createElement('li');for(const [cls,text] of [['rank',String(i+1).padStart(2,'0')],['name',r.name],['points',r.score.toLocaleString('pt-BR')]]){const span=document.createElement('span');span.className=cls;span.textContent=text;li.append(span);}$('ranking').append(li);});
  document.querySelector('.board-note').textContent=`${options.duration}s · ${ {easy:'Explorador',normal:'Piloto',hard:'Comandante'}[options.difficulty]} · neste computador`;
  $('storageStatus').textContent=storageAvailable?'Ranking salvo neste navegador.':'Armazenamento indisponível: o ranking permanece somente nesta sessão.';
}
function beep(type){
  if(!soundEnabled||!audio||audio.state!=='running')return;
  if(type==='laser'&&performance.now()-lastSound<140)return;
  if(type==='laser')lastSound=performance.now();
  const table={laser:[750,190,.065,.035,'triangle'],destroy:[170,45,.15,.07,'sawtooth'],hit:[95,30,.27,.1,'sawtooth'],collect:[520,1100,.16,.08,'sine'],start:[320,800,.3,.07,'sine'],finish:[720,240,.4,.07,'triangle']};
  const [f1,f2,len,volume,wave]=table[type]||table.start;
  const oscillator=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime;
  oscillator.type=wave;oscillator.frequency.setValueAtTime(f1,now);oscillator.frequency.exponentialRampToValueAtTime(f2,now+len);
  gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.001,now+len);
  oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(now+len+.01);
}
async function unlockAudio(){try{audio ||= new (window.AudioContext||window.webkitAudioContext)();await audio.resume();}catch{soundEnabled=false;}}
function initializeWorker(){
  if(workerReady)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    worker?.terminate();worker=new Worker(new URL('./tracker-worker.js',import.meta.url));
    let settled=false;const timeout=setTimeout(()=>fail(new Error('O reconhecimento demorou para carregar. Clique em Ativar webcam para tentar novamente.')),45000);
    function fail(error){workerReady=false;busy=false;if(!settled){settled=true;clearTimeout(timeout);worker?.terminate();worker=null;reject(error);}else trackingFailure(error);}
    worker.onerror=event=>fail(new Error(event.message||'Não foi possível iniciar o reconhecimento.'));
    worker.onmessage=({data})=>{
      if(data.type==='ready'){settled=true;clearTimeout(timeout);workerReady=true;resolve();}
      else if(data.type==='result'){busy=false;inferenceFailures=0;updateHand(data.landmarks);}
      else if(data.type==='error')fail(new Error(data.message));
    };
    worker.postMessage({type:'init'});
  });
}
function trackingFailure(error){
  console.error('Rastreamento:',error);workerReady=false;worker?.terminate();worker=null;busy=false;hand=null;pinching=false;
  if(state==='playing'||state==='countdown')pause('camera');
  status('O reconhecimento parou. Ative a webcam novamente.',true);visible('connect',true);visible('start',false);$('connect').disabled=false;
}
async function listCameras(){
  try{const devices=await navigator.mediaDevices.enumerateDevices();const chosen=stream?.getVideoTracks()[0]?.getSettings().deviceId||$('cameraSelect').value;$('cameraSelect').replaceChildren();devices.filter(d=>d.kind==='videoinput').forEach((d,i)=>{const option=document.createElement('option');option.value=d.deviceId;option.textContent=d.label||`Webcam ${i+1}`;$('cameraSelect').append(option);});if(chosen)$('cameraSelect').value=chosen;}catch{}
}
async function connectCamera(){
  if(cameraBusy)return;cameraBusy=true;const epoch=++cameraEpoch;mode='hand';$('connect').disabled=true;$('changeCamera').disabled=true;status('Conectando webcam e preparando reconhecimento…');
  let newStream;
  try{
    if(!window.isSecureContext)throw new Error('Abra pelo endereço HTTPS do GitHub Pages ou por localhost. A webcam não funciona por arquivo ou HTTP comum.');
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Este navegador não oferece acesso à webcam. Use Chrome ou Edge atualizados.');
    const id=$('cameraSelect').value;
    stream?.getTracks().forEach(t=>t.stop());stream=null;hand=null;pinching=false;seenSince=0;
    newStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30},...(id?{deviceId:{exact:id}}:{facingMode:'user'})}});
    if(epoch!==cameraEpoch){newStream.getTracks().forEach(t=>t.stop());return;}
    stream=newStream;video.srcObject=stream;await video.play();
    stream.getVideoTracks()[0].addEventListener('ended',()=>{if(stream===newStream)stopCamera();});
    overlay.width=video.videoWidth||640;overlay.height=video.videoHeight||480;
    visible('camera',true);await listCameras();await initializeWorker();
    if(epoch!==cameraEpoch)return;
    lastVideoTime=-1;inferenceFailures=0;visible('connect',false);visible('start',true);visible('holdWrap',true);status('Webcam pronta. Mostre uma mão aberta por 2 segundos ou clique em Iniciar missão.');
  }catch(error){
    newStream?.getTracks().forEach(t=>t.stop());if(epoch!==cameraEpoch)return;stream=null;video.srcObject=null;visible('camera',false);visible('connect',true);visible('start',false);
    const messages={NotAllowedError:'Permita o acesso à câmera no navegador e clique em Ativar webcam novamente.',NotFoundError:'Nenhuma webcam encontrada. Conecte a câmera USB e tente novamente.',NotReadableError:'A webcam está ocupada. Feche o aplicativo que a utiliza e tente novamente.',OverconstrainedError:'A câmera selecionada não está disponível. Selecione outra em Ajustes.'};
    status(messages[error.name]||`Não foi possível iniciar: ${error.message}`,true);
  }finally{cameraBusy=false;$('connect').disabled=false;$('changeCamera').disabled=false;}
}
function stopCamera(){
  ++cameraEpoch;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;worker?.terminate();worker=null;workerReady=false;busy=false;hand=null;pinching=false;hold=0;
  visible('camera',false);visible('connect',true);visible('start',false);visible('holdWrap',false);
  if(mode==='hand'&&['playing','countdown','paused','calibrating'].includes(state))goIdle();
  status('Webcam desligada. Ative para receber o próximo piloto.');
}
function updateHand(points){
  if(!points){hand=null;pinching=false;seenSince=0;drawLandmarks(null);$('tracking').textContent='Procurando sua mão';$('trackingDot').classList.remove('found');return;}
  const now=performance.now();if(!hand)seenSince=now;
  hand=handControl(points,video.videoWidth,video.videoHeight,pinching);pinching=hand.pinch;lastSeen=now;
  if(mode==='hand')target=handSmoother.filter(mapHand(hand,bounds,options.mirror,options.sensitivity),now/1000);
  $('tracking').textContent=pinching?'Pinça detectada • disparando':'Mão detectada • pilotando';$('trackingDot').classList.add('found');drawLandmarks(points);
}
function drawLandmarks(points){
  const w=overlay.width,h=overlay.height;octx.clearRect(0,0,w,h);
  const cx=(bounds.left+bounds.right)/2,cy=(bounds.top+bounds.bottom)/2,bw=(bounds.right-bounds.left)/options.sensitivity,bh=(bounds.bottom-bounds.top)/options.sensitivity;
  octx.save();octx.setLineDash([7,5]);octx.lineWidth=2;octx.strokeStyle='#c4f95baa';octx.strokeRect(((options.mirror?1-cx:cx)-bw/2)*w,(cy-bh/2)*h,bw*w,bh*h);octx.restore();
  if(!points)return;
  const x=p=>(options.mirror?1-p.x:p.x)*w,y=p=>p.y*h;
  const links=[[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]];
  octx.lineWidth=3;octx.strokeStyle=pinching?'#c4f95b':'#5cf4f1';
  for(const chain of links){octx.beginPath();chain.forEach((i,j)=>j?octx.lineTo(x(points[i]),y(points[i])):octx.moveTo(x(points[i]),y(points[i])));octx.stroke();}
  for(const p of points){octx.fillStyle='#fff';octx.beginPath();octx.arc(x(p),y(p),4,0,Math.PI*2);octx.fill();}
}
async function infer(now){
  if(!workerReady||busy||!stream||video.readyState<2||now-lastInference<33||video.currentTime===lastVideoTime||document.hidden)return;
  busy=true;lastInference=now;lastVideoTime=video.currentTime;
  try{const bitmap=await createImageBitmap(video);if(!worker||!workerReady){bitmap.close();busy=false;return;}worker.postMessage({type:'frame',bitmap,timestamp:performance.now()},[bitmap]);}
  catch(error){busy=false;if(++inferenceFailures>5)trackingFailure(error);}
}
function startMission(control=mode){
  if(!['idle','result'].includes(state)||$('settingsDialog').open)return;
  mode=control;unlockAudio();
  if(mode==='hand'&&(!workerReady||!stream)){status('Ative a webcam antes de iniciar a missão.',true);return;}
  if(mode==='hand'&&(!hand||performance.now()-lastSeen>500)){status('Mostre uma mão para a câmera antes de iniciar.');return;}
  if(mode==='hand'){if(!customCalibration)bounds=comfortableBounds(hand);handSmoother.reset();target=handSmoother.filter(mapHand(hand,bounds,options.mirror,options.sensitivity),performance.now()/1000);}
  mission=new Mission(options.duration,options.difficulty);mission.ship={...target};countdown=3;hold=0;saved=false;mouseDown=false;spaceDown=false;
  $('count').textContent='3';$('countdown').querySelector('small').textContent=mode==='hand'?'PREPARE SUA MÃO':'TESTE COM MOUSE';
  $('countdown').querySelector('p').textContent=mode==='hand'?'Una polegar e indicador para disparar':'Mova o mouse • Clique ou espaço para disparar';
  setState('countdown');beep('start');
}
function pause(reason='manual'){
  if(!['playing','countdown'].includes(state))return;pauseReason=reason;setState('paused');
  $('pauseTitle').textContent=reason==='hand'?'Onde está sua mão?':reason==='camera'?'Reconecte a webcam':'Faça uma pausa.';
  $('pauseText').textContent=reason==='hand'?'Mostre a mão para a webcam. A missão continua automaticamente quando o controle voltar.':reason==='camera'?'Volte ao início e ative a webcam novamente.':'O tempo está parado. Continue quando estiver pronto.';
  visible('resume',reason==='manual');
}
function resume(){
  if(state!=='paused')return;
  if(mode==='hand'&&(!hand||performance.now()-lastSeen>500)){pauseReason='hand';$('pauseTitle').textContent='Onde está sua mão?';$('pauseText').textContent='Mostre a mão para a webcam para continuar.';visible('resume',false);return;}
  countdown=2;setState('countdown');
}
function goIdle(){
  mission=null;hold=0;mode='hand';setState('idle');visible('holdWrap',workerReady&&!!stream);visible('connect',!workerReady||!stream);visible('start',workerReady&&!!stream);ranking();
  if(stream&&workerReady)status('Próximo piloto: mostre uma mão aberta por 2 segundos para começar.');
  $('notice').textContent='';
}
function finish(){
  resultSeconds=30;setState('result');$('finalScore').textContent=mission.score.toLocaleString('pt-BR');
  $('resultTitle').textContent=mode==='mouse'?'Teste concluído.':mission.bossDefeated?'Nave-mãe destruída!':mission.lives>0?'Missão cumprida!':'Boa pilotagem!';
  $('resultDetail').textContent=`${mission.kills} inimigos · ${mission.destroyed} meteoros · combo máximo ${mission.maxCombo} · ${Math.floor(mission.elapsed)}s de voo${mode==='mouse'?' · teste fora do ranking':''}`;
  visible('scoreForm',mode==='hand');$('nickname').value='';$('saveMessage').textContent='';$('returnTime').textContent='30';beep('finish');
}
function saveScore(event){
  event.preventDefault();if(saved||mode!=='hand'||!mission||state!=='result')return;
  const name=$('nickname').value.trim()||'Piloto anônimo';records.push({name:name.slice(0,18),score:mission.score,duration:mission.duration,difficulty:mission.difficulty,date:new Date().toISOString()});
  records=records.sort((a,b)=>b.score-a.score).slice(0,300);saved=true;
  try{localStorage.setItem(STORAGE,JSON.stringify(records));}catch{storageAvailable=false;}
  $('saveMessage').textContent=storageAvailable?'Pontuação salva. Quem assume o próximo voo?':'Salvo nesta sessão. O navegador não permitiu salvar permanentemente.';visible('scoreForm',false);ranking();
}
function beginCalibration(){
  if(!stream||!workerReady){$('settingsDialog').close();status('Ative a webcam antes de calibrar.',true);return;}
  if(state!=='idle'){status('Volte ao início antes de calibrar.');return;}
  $('settingsDialog').close();calibration={step:0,time:0,samples:[],first:null};$('calTitle').textContent='Mão no alto à esquerda';$('calProgress').value=0;setState('calibrating');
}
function calibrationTick(dt){
  const c=calibration;if(!hand||performance.now()-lastSeen>300){c.time=0;c.samples=[];$('calProgress').value=0;return;}
  if(c.samples.length&&Math.hypot(hand.x-c.samples[0].x,hand.y-c.samples[0].y)>.055){c.time=0;c.samples=[];}
  c.samples.push({x:hand.x,y:hand.y});c.time+=dt;$('calProgress').value=Math.min(1,c.time);
  if(c.time<1)return;
  const average={x:c.samples.reduce((s,p)=>s+p.x,0)/c.samples.length,y:c.samples.reduce((s,p)=>s+p.y,0)/c.samples.length};
  if(c.step===0){c.first=average;c.step=1;c.time=-.7;c.samples=[];$('calTitle').textContent='Mão embaixo à direita';$('calProgress').value=0;}
  else{const left=Math.min(c.first.x,average.x),right=Math.max(c.first.x,average.x),top=Math.min(c.first.y,average.y),bottom=Math.max(c.first.y,average.y);goIdle();if(right-left<.15||bottom-top<.15){status('A área ficou pequena. Repita a calibração afastando mais os dois pontos.',true);}else{bounds={left,right,top,bottom};customCalibration=true;handSmoother.reset();status('Calibração concluída. A nave usa sua área confortável de movimento.');}calibration=null;}
}
function fit(){const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(canvas.clientWidth*dpr);canvas.height=Math.round(canvas.clientHeight*dpr);}
function ship(x,y,scale=1,invulnerable=false){
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);if(scale===1&&mission)ctx.rotate(clamp((target.x-x)*.0015,-.28,.28));ctx.globalAlpha=invulnerable ? .58 : 1;
  ctx.shadowBlur=25;ctx.shadowColor='#5cf4f1';
  const flame=18+Math.random()*16;
  ctx.fillStyle='#5cf4f1';ctx.beginPath();ctx.moveTo(-8,23);ctx.lineTo(0,23+flame);ctx.lineTo(8,23);ctx.fill();
  ctx.fillStyle='#c4f95b';ctx.beginPath();ctx.moveTo(-4,23);ctx.lineTo(0,30+flame);ctx.lineTo(4,23);ctx.fill();
  ctx.shadowBlur=8;ctx.fillStyle='#203b56';ctx.strokeStyle='#7deeff';ctx.lineWidth=1.6;
  ctx.beginPath();ctx.moveTo(0,-33);ctx.lineTo(12,-6);ctx.lineTo(29,20);ctx.lineTo(13,15);ctx.lineTo(10,27);ctx.lineTo(-10,27);ctx.lineTo(-13,15);ctx.lineTo(-29,20);ctx.lineTo(-12,-6);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#ebfaff';ctx.beginPath();ctx.moveTo(0,-29);ctx.lineTo(8,19);ctx.lineTo(0,13);ctx.lineTo(-8,19);ctx.closePath();ctx.fill();
  ctx.fillStyle='#5cf4f1';ctx.beginPath();ctx.ellipse(0,-4,4,10,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#c4f95b';ctx.fillRect(-23,13,5,4);ctx.fillRect(18,13,5,4);
  if(invulnerable){ctx.strokeStyle='#5cf4f155';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,43,0,Math.PI*2);ctx.stroke();}ctx.restore();
}
function meteor(m){
  ctx.save();ctx.translate(m.x,m.y);ctx.rotate(m.angle);ctx.strokeStyle=m.hp>1?'#ffc89a':'#a49a9d';ctx.lineWidth=2;
  const gradient=ctx.createRadialGradient(-m.r*.3,-m.r*.4,0,0,0,m.r);gradient.addColorStop(0,'#7d6b6a');gradient.addColorStop(1,'#2c2833');ctx.fillStyle=gradient;
  ctx.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI*2/10,r=m.r*(.8+.2*Math.sin(m.seed+i*4)**2);i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#15172388';ctx.beginPath();ctx.ellipse(-m.r*.25,-m.r*.1,m.r*.24,m.r*.2,.2,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(m.r*.3,m.r*.3,m.r*.14,0,Math.PI*2);ctx.fill();ctx.restore();
}
function spaceBackground(now){
  const t=now/1000;
  for(const [x,y,r,color] of [[W*.22+Math.sin(t*.06)*80,H*.25,430,'#503b8b30'],[W*.77,H*.55+Math.cos(t*.08)*60,420,'#0e7d8740']]){
    const gradient=ctx.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,color);gradient.addColorStop(1,'#070b1800');ctx.fillStyle=gradient;ctx.fillRect(0,0,W,H);
  }
  ctx.save();ctx.translate(1030,245);ctx.rotate(-.35);ctx.strokeStyle='#5cf4f112';ctx.lineWidth=10;ctx.beginPath();ctx.ellipse(0,0,240,52,0,0,Math.PI*2);ctx.stroke();
  const planet=ctx.createRadialGradient(-35,-40,0,0,0,100);planet.addColorStop(0,'#264764');planet.addColorStop(.65,'#172c49');planet.addColorStop(1,'#09101e');ctx.fillStyle=planet;ctx.beginPath();ctx.arc(0,0,98,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#75c9ff20';ctx.lineWidth=2;ctx.stroke();ctx.restore();
}
function enemyShip(e,now){
  ctx.save();ctx.translate(e.x,e.y);ctx.rotate(Math.PI);const size=e.type==='gunner'?1.3:1;ctx.scale(size,size);
  ctx.shadowColor='#ff559b';ctx.shadowBlur=18;ctx.strokeStyle='#ff83b5';ctx.lineWidth=2;ctx.fillStyle='#392445';
  ctx.beginPath();ctx.moveTo(0,-26);ctx.lineTo(13,-7);ctx.lineTo(32,10);ctx.lineTo(22,19);ctx.lineTo(9,10);ctx.lineTo(0,17);ctx.lineTo(-9,10);ctx.lineTo(-22,19);ctx.lineTo(-32,10);ctx.lineTo(-13,-7);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#ffc0d9';ctx.beginPath();ctx.ellipse(0,-4,5,10,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#ff559b';ctx.fillRect(-20,10,5,8+Math.sin(now/70)*3);ctx.fillRect(15,10,5,8+Math.sin(now/70)*3);ctx.restore();
  if(e.hp<e.maxHp){ctx.fillStyle='#ff559b';ctx.fillRect(e.x-24,e.y-39,48*e.hp/e.maxHp,3);}
}
function bossShip(b,now){
  ctx.save();ctx.translate(b.x,b.y);ctx.shadowColor='#e858ff';ctx.shadowBlur=28;ctx.strokeStyle='#e69dff';ctx.lineWidth=2;ctx.fillStyle='#2c2144';
  ctx.beginPath();ctx.moveTo(-115,-25);ctx.lineTo(-60,-48);ctx.lineTo(-25,-30);ctx.lineTo(0,-45);ctx.lineTo(25,-30);ctx.lineTo(60,-48);ctx.lineTo(115,-25);ctx.lineTo(100,30);ctx.lineTo(65,45);ctx.lineTo(40,15);ctx.lineTo(0,46);ctx.lineTo(-40,15);ctx.lineTo(-65,45);ctx.lineTo(-100,30);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.strokeStyle='#ff559b';ctx.lineWidth=4;for(const x of [-80,-50,50,80]){ctx.beginPath();ctx.moveTo(x,-18);ctx.lineTo(x,15);ctx.stroke();}
  ctx.fillStyle='#ff559b';ctx.beginPath();ctx.arc(0,0,22+Math.sin(now/110)*3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffe7fb';ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e69dff';ctx.fillRect(-70,30,10,20);ctx.fillRect(60,30,10,20);ctx.restore();
}
function drawPickup(p,now){
  const colors={weapon:'#5cf4f1',shield:'#ad8cff',repair:'#ffcf70',crystal:'#c4f95b'},color=colors[p.type]||'#c4f95b';
  ctx.save();ctx.translate(p.x,p.y);ctx.shadowBlur=20;ctx.shadowColor=color;ctx.strokeStyle=color;ctx.fillStyle=color+'25';ctx.lineWidth=2;
  const r=17+Math.sin(now/180)*2;ctx.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3-Math.PI/2;i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();ctx.stroke();
  ctx.shadowBlur=0;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 16px Segoe UI';ctx.fillStyle=color;ctx.fillText({weapon:'W',shield:'S',repair:'+',crystal:'◆'}[p.type]||'◆',0,1);ctx.restore();
}
function draw(now,dt){
  ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);ctx.clearRect(0,0,W,H);
  spaceBackground(now);
  if(mission?.shake>0&&state==='playing')ctx.translate((Math.random()-.5)*mission.shake*28,(Math.random()-.5)*mission.shake*24);
  const active=['playing','countdown','paused','result'].includes(state);
  ctx.strokeStyle='#5cf4f108';ctx.lineWidth=1;for(let x=0;x<W;x+=80){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=0;y<H;y+=80){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  for(const s of stars){s.y=(s.y+dt*s.speed*(state==='playing'?2.5:1))%H;ctx.fillStyle=`rgba(187,222,255,${s.s/3})`;ctx.fillRect(s.x,s.y,s.s,s.s*(state==='playing'?2:1));}
  if(!active){
    ctx.save();ctx.strokeStyle='#5cf4f111';ctx.lineWidth=1;for(const r of [140,235,330]){ctx.beginPath();ctx.arc(970,385,r,0,Math.PI*2);ctx.stroke();}ctx.restore();
    for(const m of demoMeteors){m.y+=dt*22;m.angle+=dt*.15;if(m.y>H+60)m.y=-60;ctx.globalAlpha=.5;meteor(m);ctx.globalAlpha=1;}
    ship(950+Math.sin(now/1300)*40,405+Math.cos(now/1100)*25,2.6);
    if(state==='idle'&&hand&&mode==='hand'){ctx.fillStyle='#5cf4f188';ctx.beginPath();ctx.arc(target.x,target.y,6,0,Math.PI*2);ctx.fill();}
    return;
  }
  if(!mission)return;
  for(const b of mission.bullets){ctx.shadowBlur=16;ctx.shadowColor='#c4f95b';ctx.fillStyle='#dfff98';ctx.fillRect(b.x-2,b.y-12,4,18);ctx.shadowBlur=0;}
  for(const m of mission.meteors)meteor(m);
  for(const e of mission.enemies)enemyShip(e,now);
  if(mission.boss)bossShip(mission.boss,now);
  for(const b of mission.hostile){ctx.shadowBlur=18;ctx.shadowColor='#ff559b';ctx.fillStyle='#ff559b';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff0f7';ctx.beginPath();ctx.arc(b.x,b.y,3,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
  for(const p of mission.pickups)drawPickup(p,now);
  for(const p of mission.particles){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,4,4);}ctx.globalAlpha=1;
  ship(mission.ship.x,mission.ship.y,1,mission.invulnerable>0);
  if(mission.shield>0){ctx.strokeStyle='#ad8cff';ctx.lineWidth=3;ctx.shadowColor='#ad8cff';ctx.shadowBlur=18;ctx.beginPath();ctx.arc(mission.ship.x,mission.ship.y,44+Math.sin(now/120)*3,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;}
  for(const t of mission.texts){ctx.globalAlpha=Math.min(1,t.life*2);ctx.fillStyle=t.color;ctx.font='bold 20px Segoe UI';ctx.textAlign='center';ctx.fillText(t.text,t.x,t.y);}ctx.globalAlpha=1;
  if(mission.flash>0){ctx.fillStyle=`rgba(255,65,100,${mission.flash*1.1})`;ctx.fillRect(0,0,W,H);}
  if(state==='playing'){
    $('score').textContent=String(mission.score).padStart(5,'0');$('time').textContent=String(Math.ceil(mission.duration-mission.elapsed)).padStart(2,'0');$('lives').textContent=Array.from({length:3},(_,i)=>i<mission.lives?'●':'○').join(' ');
    const multiplier=mission.multiplier;
    $('phase').textContent=mission.boss?'NAVE-MÃE':`SETOR 0${mission.wave}`;
    $('weapon').textContent=mission.weapon===1?'LASER DUPLO':mission.weapon===2?'LASER TRIPLO':'LASER QUÍNTUPLO';
    $('combo').textContent=multiplier>1?`${mission.combo} COMBO • ×${multiplier}`:'DESTRUA EM SEQUÊNCIA';
    $('combo').classList.toggle('boosted',multiplier>1);
    $('weaponProgress').style.width=`${mission.weapon>1?mission.weaponTime/12*100:0}%`;
    visible('bossBar',!!mission.boss);
    if(mission.boss){$('bossHealth').style.width=`${mission.boss.hp/mission.boss.maxHp*100}%`;$('bossPercent').textContent=`${Math.ceil(mission.boss.hp/mission.boss.maxHp*100)}%`;}
    visible('notice',mission.announcementTime>0);
    $('notice').textContent=mission.announcement;

  }
}
function tick(now){
  const dt=Math.min(.05,Math.max(0,(now-lastFrame)/1000));lastFrame=now;infer(now);
  const handFresh=!!hand&&now-lastSeen<400;
  if(state==='idle'&&mode==='hand'&&workerReady&&!$('settingsDialog').open){hold=handFresh&&hand.open?hold+dt:0;$('holdBar').style.width=`${Math.min(1,hold/2)*100}%`;if(hold>=2)startMission('hand');}
  if(state==='countdown'){
    if(mode==='hand'&&now-lastSeen>600)pause('hand');
    else{countdown-=dt;$('count').textContent=String(Math.max(1,Math.ceil(countdown)));if(countdown<=0)setState('playing');}
  }
  if(state==='playing'){
    if(mode==='hand'&&now-lastSeen>600)pause('hand');
    else{mission.update(dt,target,options.autoFire||(mode==='hand'?pinching:mouseDown||spaceDown));for(const event of mission.events)beep(event);if(mission.finished)finish();}
  }
  if(state==='paused'&&pauseReason==='hand'&&handFresh&&now-seenSince>800)resume();
  if(state==='result'&&!$('settingsDialog').open&&document.activeElement!==$('nickname')){resultSeconds-=dt;$('returnTime').textContent=String(Math.ceil(resultSeconds));if(resultSeconds<=0)goIdle();}
  if(state==='calibrating')calibrationTick(dt);
  draw(now,dt);requestAnimationFrame(tick);
}
$('connect').addEventListener('click',connectCamera);$('start').addEventListener('click',()=>startMission('hand'));
$('demo').addEventListener('click',()=>{target={x:W/2,y:H*.72};startMission('mouse');});
$('again').addEventListener('click',goIdle);$('quit').addEventListener('click',goIdle);$('resume').addEventListener('click',resume);$('scoreForm').addEventListener('submit',saveScore);
$('settings').addEventListener('click',()=>{if(['playing','countdown'].includes(state))pause('manual');$('settingsDialog').showModal();listCameras();});
$('changeCamera').addEventListener('click',async()=>{goIdle();await connectCamera();});$('stopCamera').addEventListener('click',()=>{stopCamera();$('settingsDialog').close();});
$('resetControl').addEventListener('click',()=>{customCalibration=false;options.sensitivity=1.1;$('sensitivity').value='1.1';$('sensitivityValue').textContent='1.1×';bounds=hand?comfortableBounds(hand):{left:.32,right:.68,top:.31,bottom:.69};handSmoother.reset();status('Controle automático: pequenos movimentos, centralizados na sua mão a cada missão.');});
$('calibrate').addEventListener('click',beginCalibration);$('cancelCal').addEventListener('click',()=>{calibration=null;goIdle();});
$('duration').addEventListener('change',e=>{options.duration=Number(e.target.value);ranking();});$('difficulty').addEventListener('change',e=>{options.difficulty=e.target.value;ranking();});
$('sensitivity').addEventListener('input',e=>{options.sensitivity=Number(e.target.value);$('sensitivityValue').textContent=options.sensitivity.toFixed(1)+'×';});
$('autoFire').addEventListener('change',e=>options.autoFire=e.target.value==='auto');$('mirror').addEventListener('change',e=>{options.mirror=e.target.checked;video.style.transform=options.mirror?'scaleX(-1)':'none';});
$('clearRanking').addEventListener('click',()=>{if(confirm('Apagar todas as pontuações deste computador?')){records=[];try{localStorage.removeItem(STORAGE);}catch{storageAvailable=false;}ranking();}});
$('sound').addEventListener('click',async()=>{soundEnabled=!soundEnabled;if(soundEnabled)await unlockAudio();$('sound').textContent=`Som: ${soundEnabled?'ligado':'desligado'}`;$('sound').setAttribute('aria-label',soundEnabled?'Desativar som':'Ativar som');beep('start');});
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{status('Use F11 no navegador para exibir em tela cheia.');}}
$('fullscreen').addEventListener('click',fullscreen);document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'Sair da tela cheia ↙':'Tela cheia ↗';fit();});
canvas.addEventListener('pointermove',e=>{if(mode!=='mouse')return;const rect=canvas.getBoundingClientRect();target={x:clamp((e.clientX-rect.left)/rect.width*W,35,W-35),y:clamp((e.clientY-rect.top)/rect.height*H,110,H-70)};});
canvas.addEventListener('pointerdown',e=>{if(mode==='mouse'){mouseDown=true;canvas.setPointerCapture(e.pointerId);}});window.addEventListener('pointerup',()=>mouseDown=false);canvas.addEventListener('pointercancel',()=>mouseDown=false);
document.addEventListener('keydown',e=>{
  if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName)||$('settingsDialog').open)return;
  if(e.code==='Space'){e.preventDefault();spaceDown=true;}
  if(e.key.toLowerCase()==='f')fullscreen();
  if(e.key.toLowerCase()==='p'){state==='paused'?resume():pause('manual');}
  if(e.key==='Escape')pause('manual');
  if(e.key==='Enter'&&state==='idle')startMission('hand');
});document.addEventListener('keyup',e=>{if(e.code==='Space')spaceDown=false;});
window.addEventListener('blur',()=>{mouseDown=false;spaceDown=false;if(['playing','countdown'].includes(state))pause('manual');});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&['playing','countdown'].includes(state))pause('manual');});
window.addEventListener('resize',fit);window.addEventListener('pagehide',()=>{stream?.getTracks().forEach(t=>t.stop());worker?.terminate();});
ranking();fit();requestAnimationFrame(tick);
