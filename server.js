const http=require("http"),fs=require("fs"),path=require("path"),{WebSocketServer}=require("ws");
const PORT=process.env.PORT||3000,W=800,H=560,DT=1/30;
const page=fs.readFileSync(path.join(__dirname,"public","index.html"));
const srv=http.createServer((q,r)=>{r.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});r.end(page)});
const wss=new WebSocketServer({server:srv,maxPayload:1024}),rooms=new Map();

const MAX_COMBOS=2;
const MAX_WAVE=50;

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

const COMBOS=[
 {id:0,req:[0,1],name:"Mitrailleuse lourde",apply:p=>{p.S.dmg*=1.3;p.S.rate*=1.3}},
 {id:1,req:[2,3],name:"Pluie d'acier",apply:p=>{p.S.multi+=2}},
 {id:2,req:[7,4],name:"Tempête de lames",apply:p=>{p.S.orb+=2;p.S.orbSpd*=1.45}},
 {id:3,req:[6,8],name:"Forteresse vivante",apply:p=>{p.max+=30;p.hp=p.max;p.S.regen+=1.4}},
 {id:4,req:[5,7],name:"Vortex magnétique",apply:p=>{p.S.magnet*=1.7;p.S.gemHeal+=1}}
];

const SUPER_COMBOS=[
 {id:0,req:[0,1],name:"Apocalypse Balistique",apply:p=>{p.S.dmg*=1.45;p.S.multi+=2;p.S.pierce+=2}},
 {id:1,req:[0,2],name:"Canon à Lames",apply:p=>{p.S.dmg*=1.35;p.S.rate*=1.35;p.S.orb+=2;p.S.orbSpd*=1.4}},
 {id:2,req:[0,3],name:"Juggernaut d'Encre",apply:p=>{p.max+=50;p.hp=p.max;p.S.dmg*=1.4;p.S.regen+=1.5}},
 {id:3,req:[0,4],name:"Surcharge Magnétique",apply:p=>{p.S.rate*=1.45;p.S.magnet*=1.8;p.S.gemHeal+=2}},
 {id:4,req:[1,2],name:"Déluge Rasoir",apply:p=>{p.S.multi+=2;p.S.orb+=3;p.S.speed*=1.2}},
 {id:5,req:[1,3],name:"Rempart d'Acier",apply:p=>{p.max+=45;p.hp=p.max;p.S.pierce+=2;p.S.regen+=1.5}},
 {id:6,req:[1,4],name:"Orage Magnétique",apply:p=>{p.S.multi+=2;p.S.magnet*=1.8;p.S.gemHeal+=2}},
 {id:7,req:[2,3],name:"Citadelle Tournoyante",apply:p=>{p.max+=45;p.hp=p.max;p.S.orb+=3;p.S.orbSpd*=1.5}},
 {id:8,req:[2,4],name:"Singularité Tranchante",apply:p=>{p.S.orb+=3;p.S.orbSpd*=1.6;p.S.magnet*=2;p.S.gemHeal+=2}},
 {id:9,req:[3,4],name:"Bastion Astral",apply:p=>{p.max+=50;p.hp=p.max;p.S.regen+=2.2;p.S.gemHeal+=2}}
];

const findSuper=(idA,idB)=>SUPER_COMBOS.find(s=>(s.req[0]===idA&&s.req[1]===idB)||(s.req[0]===idB&&s.req[1]===idA));

const BOSS_NAMES=["Colosse","Traqueur","Arpenteur","Matriarche","Seigneur d'Encre"];
const SPAWNS=[[-48,-32],[48,-32],[-48,32],[48,32]];

const rnd=(a,b)=>a+Math.random()*(b-a),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const nextNeed=lvl=>8+lvl*5+Math.floor(lvl*lvl*.45);
const hpScale=w=>Math.pow(1.45,Math.floor((Math.max(1,w)-1)/5));

