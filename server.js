const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 6;
const ROUND_SECONDS = 60;
const ROUND_OVER_SECONDS = 5;
const TICK_MS = 100;

const maps = {
  arena: { name: 'Coin Arena', walls: [] },
  maze: { name: 'Crystal Maze', walls: [
    [120,80,260,18],[120,80,18,180],[360,80,260,18],[602,80,18,180],
    [120,320,260,18],[120,320,18,150],[360,320,260,18],[602,320,18,150],
    [300,160,18,110],[420,250,18,110]
  ]},
  treasure: { name: 'Treasure Island', walls: [[260,140,160,18],[260,140,18,100],[420,140,18,100],[260,342,160,18],[260,242,18,100],[420,242,18,100]] },
  ice: { name: 'Ice Arena', walls: [[190,90,220,14],[190,356,220,14],[130,160,14,140],[456,160,14,140]] }
};

const modes = ['classic','double','chaos'];
const rooms = new Map();
const quickQueue = [];
const profiles = new Map();

function makeRoom(id, mode='classic', mapKey=null, privateRoom=false) {
  return { id, mode, selectedMap: mapKey || null, mapKey: mapKey || randomMap(), privateRoom, players:new Map(), phase:'waiting', round:0,
    roundEndsAt:0, overEndsAt:0, winner:null, event:null, eventEndsAt:0, coins:[], powerups:[], lastSpawn:0 };
}
function randomMap(){ return Object.keys(maps)[Math.floor(Math.random()*Object.keys(maps).length)]; }
function spawnPoint(){ return {x:50+Math.random()*700,y:50+Math.random()*360}; }
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function pointHitsWall(x,y,r,w){return x+r>w[0]&&x-r<w[0]+w[2]&&y+r>w[1]&&y-r<w[1]+w[3]}
function validPosition(room,x,y){ return x>=20&&x<=780&&y>=20&&y<=420&&!maps[room.mapKey].walls.some(w=>pointHitsWall(x,y,15,w)); }
function newCoin(room){
  const roll=Math.random(); let type='gold', value=1;
  if(roll<0.04){type='diamond';value=25}else if(roll<0.12){type='red';value=10}else if(roll<0.28){type='purple';value=5}else if(roll<0.50){type='blue';value=3}
  if(room.mode==='double') value*=2;
  let p=spawnPoint(); for(let i=0;i<20&&!validPosition(room,p.x,p.y);i++) p=spawnPoint();
  return {id:Math.random().toString(36).slice(2),x:p.x,y:p.y,type,value};
}
function newPowerup(room){
  const types=['speed','magnet','shield','double','ghost','teleport','freeze','steal'];
  const type=types[Math.floor(Math.random()*types.length)]; let p=spawnPoint();
  return {id:Math.random().toString(36).slice(2),x:p.x,y:p.y,type};
}
function ensureProfile(id,name){
  let p=profiles.get(id); if(!p) p={id,name,wins:0,xp:0,level:1,coins:0,achievements:[],daily:{date:new Date().toISOString().slice(0,10),coins:0,wins:0}};
  p.name=name||p.name||'Player'; if(!p.daily||p.daily.date!==new Date().toISOString().slice(0,10)) p.daily={date:new Date().toISOString().slice(0,10),coins:0,wins:0};
  profiles.set(id,p); return p;
}
function addXP(p,n){p.xp+=n; const old=p.level; p.level=1+Math.floor(p.xp/100); return p.level>old}
function startRound(room){
  room.phase='playing'; room.round++;
  room.mapKey = room.selectedMap || (room.round === 1 ? room.mapKey : randomMap()); room.roundEndsAt=Date.now()+ROUND_SECONDS*1000; room.winner=null; room.event=null; room.eventEndsAt=0; room.coins=[]; room.powerups=[]; room.lastSpawn=0;
  for(const p of room.players.values()){p.score=0;p.input={};p.effects={speed:0,magnet:0,shield:0,double:0,ghost:0,freeze:0};p.x=spawnPoint().x;p.y=spawnPoint().y;}
  for(let i=0;i<18;i++) room.coins.push(newCoin(room));
}
function roundWinner(room){return [...room.players.values()].sort((a,b)=>b.score-a.score)[0]||null}
function finishRound(room){
  room.phase='round_over'; room.overEndsAt=Date.now()+ROUND_OVER_SECONDS*1000; room.winner=roundWinner(room); room.event=null;
  if(room.winner){const p=ensureProfile(room.winner.profileId,room.winner.name);p.wins++;p.coins+=room.winner.score;addXP(p,50);p.daily.wins++;if(room.winner.score>=50&&!p.achievements.includes('highscore'))p.achievements.push('highscore');if(p.wins>=10&&!p.achievements.includes('champion'))p.achievements.push('champion');}
}
function publicRoom(room){
  return {id:room.id,phase:room.phase,round:room.round,map:room.mapKey,mapName:maps[room.mapKey].name,mode:room.mode,roundEndsAt:room.roundEndsAt,overEndsAt:room.overEndsAt,winner:room.winner?{name:room.winner.name,score:room.winner.score}:null,event:room.event,eventEndsAt:room.eventEndsAt,coins:room.coins,powerups:room.powerups,players:[...room.players.values()].map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,score:p.score,color:p.color,skin:p.skin,effects:p.effects}))};
}
function emitRoom(room){io.to(room.id).emit('state',publicRoom(room));}
function createRoom(socket,name,opts={}){
  const id=opts.id||Math.random().toString(36).slice(2,8).toUpperCase();
  const room=makeRoom(id,opts.mode||'classic',opts.map||null,!!opts.privateRoom); rooms.set(id,room); joinRoom(socket,room,name); return room;
}
function joinRoom(socket,room,name){
  if(room.players.size>=MAX_PLAYERS) return false;
  const profile=ensureProfile(socket.id,name);
  const colors=['#55efc4','#74b9ff','#ff7675','#a29bfe','#ffeaa7','#fd79a8'];
  const p={id:socket.id,profileId:socket.id,name:profile.name||'Player',x:100,y:100,score:0,color:colors[room.players.size],skin:'classic',input:{},effects:{speed:0,magnet:0,shield:0,double:0,ghost:0,freeze:0},lastSteal:0};
  room.players.set(socket.id,p); socket.join(room.id); socket.data.roomId=room.id; if(room.phase==='waiting'&&room.players.size>=1) startRound(room); emitRoom(room); return true;
}
function removeFromQueue(socket){const i=quickQueue.indexOf(socket);if(i>=0)quickQueue.splice(i,1)}

