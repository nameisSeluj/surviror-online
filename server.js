const http=require("http"),fs=require("fs"),path=require("path"),{WebSocketServer}=require("ws");
const PORT=process.env.PORT||3000,W=800,H=560,DT=1/30;
const page=fs.readFileSync(path.join(__dirname,"public","index.html"));
const srv=http.createServer((q,r)=>{r.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});r.end(page)});
const wss=new WebSocketServer({server:srv,maxPayload:1024}),rooms=new Map();

const UPS=[
 ["Dégâts +30 %","Tes tirs frappent plus fort",p=>p.S.dmg*=1.3],
 ["Cadence +25 %","Tu tires plus vite",p=>p.S.rate*=1.25],
 ["Tir multiple","+1 projectile par salve",p=>p.S.multi++],
 ["Perforation","Les tirs traversent +1 ennemi",p=>p.S.pierce++],
 ["Vitesse +12 %","Tu te déplaces plus vite",p=>p.S.speed*=1.12],
 ["Aimant +40 %","Les gemmes viennent de plus loin",p=>p.S.magnet*=1.4],
 ["Régénération","+0,8 PV par seconde",p=>p.S.regen+=.8],
 ["Lames orbitales","+1 lame qui tourne autour de toi",p=>p.S.orb++],
 ["Soin & armure","+25 PV max et soin complet",p=>{p.max+=25;p.hp=p.max}]
];

const BOSS_NAMES=["Colosse","Traqueur","Arpenteur","Matriarche","Seigneur d'Encre"];

const rnd=(a,b)=>a+Math.random()*(b-a),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const mkP=(ws,i)=>({ws,i,x:W/2+(i?50:-50),y:H/2,r:11,hp:100,max:100,down:0,rev:0,inv:0,dx:0,dy:0,cd:0,dc:0,dsh:0,pend:0,ch:null,S:{dmg:1,rate:1,multi:1,pierce:0,speed:1,magnet:1,regen:0,orb:0}});

function reset(r){
 Object.assign(r,{E:[],B:[],G:[],X:[],ev:[],t:0,kills:0,xp:0,lvl:1,need:4,link:0,wave:0,toSpawn:0,spawnCd:0,waveDelay:0.5,paused:false,pausedBy:-1});
 r.pl.forEach((p,i)=>Object.assign(p,mkP(p.ws,i)));
}
const offer=p=>{p.ch=UPS.map((u,i)=>i).sort(()=>Math.random()-.5).slice(0,3)};

function spawnBoss(r){
 const w=r.wave,n=r.pl.length>1?1.45:1;
 const bType=Math.floor((w/5-1)%5);
 const tier=w>25?1.65:1;
 const a=Math.random()*4,m=32;
 let x,y;
 if(a<1){x=rnd(80,W-80);y=-m}else if(a<2){x=W+m;y=rnd(80,H-80)}else if(a<3){x=rnd(80,W-80);y=H+m}else{x=-m;y=rnd(80,H-80)}

 let e={k:4,bk:bType,r:30,xp:15+Math.floor(w/2),d:24,sh:2.2,sp2:3.5,dash:0,vx:0,vy:0};
 if(bType===0){e.hp=(115+w*20)*n*tier;e.sp=33;e.r=32}
 else if(bType===1){e.hp=(95+w*17)*n*tier;e.sp=56;e.r=26;e.d=20}
 else if(bType===2){e.hp=(100+w*18)*n*tier;e.sp=28;e.r=28}
 else if(bType===3){e.hp=(125+w*21)*n*tier;e.sp=26;e.r=34}
 else{e.hp=(150+w*24)*n*tier;e.sp=36;e.r=35;e.d=28}

 e.x=x;e.y=y;e.mh=e.hp;e.bc=0;
 r.E.push(e);
}

function spawnE(r){
 const a=Math.random()*4,m=28,w=r.wave,q=Math.random(),n=r.pl.length>1?1.35:1;let x,y,e;
 if(a<1){x=rnd(0,W);y=-m}else if(a<2){x=W+m;y=rnd(0,H)}else if(a<3){x=rnd(0,W);y=H+m}else{x=-m;y=rnd(0,H)}
 if(w>=5&&q<.12)e={k:2,r:17,hp:(8+w*1.1)*n,sp:40,xp:3,d:16};
 else if(w>=4&&q<.28)e={k:3,r:10,hp:(2.5+w*.4)*n,sp:52,xp:2,d:7};
 else if(w>=2&&q<.5)e={k:1,r:8,hp:(1.3+w*.2)*n,sp:98,xp:1,d:7};
 else e={k:0,r:11,hp:(1.8+w*.35)*n,sp:60+Math.min(w*1.5,24),xp:1,d:8};
 e.x=x;e.y=y;e.mh=e.hp;e.bc=0;r.E.push(e);
}