const mkP=(ws,i)=>{
 const sp=SPAWNS[i%4];
 return {ws,i,x:W/2+sp[0],y:H/2+sp[1],r:11,hp:100,max:100,down:0,rev:0,inv:0,dx:0,dy:0,cd:0,dc:0,dsh:0,pend:0,ch:null,sc:0,linked:0,
  invList:Array(UPS.length).fill(0),fusedLvl:Array(COMBOS.length).fill(0),combos:[],supers:[],
  st:{kills:0,dmg:0,taken:0,revives:0,gems:0},
  S:{dmg:1,rate:1,multi:1,pierce:0,speed:1,magnet:1,regen:0,orb:0,orbSpd:1,gemHeal:0}};
};

function reset(r){
 Object.assign(r,{E:[],B:[],G:[],X:[],ev:[],links:[],t:0,kills:0,xp:0,lvl:1,need:nextNeed(1),wave:0,toSpawn:0,spawnCd:0,waveDelay:0.4,paused:false,pausedBy:-1});
 r.pl.forEach((p,i)=>Object.assign(p,mkP(p.ws,i)));
}
const offer=p=>{p.ch=UPS.map((u,i)=>i).sort(()=>Math.random()-.5).slice(0,3)};

function comboHint(p,uIdx){
 const nextInv=p.invList.slice();
 nextInv[uIdx]++;

 // 1. Cumul d'un super-combo déjà actif
 for(const sup of p.supers){
  const sc=SUPER_COMBOS[sup.id];
  const c1=COMBOS[sc.req[0]],c2=COMBOS[sc.req[1]];
  const minAll=Math.min(nextInv[c1.req[0]],nextInv[c1.req[1]],nextInv[c2.req[0]],nextInv[c2.req[1]]);
  if(minAll>sup.lvl)return {type:"sup",txt:"Cumul Fusion Niv."+(sup.lvl+1)+" : "+sc.name};
 }

 // 2. Cumul d'un combo actif (avec fusion éventuelle)
 for(const act of p.combos){
  const c=COMBOS[act.id];
  const newLvl=Math.min(nextInv[c.req[0]],nextInv[c.req[1]])-p.fusedLvl[c.id];
  if(newLvl>act.lvl){
   if(p.combos.length>=2){
    const sc=findSuper(p.combos[0].id,p.combos[1].id);
    if(sc)return {type:"fuse",txt:"FUSION : "+sc.name};
   }
   return {type:"lvl",txt:"Cumul Niv."+newLvl+" : "+c.name};
  }
 }

 // 3. Déblocage d'un nouveau combo
 for(const c of COMBOS){
  if(p.combos.some(x=>x.id===c.id))continue;
  const targetLvl=Math.min(nextInv[c.req[0]],nextInv[c.req[1]])-p.fusedLvl[c.id];
  if(targetLvl>0){
   if(p.combos.length>=MAX_COMBOS)return {type:"full",txt:"Slots combos pleins ("+MAX_COMBOS+"/"+MAX_COMBOS+")"};
   if(p.combos.length===1&&(p.combos[0].lvl+targetLvl)>=3){
    const sc=findSuper(p.combos[0].id,c.id);
    if(sc)return {type:"fuse",txt:"FUSION : "+sc.name};
   }
   return {type:"new",txt:"Nouveau combo : "+c.name};
  }
 }
 return null;
}