io.on('connection',socket=>{
  socket.on('join',({name,roomId,mode,map,privateRoom}={})=>{
    if(socket.data.roomId)return;
    if(roomId){let room=rooms.get(roomId);if(!room) room=createRoom(socket,name,{id:roomId,mode:mode||'classic',map,privateRoom:true});else if(!joinRoom(socket,room,name)){socket.emit('errorMessage','Room is full or unavailable.');return;} socket.emit('roomCreated',{roomId:room.id,privateRoom:room.privateRoom,mode:room.mode,map:room.mapKey});return;}
    const room=createRoom(socket,name,{mode:mode||'classic',map,privateRoom});
    socket.emit('roomCreated',{roomId:room.id,privateRoom:room.privateRoom,mode:room.mode,map:room.mapKey});
  });
  socket.on('quickPlay',({name,mode='classic'}={})=>{
    if(socket.data.roomId)return;
    removeFromQueue(socket);
    socket.data.name = (name || 'Player').trim().slice(0,16) || 'Player';
    const waiting = quickQueue.findIndex(s => s.connected && !s.data.roomId && s.data.quickMode === mode);
    if(waiting >= 0){
      const opponent = quickQueue.splice(waiting,1)[0];
      const room=createRoom(opponent,opponent.data.name,{mode,privateRoom:false});
      joinRoom(socket,room,socket.data.name);
      io.to(room.id).emit('roomCreated',{roomId:room.id,privateRoom:false,mode:room.mode,map:room.mapKey});
    } else {
      socket.data.quickMode = mode;
      quickQueue.push(socket);
      socket.emit('queue','Searching for another player... Starting a solo room in 3 seconds if nobody joins.');
      setTimeout(()=>{
        const i=quickQueue.indexOf(socket);
        if(i>=0 && socket.connected && !socket.data.roomId){
          quickQueue.splice(i,1);
          const room=createRoom(socket,socket.data.name,{mode,privateRoom:false});
          socket.emit('roomCreated',{roomId:room.id,privateRoom:false,mode:room.mode,map:room.mapKey,solo:true});
        }
      },3000);
    }
  });
  socket.on('input',input=>{const room=rooms.get(socket.data.roomId),p=room?.players.get(socket.id);if(p)p.input=input||{}});
  socket.on('setSkin',skin=>{const room=rooms.get(socket.data.roomId),p=room?.players.get(socket.id);if(p&&['classic','ninja','robot','alien','king'].includes(skin))p.skin=skin});
  socket.on('reaction',emoji=>{const room=rooms.get(socket.data.roomId);if(room)io.to(room.id).emit('reaction',{name:room.players.get(socket.id)?.name,emoji})});
  socket.on('chat',msg=>{const room=rooms.get(socket.data.roomId);if(room&&typeof msg==='string')io.to(room.id).emit('chat',{name:room.players.get(socket.id)?.name,msg:msg.slice(0,80)})});
  socket.on('disconnect',()=>{removeFromQueue(socket);const room=rooms.get(socket.data.roomId);if(room){room.players.delete(socket.id);if(!room.players.size)rooms.delete(room.id);else emitRoom(room)}});
});