function tick(r){
 if(r.st!=="play")return;
 // Pause manuelle ou pause de choix de niveau
 if(r.paused||r.pl.some(p=>p.ch!==null))return;

 r.t+=DT;
 const pl=r.pl,al=pl.filter(p=>!p.down);
 r.link=al.length>1&&dist(al[0],al[1])<180?1:0;

 for(const p of al){
  const l=Math.hypot(p.dx,p.dy),k=l>1?1/l:1,sp=175*p.S.speed*(p.dsh>0?3.2:1);
  p.x=Math.max(p.r,Math.min(W-p.r,p.x+p.dx*k*sp*DT));
  p.y=Math.max(p.r,Math.min(H-p.r,p.y+p.dy*k*sp*DT));
  p.inv-=DT;p.dsh-=DT;p.dc-=DT;p.hp=Math.min(p.max,p.hp+(p.S.regen+r.link*.8)*DT);p.cd-=DT;
  if(p.cd<=0&&r.E.length){
   let n=null,nd=1e9;
   for(const e of r.E){const d=(e.x-p.x)**2+(e.y-p.y)**2;if(d<nd){nd=d;n=e}}
   const an=Math.atan2(n.y-p.y,n.x-p.x),dm=p.S.dmg*(r.link?1.25:1);
   for(let i=0;i<p.S.multi;i++){const a=an+(i-(p.S.multi-1)/2)*.2;r.B.push({x:p.x,y:p.y,vx:Math.cos(a)*450,vy:Math.sin(a)*450,l:1.1,p:p.S.pierce,h:[],o:p.i,d:dm})}
   p.cd=.52/(p.S.rate*(r.link?1.3:1));
  }
 }

 for(const b of r.B){
  b.x+=b.vx*DT;b.y+=b.vy*DT;b.l-=DT;
  for(const e of r.E){
   if(b.l<=0)break;
   if(b.h.includes(e)||Math.hypot(e.x-b.x,e.y-b.y)>=e.r+4)continue;
   e.hp-=b.d;b.h.push(e);if(--b.p<0)b.l=0;
  }
 }
 r.B=r.B.filter(b=>b.l>0);

 for(const e of r.E){
  let t=null,td=1e9;
  for(const p of al){if(p.down)continue;const d=dist(e,p);if(d<td){td=d;t=p}}
  if(!t)break;
  const d=td||1;

  if(e.k===4){
   if(e.bk===1){
    if(e.dash>0){
     e.dash-=DT;
     e.x=Math.max(e.r,Math.min(W-e.r,e.x+e.vx*DT));
     e.y=Math.max(e.r,Math.min(H-e.r,e.y+e.vy*DT));
    }else{
     e.x+=(t.x-e.x)/d*e.sp*DT;e.y+=(t.y-e.y)/d*e.sp*DT;
     e.sp2-=DT;
     if(e.sp2<=0){e.sp2=3.2;e.dash=.38;e.vx=(t.x-e.x)/d*340;e.vy=(t.y-e.y)/d*340}
    }
   }else if(e.bk===2){
    const v=td<230?0:e.sp;
    e.x+=(t.x-e.x)/d*v*DT;e.y+=(t.y-e.y)/d*v*DT;
    e.sp2-=DT;
    if(e.sp2<=0){
     e.sp2=4.5;
     e.x=rnd(70,W-70);e.y=rnd(70,H-70);
     r.ev.push([Math.round(e.x),Math.round(e.y),2]);
    }
    e.sh-=DT;
    if(e.sh<=0){
     e.sh=2.2;
     const ba=Math.atan2(t.y-e.y,t.x-e.x);
     for(let i=-1;i<=1;i++){const a=ba+i*.25;r.X.push({x:e.x,y:e.y,vx:Math.cos(a)*195,vy:Math.sin(a)*195,l:3.2})}
    }
   }else if(e.bk===3){
    e.x+=(t.x-e.x)/d*e.sp*DT;e.y+=(t.y-e.y)/d*e.sp*DT;
    e.sp2-=DT;
    if(e.sp2<=0&&r.E.length<28){
     e.sp2=4.2;
     for(let i=0;i<3;i++){
      const sa=i*2.09+r.t;
      const sx=Math.max(20,Math.min(W-20,e.x+Math.cos(sa)*38)),sy=Math.max(20,Math.min(H-20,e.y+Math.sin(sa)*38));
      const m={k:1,r:8,hp:1.5+r.wave*.15,sp:95,xp:1,d:7,x:sx,y:sy,bc:0};m.mh=m.hp;r.E.push(m);
     }
    }
   }else if(e.bk===4){
    e.x+=(t.x-e.x)/d*e.sp*DT;e.y+=(t.y-e.y)/d*e.sp*DT;
    e.sh-=DT;
    if(e.sh<=0){
     e.sh=2.8;
     for(let i=0;i<12;i++){const a=i*.523+r.t*1.5;r.X.push({x:e.x,y:e.y,vx:Math.cos(a)*155,vy:Math.sin(a)*155,l:4})}
    }
    e.sp2-=DT;
    if(e.sp2<=0&&r.E.length<25){
     e.sp2=5.5;
     const m={k:0,r:11,hp:2+r.wave*.25,sp:65,xp:1,d:8,x:e.x,y:e.y,bc:0};m.mh=m.hp;r.E.push(m);
    }
   }else{
    e.x+=(t.x-e.x)/d*e.sp*DT;e.y+=(t.y-e.y)/d*e.sp*DT;
    e.sh-=DT;
    if(e.sh<=0){e.sh=4.0;for(let i=0;i<8;i++){const a=i*.785+r.t;r.X.push({x:e.x,y:e.y,vx:Math.cos(a)*135,vy:Math.sin(a)*135,l:4})}}
   }
  }else{
   const v=e.k===3&&td<220?0:e.sp;
   e.x+=(t.x-e.x)/d*v*DT;e.y+=(t.y-e.y)/d*v*DT;
   if(e.k===3){
    e.sh=(e.sh===undefined?2.2:e.sh)-DT;
    if(e.sh<=0){e.sh=2.4;r.X.push({x:e.x,y:e.y,vx:(t.x-e.x)/d*165,vy:(t.y-e.y)/d*165,l:3.2})}
   }
  }

  if(td<e.r+t.r&&t.inv<=0){t.hp-=e.d;t.inv=.75;if(t.hp<=0){t.hp=0;t.down=1;t.rev=0}}
 }

 r.E=r.E.filter(e=>{
  if(e.hp>0)return true;
  r.kills++;r.G.push({x:e.x,y:e.y,v:e.xp});r.ev.push([Math.round(e.x),Math.round(e.y),e.k]);
  if(e.k===4)for(const p of pl){p.pend++;if(!p.ch)offer(p);if(p.down){p.down=0;p.rev=0;p.inv=2}p.hp=Math.min(p.max,Math.max(p.hp,p.max*.5)+p.max*.35)}
  return false;
 });

 for(const d of pl)if(d.down){
  const a=al.find(p=>!p.down&&dist(p,d)<60);
  d.rev=a?d.rev+DT:Math.max(0,d.rev-DT*.5);
  if(d.rev>=2.2){d.down=0;d.hp=d.max*.6;d.inv=2.5;d.rev=0}
 }
 if(pl.every(p=>p.down)){r.st="over";return}

 if(r.toSpawn>0){
  r.spawnCd-=DT;
  if(r.spawnCd<=0){
   spawnE(r);
   r.toSpawn--;
   r.spawnCd=Math.max(0.22,0.65-r.wave*0.02);
  }
 }else if(r.E.length===0){
  r.waveDelay-=DT;
  if(r.waveDelay<=0){
   r.wave++;
   r.waveDelay=2.4;
   const mult=pl.length>1?1.35:1;
   if(r.wave%5===0){
    spawnBoss(r);
    r.toSpawn=Math.round((4+r.wave*.8)*mult);
   }else{
    r.toSpawn=Math.round((4+r.wave*2.2)*mult);
   }
   r.spawnCd=0.2;
  }
 }

 const live=pl.filter(p=>!p.down);
 for(const p of live)if(p.S.orb)for(let k=0;k<p.S.orb;k++){
  const a=r.t*3+k*6.283/p.S.orb,bx=p.x+Math.cos(a)*46,by=p.y+Math.sin(a)*46;
  for(const e of r.E)if(!(e.bc>0)&&Math.hypot(e.x-bx,e.y-by)<e.r+7){e.hp-=1.3*p.S.dmg;e.bc=.28}
 }
 for(const e of r.E)e.bc-=DT;

 r.X=r.X.filter(b=>{
  b.x+=b.vx*DT;b.y+=b.vy*DT;b.l-=DT;
  if(b.l<=0)return false;
  for(const p of live)if(p.inv<=0&&Math.hypot(p.x-b.x,p.y-b.y)<p.r+5){p.hp-=10;p.inv=.75;if(p.hp<=0){p.hp=0;p.down=1;p.rev=0}return false}
  return true;
 });

 r.G=r.G.filter(g=>{
  let n=null,nd=1e9;
  for(const p of live){const d=dist(g,p);if(d<nd){nd=d;n=p}}
  if(!n)return true;
  const pull=r.E.length===0&&r.toSpawn===0?180:85*n.S.magnet;
  if(nd<pull){const d=nd||1;g.x+=(n.x-g.x)/d*340*DT;g.y+=(n.y-g.y)/d*340*DT}
  if(nd<n.r+6){
   r.xp+=g.v;
   while(r.xp>=r.need){
    r.xp-=r.need;r.lvl++;r.need=4+r.lvl*3;
    for(const p of pl){p.pend++;if(p.ch===null)offer(p)}
   }
   return false;
  }
  return true;
 });
}