function applyUpgrade(r,p,uIdx){
 UPS[uIdx][2](p);
 p.invList[uIdx]++;

 // 1. Montée de niveau des super-combos existants avant de recalculer les combos de base
 for(const sup of p.supers){
  const sc=SUPER_COMBOS[sup.id];
  const c1=COMBOS[sc.req[0]],c2=COMBOS[sc.req[1]];
  const minAll=Math.min(p.invList[c1.req[0]],p.invList[c1.req[1]],p.invList[c2.req[0]],p.invList[c2.req[1]]);
  while(sup.lvl<minAll){
   sup.lvl++;
   if(p.fusedLvl[c1.id]<sup.lvl)p.fusedLvl[c1.id]=sup.lvl;
   if(p.fusedLvl[c2.id]<sup.lvl)p.fusedLvl[c2.id]=sup.lvl;
   sc.apply(p);
   r.ev.push([Math.round(p.x),Math.round(p.y),6,p.i,sc.id,sup.lvl]);
  }
 }

 // 2. Déblocage et montée de niveau des combos actifs (hors niveaux déjà fusionnés)
 for(const c of COMBOS){
  const targetLvl=Math.min(p.invList[c.req[0]],p.invList[c.req[1]])-p.fusedLvl[c.id];
  if(targetLvl<=0)continue;
  let existing=p.combos.find(x=>x.id===c.id);
  if(!existing){
   if(p.combos.length>=MAX_COMBOS)continue;
   existing={id:c.id,lvl:0};
   p.combos.push(existing);
  }
  while(existing.lvl<targetLvl){
   existing.lvl++;
   c.apply(p);
   r.ev.push([Math.round(p.x),Math.round(p.y),5,p.i,c.id,existing.lvl]);
  }
 }

 // 3. Fusion en super-combo si 2 combos actifs atteignent un total >= 3 niveaux
 if(p.combos.length===2&&(p.combos[0].lvl+p.combos[1].lvl)>=3){
  const cA=p.combos[0],cB=p.combos[1];
  const sc=findSuper(cA.id,cB.id);
  if(sc){
   p.fusedLvl[cA.id]+=cA.lvl;
   p.fusedLvl[cB.id]+=cB.lvl;
   p.combos=[];
   const exSup=p.supers.find(s=>s.id===sc.id);
   if(exSup){
    exSup.lvl++;
    sc.apply(p);
    r.ev.push([Math.round(p.x),Math.round(p.y),6,p.i,sc.id,exSup.lvl]);
   }else{
    p.supers.push({id:sc.id,lvl:1});
    sc.apply(p);
    r.ev.push([Math.round(p.x),Math.round(p.y),6,p.i,sc.id,1]);
   }
  }
 }
}

function edgePos(m){
 const a=Math.random()*4;
 if(a<1)return [rnd(40,W-40),-m];
 if(a<2)return [W+m,rnd(40,H-40)];
 if(a<3)return [rnd(40,W-40),H+m];
 return [-m,rnd(40,H-40)];
}

function spawnBoss(r,forcedType){
 const w=r.wave,n=1+(r.pl.length-1)*0.4,sc=hpScale(w);
 const bType=forcedType!==undefined?forcedType:Math.floor((w/5-1)%5);
 const [x,y]=edgePos(32);

 let e={k:4,bk:bType,r:30,xp:12+Math.floor(w/3),d:24,sh:2.2,sp2:3.5,dash:0,vx:0,vy:0};
 if(bType===0){e.hp=(115+w*18)*n*sc;e.sp=35;e.r=32}
 else if(bType===1){e.hp=(95+w*15)*n*sc;e.sp=58;e.r=26;e.d=20}
 else if(bType===2){e.hp=(100+w*16)*n*sc;e.sp=30;e.r=28}
 else if(bType===3){e.hp=(125+w*19)*n*sc;e.sp=28;e.r=34}
 else{e.hp=(150+w*22)*n*sc;e.sp=38;e.r=35;e.d=28}

 e.x=x;e.y=y;e.mh=e.hp;e.bc=0;
 r.E.push(e);
}