setInterval(()=>{
  const now=Date.now();
  for(const room of rooms.values()){
    if(room.phase==='waiting')continue;
    if(room.phase==='round_over'){if(now>=room.overEndsAt){startRound(room)}emitRoom(room);continue}
    if(now>=room.roundEndsAt){finishRound(room);emitRoom(room);continue}
    if(now-room.lastSpawn>1600&&room.coins.length<24){room.coins.push(newCoin(room));room.lastSpawn=now}
    if(now%7000<120){if(room.powerups.length<3)room.powerups.push(newPowerup(room))}
    const eventChance = room.mode==='chaos' ? 0.06 : 0.015;
    if(!room.event&&now>room.roundEndsAt-25000&&Math.random()<eventChance){const events=['double_coins','coin_rain','magnet_storm'];room.event=events[Math.floor(Math.random()*events.length)];room.eventEndsAt=now+8000;if(room.event==='coin_rain')for(let i=0;i<(room.mode==='chaos'?25:15);i++)room.coins.push(newCoin(room));
      if(room.mode==='chaos' && Math.random()<0.35){ for(const p of room.players.values()){ if(Math.random()<0.35) p.effects.speed=now+2500; } }}
    if(room.event&&now>=room.eventEndsAt)room.event=null;
    for(const p of room.players.values()){
      const frozen=p.effects.freeze>now; const speed=(p.effects.speed>now?5:3.2)*(frozen?0.35:1); let dx=0,dy=0;
      if(p.input.up)dy-=1;if(p.input.down)dy+=1;if(p.input.left)dx-=1;if(p.input.right)dx+=1;if(dx&&dy){dx*=.707;dy*=.707}
      let nx=clamp(p.x+dx*speed,20,780),ny=clamp(p.y+dy*speed,20,420);if(validPosition(room,nx,ny)){p.x=nx;p.y=ny}
      const magnet=p.effects.magnet>now||room.event==='magnet_storm';
      if(magnet)for(const c of room.coins){const d=dist(p,c);if(d<120){c.x+=(p.x-c.x)*0.08;c.y+=(p.y-c.y)*0.08}}
      for(let i=room.coins.length-1;i>=0;i--){const c=room.coins[i];if(dist(p,c)<22){p.score+=c.value*(p.effects.double>now||room.event==='double_coins'?2:1);const prof=ensureProfile(p.profileId,p.name);prof.daily.coins+=c.value;room.coins.splice(i,1);if(p.score>=100&&!prof.achievements.includes('collector'))prof.achievements.push('collector')}}
      for(let i=room.powerups.length-1;i>=0;i--){const u=room.powerups[i];if(dist(p,u)<24){applyPowerup(room,p,u.type);room.powerups.splice(i,1)}}
    }
    emitRoom(room);
  }
},TICK_MS);

function applyPowerup(room,p,type){const now=Date.now();if(type==='speed')p.effects.speed=now+6000;if(type==='magnet')p.effects.magnet=now+7000;if(type==='shield')p.effects.shield=now+8000;if(type==='double')p.effects.double=now+7000;if(type==='ghost')p.effects.ghost=now+7000;if(type==='freeze'){for(const q of room.players.values())if(q.id!==p.id)q.effects.freeze=now+2500}if(type==='teleport'){const s=spawnPoint();p.x=s.x;p.y=s.y}if(type==='steal'&&now-p.lastSteal>5000){const target=[...room.players.values()].filter(q=>q.id!==p.id).sort((a,b)=>b.score-a.score)[0];if(target&&target.score>0){const n=Math.min(3,target.score);target.score-=n;p.score+=n;p.lastSteal=now}}}

app.get('/api/leaderboard',(req,res)=>{res.json([...profiles.values()].sort((a,b)=>b.wins-a.wins||b.xp-a.xp).slice(0,20).map(p=>({name:p.name,wins:p.wins,xp:p.xp,level:p.level,achievements:p.achievements})))})
app.get('/api/profile/:id',(req,res)=>res.json(profiles.get(req.params.id)||null));
app.get('/health',(req,res)=>res.json({ok:true}));
server.listen(PORT,'0.0.0.0',()=>console.log(`Coin Clash 2.0 running on port ${PORT}`));