function snap(r){
 const R=Math.round;
 const lvlPz=r.pl.some(p=>p.ch!==null)?1:0;
 const pz=(lvlPz||r.paused)?1:0;
 const boss=r.E.find(e=>e.k===4);
 const bName=boss?BOSS_NAMES[boss.bk]:"";
 const bHp=boss?R(boss.hp/boss.mh*100):0;
 const b={t:"s",st:r.st,code:r.code,n:r.pl.length,tm:R(r.t*10)/10,k:r.kills,l:r.lvl,xp:r.xp,nd:r.need,lk:r.link,wv:r.wave,rem:r.E.length+r.toSpawn,pz:pz,mpz:r.paused?1:0,pby:r.pausedBy,bn:bName,bh:bHp,
  p:r.pl.map(p=>[R(p.x),R(p.y),R(p.hp),p.max,p.down,R(p.rev*100)/100,p.inv>0?1:0,p.pend,R(85*p.S.magnet),R(Math.max(0,p.dc)*10)/10,p.S.orb,p.ch!==null?1:0]),
  E:r.E.map(e=>[R(e.x),R(e.y),e.k,R(e.hp/e.mh*100),e.bk||0]),
  B:r.B.map(x=>[R(x.x),R(x.y),x.vx,x.vy,x.o]),
  G:r.G.map(g=>[R(g.x),R(g.y)]),X:r.X.map(x=>[R(x.x),R(x.y)]),oa:R(r.t*300)/100,ev:r.ev};
 r.ev=[];
 for(const p of r.pl)if(p.ws.readyState===1)p.ws.send(JSON.stringify({...b,me:p.i,ch:p.ch?p.ch.map(i=>UPS[i].slice(0,2)):null}));
}
setInterval(()=>{for(const r of rooms.values()){tick(r);snap(r)}},1000/30);

