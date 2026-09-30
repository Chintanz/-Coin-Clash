const socket=io();const $=id=>document.getElementById(id);const canvas=$('canvas'),ctx=canvas.getContext('2d');let state=null,myId=null,profileId='cc_profile';let keys={};let audioCtx;
const renderPlayers=new Map();let lastFrame=performance.now();let animationStarted=false;let lastRound=0;let lastPhase='';
const storedName=localStorage.getItem('cc_name');if(storedName)$('name').value=storedName;
function sound(freq=600,dur=.06){try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=freq;o.connect(g);g.connect(audioCtx.destination);g.gain.value=.04;o.start();o.stop(audioCtx.currentTime+dur)}catch(e){}}
function join(opts){
  if(!socket.connected){$('queue').textContent='Connecting to game server...';return;}
  const name=($('name').value||'Player').trim().slice(0,16)||'Player';
  localStorage.setItem('cc_name',name);
  $('queue').textContent='Creating room...';
  socket.emit('join',{name,...opts});
}
$('quick').onclick=()=>{
  if(!socket.connected){$('queue').textContent='Connecting to game server...';return;}
  const name=($('name').value||'Player').trim()||'Player';
  localStorage.setItem('cc_name',name);
  $('queue').textContent='Searching for players...';
  socket.emit('quickPlay',{name,mode:$('mode').value});
};
$('create').onclick=()=>join({mode:$('mode').value,map:$('map').value==='random'?null:$('map').value,privateRoom:true});
$('join').onclick=()=>{const code=$('roomCode').value.trim().toUpperCase();if(!code){$('queue').textContent='Enter a room code first.';return;}join({roomId:code});};
socket.on('roomCreated',x=>{
  $('queue').textContent = x.privateRoom ? `Private room: ${x.roomId} | Share this code with friends.` : `Room ${x.roomId} ready${x.solo?' (solo)':''}.`;
  if($('roomInfo')) $('roomInfo').textContent=`ROOM ${x.roomId}`;
});socket.on('queue',x=>$('queue').textContent=x);socket.on('connect',()=>{$('status').textContent='🟢 Online';myId=socket.id});socket.on('disconnect',()=>{$('status').textContent='🔴 Offline'});socket.on('errorMessage',m=>{$('lobby').hidden=false;$('game').hidden=true;$('queue').textContent=m;alert(m)});
socket.on('reaction',r=>{const el=$('reaction');el.hidden=false;el.textContent=`${r.emoji} ${r.name}`;setTimeout(()=>el.hidden=true,1200);});
socket.on('chat',()=>{});
socket.on('state',s=>{
  const isNewRound=s.round!==lastRound || (lastPhase==='round_over'&&s.phase==='playing');
  state=s;$('game').hidden=false;$('lobby').hidden=true;
  for(const p of s.players){
    const old=renderPlayers.get(p.id);
    if(!old || isNewRound || lastPhase==='round_over'){
      renderPlayers.set(p.id,{...p,rx:p.x,ry:p.y,tx:p.x,ty:p.y});
    }else{
      old.tx=p.x;old.ty=p.y;Object.assign(old,p);
    }
  }
  for(const id of renderPlayers.keys()) if(!s.players.some(p=>p.id===id)) renderPlayers.delete(id);
  lastRound=s.round;lastPhase=s.phase;renderUI();startAnimation();
});
function renderUI(){if(!state)return;if($('roomInfo'))$('roomInfo').textContent=`ROOM ${state.id}`;if($('modeInfo'))$('modeInfo').textContent=state.mode.toUpperCase();$('roundInfo').textContent=`ROUND ${state.round} • ${state.mode.toUpperCase()}`;$('mapInfo').textContent=state.mapName;const remain=state.phase==='playing'?Math.max(0,Math.ceil((state.roundEndsAt-Date.now())/1000)):Math.max(0,Math.ceil((state.overEndsAt-Date.now())/1000));$('timer').textContent=state.phase==='round_over'?'OVER':remain;$('scoreboard').innerHTML=state.players.slice().sort((a,b)=>b.score-a.score).map((p,i)=>`<div class="score ${p.id===myId?'me':''}"><span>${i<3?['🥇','🥈','🥉'][i]:'•'}</span><span>${escapeHtml(p.name)}</span><strong>${p.score}</strong></div>`).join('');if(state.phase==='round_over'){const w=state.winner;showOverlay(`<div class="overlay-card"><h2>🏆 ROUND OVER</h2><p>${w?escapeHtml(w.name):'No winner'} won with <b>${w?.score||0}</b> coins.</p><p>Next round in <b>${remain}</b></p></div>`)}else hideOverlay();}
function showOverlay(html){const overlay=$('overlay');overlay.innerHTML=html;overlay.hidden=false;overlay.className='overlay'}function hideOverlay(){const overlay=$('overlay');overlay.hidden=true;overlay.innerHTML='';overlay.className=''}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function startAnimation(){if(animationStarted)return;animationStarted=true;lastFrame=performance.now();requestAnimationFrame(animationFrame)}
function animationFrame(now){
  const dt=Math.min(50,now-lastFrame);lastFrame=now;
  if(state){
    const smoothing=1-Math.pow(0.001,dt/1000);
    for(const p of renderPlayers.values()){p.rx+=(p.tx-p.rx)*smoothing;p.ry+=(p.ty-p.ry)*smoothing;}
    draw();
  }
  requestAnimationFrame(animationFrame);
}
function draw(){if(!state)return;ctx.clearRect(0,0,800,440);ctx.fillStyle='#0e1430';ctx.fillRect(0,0,800,440);drawGrid();drawWalls();for(const c of state.coins)drawCoin(c);for(const u of state.powerups)drawPower(u);for(const p of renderPlayers.values())drawPlayer(p);if(state.event){ctx.fillStyle='#ffd166';ctx.font='900 22px system-ui';ctx.textAlign='center';ctx.fillText(eventName(state.event),400,32)}}
function drawGrid(){ctx.strokeStyle='#18204a';ctx.lineWidth=1;for(let x=0;x<800;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,440);ctx.stroke()}for(let y=0;y<440;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(800,y);ctx.stroke()}}
function drawWalls(){ctx.fillStyle='#303b6f';for(const w of ({arena:[],maze:[[120,80,260,18],[120,80,18,180],[360,80,260,18],[602,80,18,180],[120,320,260,18],[120,320,18,150],[360,320,260,18],[602,320,18,150],[300,160,18,110],[420,250,18,110]],treasure:[[260,140,160,18],[260,140,18,100],[420,140,18,100],[260,342,160,18],[260,242,18,100],[420,242,18,100]],ice:[[190,90,220,14],[190,356,220,14],[130,160,14,140],[456,160,14,140]]}[state.map]||[])){ctx.fillRect(...w)}}
function drawCoin(c){const colors={gold:'#ffd166',blue:'#74b9ff',purple:'#a29bfe',red:'#ff7675',diamond:'#55efc4'};ctx.fillStyle=colors[c.type];ctx.beginPath();ctx.arc(c.x,c.y,c.type==='diamond'?9:7,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff9';ctx.stroke();ctx.fillStyle='#11162d';ctx.font='bold 8px system-ui';ctx.textAlign='center';ctx.fillText(c.value,c.x,c.y+3)}
function drawPower(u){const icons={speed:'⚡',magnet:'🧲',shield:'🛡️',double:'2×',ghost:'👻',teleport:'🌀',freeze:'❄️',steal:'💰'};ctx.font='20px serif';ctx.textAlign='center';ctx.fillText(icons[u.type]||'?',u.x,u.y+7)}
function drawPlayer(p){const skins={classic:'●',ninja:'🥷',robot:'🤖',alien:'👽',king:'👑'};ctx.globalAlpha=(p.effects?.ghost>Date.now())?0.7:1;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.rx,p.ry,15,0,Math.PI*2);ctx.fill();ctx.font='18px serif';ctx.textAlign='center';ctx.fillText(skins[p.skin]||'●',p.rx,p.ry+7);ctx.globalAlpha=1;ctx.fillStyle='#fff';ctx.font='bold 11px system-ui';ctx.fillText(p.name,p.rx,p.ry-22)}
function eventName(e){return {double_coins:'⚡ DOUBLE COINS!',coin_rain:'🌧️ COIN RAIN!',magnet_storm:'🧲 MAGNET STORM!'}[e]||e}
function send(){socket.emit('input',keys)}
setInterval(()=>{if(socket.connected)send()},100);document.addEventListener('keydown',e=>{const k=e.key.toLowerCase();const m={w:'up',arrowup:'up',s:'down',arrowdown:'down',a:'left',arrowleft:'left',d:'right',arrowright:'right'}[k];if(m){keys[m]=true;e.preventDefault();send()}});document.addEventListener('keyup',e=>{const k=e.key.toLowerCase();const m={w:'up',arrowup:'up',s:'down',arrowdown:'down',a:'left',arrowleft:'left',d:'right',arrowright:'right'}[k];if(m){keys[m]=false;send()}});
document.querySelectorAll('[data-dir]').forEach(b=>{const d=b.dataset.dir;const down=e=>{e.preventDefault();keys[d]=true;send()};const up=e=>{e.preventDefault();keys[d]=false;send()};b.addEventListener('pointerdown',down);b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('pointerleave',up)});
function react(e){socket.emit('reaction',e);sound(800,.08)}window.react=react;function leaveGame(){location.reload()}window.leaveGame=leaveGame;
document.querySelectorAll('[data-skin]').forEach(b=>b.onclick=()=>{socket.emit('setSkin',b.dataset.skin);document.querySelectorAll('[data-skin]').forEach(x=>x.classList.remove('active'));b.classList.add('active')});
async function loadMeta(){try{const r=await fetch('/api/leaderboard');const data=await r.json();$('leaderboard').innerHTML=data.length?data.map((p,i)=>`<div class="lbrow"><span>${i+1}</span><span>${escapeHtml(p.name)}</span><strong>Lv.${p.level} • ${p.wins} wins</strong></div>`).join(''):'No champions yet. Humanity remains unproven.'}catch(e){$('leaderboard').textContent='Leaderboard unavailable'}}loadMeta();setInterval(loadMeta,10000);$('daily').innerHTML='<b>Daily challenges</b><br>🪙 Collect 100 coins<br>🏆 Win 3 rounds<br>💎 Find a diamond';$('profile').innerHTML='Play rounds to earn XP, levels, wins and achievements.';
setInterval(()=>{if(state)renderUI()},250);

$('copyRoom')?.addEventListener('click',async()=>{const code=state?.id;if(!code)return;try{await navigator.clipboard.writeText(code);$('copyRoom').textContent='COPIED!';setTimeout(()=>$('copyRoom').textContent='COPY ROOM CODE',1200)}catch(e){prompt('Room code:',code)}});