function spawnE(r){
 const w=r.wave,n=1+(r.pl.length-1)*0.32,sc=hpScale(w);
 const [x,y]=edgePos(28);
 const pool=[0,0,0];
 if(w>=2)pool.push(1,1);
 if(w>=4)pool.push(3,3);
 if(w>=5)pool.push(2);
 if(w>=6)pool.push(5,5);
 if(w>=8)pool.push(6,6);
 if(w>=11)pool.push(7,7);
 if(w>=14)pool.push(8,8);
 if(w>=18)pool.push(9);

 const k=pool[Math.floor(Math.random()*pool.length)];
 let e;
 if(k===1)e={k:1,r:8,hp:(1.4+w*.22)*n*sc,sp:102,xp:1,d:7};
 else if(k===2)e={k:2,r:17,hp:(8.5+w*1.15)*n*sc,sp:42,xp:3,d:16};
 else if(k===3)e={k:3,r:10,hp:(2.6+w*.4)*n*sc,sp:54,xp:2,d:7,sh:2.0};
 else if(k===5)e={k:5,r:10,hp:(2.8+w*.42)*n*sc,sp:66,xp:2,d:9,tp:2.6};
 else if(k===6)e={k:6,r:9,hp:(1.7+w*.25)*n*sc,sp:115,xp:2,d:14};
 else if(k===7)e={k:7,r:13,hp:(5.2+w*.75)*n*sc,sp:46,xp:2,d:15,chg:2.8,dash:0,vx:0,vy:0};
 else if(k===8)e={k:8,r:12,hp:(4.2+w*.6)*n*sc,sp:44,xp:2,d:9,sh:2.5};
 else if(k===9)e={k:9,r:13,hp:(5.5+w*.8)*n*sc,sp:38,xp:3,d:8,sum:3.6};
 else e={k:0,r:11,hp:(2.0+w*.36)*n*sc,sp:64+Math.min(w*1.4,28),xp:1,d:8};

 e.x=x;e.y=y;e.mh=e.hp;e.bc=0;
 r.E.push(e);
}

function explodeKamikaze(r,e){
 r.ev.push([Math.round(e.x),Math.round(e.y),6]);
 for(let i=0;i<6;i++){
  const a=i*1.0472;
  r.X.push({x:e.x,y:e.y,vx:Math.cos(a)*195,vy:Math.sin(a)*195,l:2.4});
 }
}

function hitEnemy(r,e,dmg,ownerIdx){
 const dealt=Math.min(Math.max(0,e.hp),dmg);
 e.hp-=dmg;
 const owner=r.pl[ownerIdx];
 if(owner){
  owner.st.dmg+=dealt;
  if(e.hp<=0&&!e.dead){
   e.dead=true;
   owner.st.kills++;
  }
 }
}