wss.on("connection",ws=>{
 ws.on("message",m=>{
  let d;try{d=JSON.parse(m)}catch(e){return}
  if(d.t==="join"&&!ws.r){
   const c=String(d.room||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6)||"SALLE";
   let r=rooms.get(c);
   if(!r){r={code:c,pl:[],st:"wait"};reset(r);rooms.set(c,r)}
   if(r.pl.length>=2)return ws.send(JSON.stringify({t:"full"}));
   const p=mkP(ws,r.pl.length);r.pl.push(p);ws.r=r;ws.p=p;
   if(r.pl.length===2&&r.st==="wait")r.st="play";
   return;
  }
  const r=ws.r,p=ws.p;if(!r)return;
  if(d.t==="in"){p.dx=Math.max(-1,Math.min(1,+d.dx||0));p.dy=Math.max(-1,Math.min(1,+d.dy||0))}
  else if(d.t==="pick"&&p.ch&&p.ch[d.i]!=null){
   UPS[p.ch[d.i]][2](p);
   p.pend=Math.max(0,p.pend-1);
   p.ch=null;
   p.inv=Math.max(p.inv,.6);
   if(p.pend>0)offer(p);
  }
  else if(d.t==="pause"&&r.st==="play"){
   r.paused=!r.paused;
   r.pausedBy=r.paused?p.i:-1;
  }
  else if(d.t==="dash"&&!p.down&&p.dc<=0&&(p.dx||p.dy)){p.dsh=.18;p.dc=2.0;p.inv=Math.max(p.inv,.4)}
  else if(d.t==="start"&&r.st==="wait")r.st="play";
  else if(d.t==="restart"&&r.st==="over"){reset(r);r.st="play"}
 });
 ws.on("close",()=>{
  const r=ws.r;if(!r)return;
  r.pl=r.pl.filter(p=>p!==ws.p);r.pl.forEach((p,i)=>p.i=i);
  if(!r.pl.length)rooms.delete(r.code);
  else if(r.paused)r.paused=false;
 });
});
srv.listen(PORT,"0.0.0.0",()=>console.log("Survivor Duo sur le port "+PORT));