function tick(r){
 if(r.st!=="play")return;
 if(r.paused||r.pl.some(p=>p.ch!==null))return;

 r.t+=DT;
 const pl=r.pl,al=pl.filter(p=>!p.down);

 r.links=[];
 for(const p of pl)p.linked=0;
 for(let i=0;i<al.length;i++){
  for(let j=i+1;j<al.length;j++){
   if(dist(al[i],al[j])<185){
    al[i].linked=1;al[j].linked=1;
    r.links.push([al[i].i,al[j].i]);
   }
  }
 }

 for(const p of al){
  const l=Math.hypot(p.dx,p.dy),k=l>1?1/l:1,sp=175*p.S.speed*(p.dsh>0?3.2:1);
  p.x=Math.max(p.r,Math.min(W-p.r,p.x+p.dx*k*sp*DT));
  p.y=Math.max(p.r,Math.min(H-p.r,p.y+p.dy*k*sp*DT));
  p.inv-=DT;p.dsh-=DT;p.dc-=DT;
  p.hp=Math.min(p.max,p.hp+(p.S.regen+p.linked*.8)*DT);
  p.cd-=DT;
  if(p.cd<=0&&r.E.length){
   let n=null,nd=1e9;
   for(const e of r.E){const d=(e.x-p.x)**2+(e.y-p.y)**2;if(d<nd){nd=d;n=e}}
   const an=Math.atan2(n.y-p.y,n.x-p.x),dm=p.S.dmg*(p.linked?1.25:1);
   const hasHeavy=p.combos.some(c=>c.id===0)||p.supers.length>0;
   for(let i=0;i<p.S.multi;i++){
    const a=an+(i-(p.S.multi-1)/2)*.18;
    r.B.push({x:p.x,y:p.y,vx:Math.cos(a)*460,vy:Math.sin(a)*460,l:1.1,p:p.S.pierce,h:[],o:p.i,d:dm,hv:hasHeavy?1:0});
   }
   p.sc=(p.sc+1)%256;
   p.cd=.52/(p.S.rate*(p.linked?1.3:1));
  }
 }

 for(const b of r.B){
  b.x+=b.vx*DT;b.y+=b.vy*DT;b.l-=DT;
  for(const e of r.E){
   if(b.l<=0)break;
   if(b.h.includes(e)||Math.hypot(e.x-b.x,e.y-b.y)>=e.r+4)continue;
   hitEnemy(r,e,b.d,b.o);
   b.h.push(e);if(--b.p<0)b.l=0;
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
     if(e.sp2<=0){e.sp2=3.0;e.dash=.38;e.vx=(t.x-e.x)/d*350;e.vy=(t.y-e.y)/d*350}
    }
   }else if(e.bk===2){
    const v=td<230?0:e.sp;
    e.x+=(t.x-e.x)/d*v*DT;e.y+=(t.y-e.y)/d*v*DT;
    e.sp2-=DT;
    if(e.sp2<=0){
     e.sp2=4.2;
     e.x=rnd(70,W-70);e.y=rnd(70,H-70);
     r.ev.push([Math.round(e.x),Math.round(e.y),2]);
    }
    e.sh-=DT;
    if(e.sh<=0){
     e.sh=2.0;
     const ba=Math.atan2(t.y-e.y,t.x-e.x);
     for(let i=-1;i<=1;i++){const a=ba+i*.25;r.X.push({x:e.x,y:e.y,vx:Math.cos(a)*200,vy:Math.sin(a)*200,l:3.2})}
    }
   }else if(e.bk===3){
    e.x+=(t.x-e.x)/d*e.sp*DT;e.y+=(t.y-e.y)/d*e.sp*DT;
    e.sp2-=DT;
    if(e.sp2<=0&&r.E.length<42){
     e.sp2=3.8;
     const sc=hpScale(r.wave);
     for(let i=0;i<3;i++){
      const sa=i*2.09+r.t;
      const sx=Math.max(20,Math.min(W-20,e.x+Math.cos(sa)*38)),sy=Math.max(20,Math.min(H-20,e.y+Math.sin(sa)*38));
      const m={k:1,r:8,hp:(1.5+r.wave*.15)*sc,sp:98,xp:1,d:7,x:sx,y:sy,bc:0};m.mh=m.hp;r.E.push(m);
     }
    }
   }else if(e.bk===4){
    e.x+=(t.x-e.x)/d*e.sp*DT;e.y+=(t.y-e.y)/d*e.sp*DT;
    e.sh-=DT;
    if(e.sh<=0){
     e.sh=2.5;
     for(let i=0;i<12;i++){const a=i*.523+r.t*1.5;r.X.push({x:e.x,y:e.y,vx:Math.cos(a)*160,vy:Math.sin(a)*160,l:4})}
    }
    e.sp2-=DT;
    if(e.sp2<=0&&r.E.length<38){
     e.sp2=5.0;
     const sc=hpScale(r.wave);
     const m={k:0,r:11,hp:(2+r.wave*.25)*sc,sp:68,xp:1,d:8,x:e.x,y:e.y,bc:0};m.mh=m.hp;r.E.push(m);
    }
   }else{
    e.x+=(t.x-e.x)/d*e.sp*DT;e.y+=(t.y-e.y)/d*e.sp*DT;
    e.sh-=DT;
    if(e.sh<=0){e.sh=3.6;for(let i=0;i<8;i++){const a=i*.785+r.t;r.X.push({x:e.x,y:e.y,vx:Math.cos(a)*140,vy:Math.sin(a)*140,l:4})}}
   }
  }else if(e.k===5){
   e.x+=(t.x-e.x)/d*e.sp*DT;e.y+=(t.y-e.y)/d*e.sp*DT;
   e.tp-=DT;
   if(e.tp<=0){
    e.tp=2.6;
    const step=Math.min(115,Math.max(40,td-28));
    e.x=Math.max(16,Math.min(W-16,e.x+(t.x-e.x)/d*step));
    e.y=Math.max(16,Math.min(H-16,e.y+(t.y-e.y)/d*step));
    r.ev.push([Math.round(e.x),Math.round(e.y),5]);
   }
  }else if(e.k===7){
   if(e.dash>0){
    e.dash-=DT;
    e.x=Math.max(e.r,Math.min(W-e.r,e.x+e.vx*DT));
    e.y=Math.max(e.r,Math.min(H-e.r,e.y+e.vy*DT));
   }else{
    e.chg-=DT;
    const v=e.chg<0.45?0:e.sp;
    e.x+=(t.x-e.x)/d*v*DT;e.y+=(t.y-e.y)/d*v*DT;
    if(e.chg<=0){
     e.chg=3.0;e.dash=.42;
     e.vx=(t.x-e.x)/d*330;e.vy=(t.y-e.y)/d*330;
    }
   }
  }else if(e.k===8){
   const v=td<250?0:e.sp;
   e.x+=(t.x-e.x)/d*v*DT;e.y+=(t.y-e.y)/d*v*DT;
   e.sh-=DT;
   if(e.sh<=0){
    e.sh=2.6;
    const ba=Math.atan2(t.y-e.y,t.x-e.x);
    for(let i=-1;i<=1;i++){const a=ba+i*.22;r.X.push({x:e.x,y:e.y,vx:Math.cos(a)*180,vy:Math.sin(a)*180,l:3.2})}
   }
  }else if(e.k===9){
   const v=td<260?0:e.sp;
   e.x+=(t.x-e.x)/d*v*DT;e.y+=(t.y-e.y)/d*v*DT;
   e.sum-=DT;
   if(e.sum<=0&&r.E.length<45){
    e.sum=3.8;
    const sc=hpScale(r.wave);
    for(let i=0;i<2;i++){
     const a=Math.random()*6.283;
     const sx=Math.max(18,Math.min(W-18,e.x+Math.cos(a)*26));
     const sy=Math.max(18,Math.min(H-18,e.y+Math.sin(a)*26));
     const m={k:1,r:8,hp:(1.3+r.wave*.18)*sc,sp:102,xp:1,d:7,x:sx,y:sy,bc:0};m.mh=m.hp;r.E.push(m);
    }
    r.ev.push([Math.round(e.x),Math.round(e.y),9]);
   }
  }else{
   const v=e.k===3&&td<220?0:e.sp;
   e.x+=(t.x-e.x)/d*v*DT;e.y+=(t.y-e.y)/d*v*DT;
   if(e.k===3){
    e.sh=(e.sh===undefined?2.2:e.sh)-DT;
    if(e.sh<=0){e.sh=2.3;r.X.push({x:e.x,y:e.y,vx:(t.x-e.x)/d*170,vy:(t.y-e.y)/d*170,l:3.2})}
   }
  }

  if(td<e.r+t.r&&t.inv<=0){
   t.hp-=e.d;t.inv=.75;t.st.taken+=e.d;
   if(t.hp<=0){t.hp=0;t.down=1;t.rev=0}
   if(e.k===6){e.hp=0;e.dead=true}
  }
 }

 r.E=r.E.filter(e=>{
  if(e.hp>0)return true;
  r.kills++;r.G.push({x:e.x,y:e.y,v:e.xp});r.ev.push([Math.round(e.x),Math.round(e.y),e.k]);
  if(e.k===6)explodeKamikaze(r,e);
  if(e.k===4)for(const p of pl){p.pend++;if(!p.ch)offer(p);if(p.down){p.down=0;p.rev=0;p.inv=2}p.hp=Math.min(p.max,Math.max(p.hp,p.max*.5)+p.max*.35)}
  return false;
 });

 for(const d of pl)if(d.down){
  const a=al.find(p=>!p.down&&dist(p,d)<62);
  d.rev=a?d.rev+DT:Math.max(0,d.rev-DT*.5);
  if(d.rev>=2.2){
   d.down=0;d.hp=d.max*.6;d.inv=2.5;d.rev=0;
   if(a)a.st.revives++;
  }
 }
 if(pl.every(p=>p.down)){r.st="over";return}

 if(r.toSpawn>0){
  r.spawnCd-=DT;
  if(r.spawnCd<=0){
   spawnE(r);
   r.toSpawn--;
   r.spawnCd=Math.max(0.08,0.36-r.wave*0.007);
  }
 }else if(r.E.length===0){
  if(r.wave>=MAX_WAVE){
   r.st="win";
   return;
  }
  r.waveDelay-=DT;
  if(r.waveDelay<=0){
   r.wave++;
   r.waveDelay=1.5;
   const mult=1+(pl.length-1)*0.35;

   if(r.wave>=45&&r.wave<=50){
    const bossCount=r.wave===50?5:Math.min(4,2+Math.floor((r.wave-45)/2));
    const order=[0,1,2,3,4].sort(()=>Math.random()-.5);
    for(let bi=0;bi<bossCount;bi++)spawnBoss(r,order[bi%5]);
    r.toSpawn=Math.round((10+r.wave*.7)*mult);
   }else if(r.wave%5===0){
    spawnBoss(r);
    r.toSpawn=Math.round((6+r.wave*.9)*mult);
   }else{
    r.toSpawn=Math.round((6+r.wave*2.4)*mult);
   }
   r.spawnCd=0.12;
  }
 }

 const live=pl.filter(p=>!p.down);
 for(const p of live)if(p.S.orb)for(let k=0;k<p.S.orb;k++){
  const a=r.t*3*p.S.orbSpd+k*6.283/p.S.orb,bx=p.x+Math.cos(a)*46,by=p.y+Math.sin(a)*46;
  for(const e of r.E)if(!(e.bc>0)&&Math.hypot(e.x-bx,e.y-by)<e.r+7){
   hitEnemy(r,e,1.3*p.S.dmg,p.i);
   e.bc=.28;
  }
 }
 for(const e of r.E)e.bc-=DT;

 r.X=r.X.filter(b=>{
  b.x+=b.vx*DT;b.y+=b.vy*DT;b.l-=DT;
  if(b.l<=0)return false;
  for(const p of live)if(p.inv<=0&&Math.hypot(p.x-b.x,p.y-b.y)<p.r+5){
   p.hp-=10;p.inv=.75;p.st.taken+=10;
   if(p.hp<=0){p.hp=0;p.down=1;p.rev=0}
   return false;
  }
  return true;
 });

 r.G=r.G.filter(g=>{
  let n=null,nd=1e9;
  for(const p of live){const d=dist(g,p);if(d<nd){nd=d;n=p}}
  if(!n)return true;
  const pull=r.E.length===0&&r.toSpawn===0?190:85*n.S.magnet;
  if(nd<pull){const d=nd||1;g.x+=(n.x-g.x)/d*340*DT;g.y+=(n.y-g.y)/d*340*DT}
  if(nd<n.r+6){
   r.xp+=g.v;
   n.st.gems++;
   if(n.S.gemHeal)n.hp=Math.min(n.max,n.hp+n.S.gemHeal);
   while(r.xp>=r.need){
    r.xp-=r.need;r.lvl++;r.need=nextNeed(r.lvl);
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
 const bosses=r.E.filter(e=>e.k===4);
 let bName="",bHp=0;
 if(bosses.length===1){
  bName=BOSS_NAMES[bosses[0].bk];
  bHp=R(bosses[0].hp/bosses[0].mh*100);
 }else if(bosses.length>1){
  const cur=bosses.reduce((s,e)=>s+Math.max(0,e.hp),0);
  const tot=bosses.reduce((s,e)=>s+e.mh,0);
  bName=bosses.length+" BOSS ACTIFS ("+bosses.map(b=>BOSS_NAMES[b.bk]).join(" · ")+")";
  bHp=tot>0?R(cur/tot*100):0;
 }
 const ended=(r.st==="over"||r.st==="win");
 const endStats=ended?r.pl.map(p=>({
  i:p.i,
  kills:p.st.kills,
  dmg:R(p.st.dmg),
  taken:R(p.st.taken),
  rev:p.st.revives,
  gems:p.st.gems,
  cmb:p.combos,
  sup:p.supers
 })):null;

 const b={t:"s",st:r.st,code:r.code,n:r.pl.length,tm:R(r.t*10)/10,k:r.kills,l:r.lvl,xp:r.xp,nd:r.need,lks:r.links,wv:r.wave,mw:MAX_WAVE,rem:r.E.length+r.toSpawn,pz:pz,mpz:r.paused?1:0,pby:r.pausedBy,bn:bName,bh:bHp,stats:endStats,
  p:r.pl.map(p=>[R(p.x),R(p.y),R(p.hp),p.max,p.down,R(p.rev*100)/100,p.inv>0?1:0,p.pend,R(85*p.S.magnet),R(Math.max(0,p.dc)*10)/10,p.S.orb,p.ch!==null?1:0,p.dsh>0?1:0,p.sc,p.S.orbSpd,p.linked]),
  E:r.E.map(e=>[R(e.x),R(e.y),e.k,R(e.hp/e.mh*100),e.bk||0,e.dash>0?1:0]),
  B:r.B.map(x=>[R(x.x),R(x.y),x.vx,x.vy,x.o,x.hv||0]),
  G:r.G.map(g=>[R(g.x),R(g.y)]),X:r.X.map(x=>[R(x.x),R(x.y)]),oa:R(r.t*300)/100,ev:r.ev};
 r.ev=[];
 for(const p of r.pl)if(p.ws.readyState===1)p.ws.send(JSON.stringify({
  ...b,me:p.i,inv:p.invList,cmb:p.combos,sup:p.supers,
  ch:p.ch?p.ch.map(i=>[UPS[i][0],UPS[i][1],comboHint(p,i)]):null
 }));
}
setInterval(()=>{for(const r of rooms.values()){tick(r);snap(r)}},1000/30);

wss.on("connection",ws=>{
 ws.on("message",m=>{
  let d;try{d=JSON.parse(m)}catch(e){return}
  if(d.t==="join"&&!ws.r){
   const c=String(d.room||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6)||"SALLE";
   let r=rooms.get(c);
   if(!r){r={code:c,pl:[],st:"wait"};reset(r);rooms.set(c,r)}
   if(r.pl.length>=4)return ws.send(JSON.stringify({t:"full"}));
   const p=mkP(ws,r.pl.length);r.pl.push(p);ws.r=r;ws.p=p;
   return;
  }
  const r=ws.r,p=ws.p;if(!r)return;
  if(d.t==="in"){p.dx=Math.max(-1,Math.min(1,+d.dx||0));p.dy=Math.max(-1,Math.min(1,+d.dy||0))}
  else if(d.t==="pick"&&p.ch&&p.ch[d.i]!=null){
   applyUpgrade(r,p,p.ch[d.i]);
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
  else if(d.t==="restart"&&(r.st==="over"||r.st==="win")){reset(r);r.st="play"}
 });
 ws.on("close",()=>{
  const r=ws.r;if(!r)return;
  r.pl=r.pl.filter(p=>p!==ws.p);r.pl.forEach((p,i)=>p.i=i);
  if(!r.pl.length)rooms.delete(r.code);
  else if(r.paused)r.paused=false;
 });
});
srv.listen(PORT,"0.0.0.0",()=>console.log("Survivor Squad sur le port "+PORT));