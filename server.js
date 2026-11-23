const http=require("http"),fs=require("fs"),path=require("path"),{WebSocketServer}=require("ws");
const PORT=process.env.PORT||3000,W=800,H=560,DT=1/30;
const page=fs.readFileSync(path.join(__dirname,"public","index.html"));
const srv=http.createServer((q,r)=>{r.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});r.end(page)});
const wss=new WebSocketServer({server:srv,maxPayload:2048}),rooms=new Map();

const MAX_PLAYERS=6;
const MAX_COMBOS=2;
const MAX_SUPER=1;
const MAX_WAVE=50;
const MAX_SKINS=8;

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
 {id:0,req:[0,1],name:"Mitrailleuse lourde",desc:"Dégâts ×1,22 · Cadence ×1,22",apply:p=>{p.S.dmg*=1.22;p.S.rate*=1.22}},
 {id:1,req:[2,3],name:"Pluie d'acier",desc:"+1 projectile · +1 perforation",apply:p=>{p.S.multi+=1;p.S.pierce+=1}},
 {id:2,req:[7,4],name:"Tempête de lames",desc:"+2 lames · Vitesse lames ×1,3",apply:p=>{p.S.orb+=2;p.S.orbSpd*=1.3}},
 {id:3,req:[6,8],name:"Forteresse vivante",desc:"+25 PV max · +1,2 PV/s",apply:p=>{p.max+=25;p.hp=p.max;p.S.regen+=1.2}},
 {id:4,req:[5,7],name:"Vortex magnétique",desc:"Aimant ×1,5 · +1 PV/gemme",apply:p=>{p.S.magnet*=1.5;p.S.gemHeal+=1}}
];

const SUPER_COMBOS=[
 {id:0,req:[0,1],name:"Apocalypse Balistique",desc:"Dégâts ×1,38 · Cadence ×1,2 · +2 tirs · +1 perf.",apply:p=>{p.S.dmg*=1.38;p.S.rate*=1.2;p.S.multi+=2;p.S.pierce+=1}},
 {id:1,req:[0,2],name:"Canon à Lames",desc:"Dégâts ×1,32 · Cadence ×1,3 · +2 lames",apply:p=>{p.S.dmg*=1.32;p.S.rate*=1.3;p.S.orb+=2;p.S.orbSpd*=1.3}},
 {id:2,req:[0,3],name:"Juggernaut d'Encre",desc:"+40 PV max · Dégâts ×1,38 · +1,6 PV/s",apply:p=>{p.max+=40;p.hp=p.max;p.S.dmg*=1.38;p.S.regen+=1.6}},
 {id:3,req:[0,4],name:"Surcharge Magnétique",desc:"Cadence ×1,38 · Dégâts ×1,2 · +2 PV/gemme",apply:p=>{p.S.rate*=1.38;p.S.dmg*=1.2;p.S.magnet*=1.7;p.S.gemHeal+=2}},
 {id:4,req:[1,2],name:"Déluge Rasoir",desc:"+2 tirs · +2 lames · Vitesse ×1,15",apply:p=>{p.S.multi+=2;p.S.orb+=2;p.S.orbSpd*=1.3;p.S.speed*=1.15}},
 {id:5,req:[1,3],name:"Rempart d'Acier",desc:"+40 PV max · +1 tir · +2 perf. · +1,6 PV/s",apply:p=>{p.max+=40;p.hp=p.max;p.S.multi+=1;p.S.pierce+=2;p.S.regen+=1.6}},
 {id:6,req:[1,4],name:"Orage Magnétique",desc:"+2 tirs · +1 perf. · Aimant ×1,7 · +2 PV/gemme",apply:p=>{p.S.multi+=2;p.S.pierce+=1;p.S.magnet*=1.7;p.S.gemHeal+=2}},
 {id:7,req:[2,3],name:"Citadelle Tournoyante",desc:"+40 PV max · +3 lames · +1,4 PV/s",apply:p=>{p.max+=40;p.hp=p.max;p.S.orb+=3;p.S.orbSpd*=1.4;p.S.regen+=1.4}},
 {id:8,req:[2,4],name:"Singularité Tranchante",desc:"+3 lames · Aimant ×1,8 · +2 PV/gemme",apply:p=>{p.S.orb+=3;p.S.orbSpd*=1.45;p.S.magnet*=1.8;p.S.gemHeal+=2}},
 {id:9,req:[3,4],name:"Bastion Astral",desc:"+45 PV max · +2 PV/s · +2 PV/gemme",apply:p=>{p.max+=45;p.hp=p.max;p.S.regen+=2.0;p.S.magnet*=1.6;p.S.gemHeal+=2}}
];

const findSuper=(idA,idB)=>SUPER_COMBOS.find(s=>(s.req[0]===idA&&s.req[1]===idB)||(s.req[0]===idB&&s.req[1]===idA));

const BOSS_NAMES=["Colosse","Traqueur","Arpenteur","Matriarche","Seigneur d'Encre"];
const SPAWNS=[[-56,-34],[56,-34],[-56,34],[56,34],[0,-48],[0,48]];

const rnd=(a,b)=>a+Math.random()*(b-a),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const nextNeed=(lvl,nPl=1)=>Math.round((8+lvl*5+Math.floor(lvl*lvl*.45))*(1+(Math.max(1,nPl)-1)*0.22));

// Scaling conservé à l'identique pour les boss
const bossHpScale=w=>(1+(Math.max(1,w)-1)*0.09)*Math.pow(1.55,Math.floor((Math.max(1,w)-1)/5));
const bossDmgScale=w=>(1+(Math.max(1,w)-1)*0.06)*Math.pow(1.24,Math.floor((Math.max(1,w)-1)/5));

// Scaling adouci pour les vagues de mobs standards
const mobHpScale=w=>(1+(Math.max(1,w)-1)*0.038)*Math.pow(1.34,Math.floor((Math.max(1,w)-1)/5));
const mobDmgScale=w=>(1+(Math.max(1,w)-1)*0.02)*Math.pow(1.12,Math.floor((Math.max(1,w)-1)/5));

const cleanNick=(raw,i)=>{
 const s=String(raw||"").replace(/[^\p{L}\p{N}_\-. ]/gu,"").trim().slice(0,14);
 return s||("J"+(i+1));
};
const cleanSkin=raw=>Math.max(0,Math.min(MAX_SKINS-1,parseInt(raw,10)||0));

const mkP=(ws,i,name,skin=0)=>{
 const sp=SPAWNS[i%SPAWNS.length];
 return {ws,i,name:cleanNick(name,i),skin:cleanSkin(skin),x:W/2+sp[0],y:H/2+sp[1],r:11,hp:100,max:100,down:0,rev:0,revBy:0,inv:0,dx:0,dy:0,cd:0,dc:0,dsh:0,pend:0,ch:null,sc:0,linked:0,
  invList:Array(UPS.length).fill(0),fusedLvl:Array(COMBOS.length).fill(0),combos:[],supers:[],
  st:{kills:0,dmg:0,taken:0,revives:0,gems:0},
  S:{dmg:1,rate:1,multi:1,pierce:0,speed:1,magnet:1,regen:0,orb:0,orbSpd:1,gemHeal:0}};
};

function reset(r){
 Object.assign(r,{E:[],B:[],G:[],X:[],ev:[],links:[],fullLink:0,t:0,kills:0,xp:0,lvl:1,need:nextNeed(1,r.pl.length),wave:0,toSpawn:0,spawnCd:0,waveDelay:0.4,paused:false,pausedBy:-1});
 r.pl.forEach((p,i)=>Object.assign(p,mkP(p.ws,i,p.name,p.skin)));
}
const offer=p=>{p.ch=UPS.map((u,i)=>i).sort(()=>Math.random()-.5).slice(0,3)};

function comboHint(p,uIdx){
 const nextInv=p.invList.slice();
 nextInv[uIdx]++;

 for(const sup of p.supers){
  const sc=SUPER_COMBOS[sup.id];
  const c1=COMBOS[sc.req[0]],c2=COMBOS[sc.req[1]];
  const minAll=Math.min(nextInv[c1.req[0]],nextInv[c1.req[1]],nextInv[c2.req[0]],nextInv[c2.req[1]]);
  if(minAll>sup.lvl)return {type:"sup",txt:"Cumul Fusion Niv."+(sup.lvl+1)+" : "+sc.name+" ("+sc.desc+")"};
 }

 for(const act of p.combos){
  const c=COMBOS[act.id];
  const newLvl=Math.min(nextInv[c.req[0]],nextInv[c.req[1]])-p.fusedLvl[c.id];
  if(newLvl>act.lvl){
   if(p.combos.length>=2){
    if(p.supers.length>=MAX_SUPER)return {type:"full",txt:"Max 1 Super-Combo (cumul Niv."+newLvl+" : "+c.name+")"};
    const sc=findSuper(p.combos[0].id,p.combos[1].id);
    if(sc)return {type:"fuse",txt:"FUSION : "+sc.name+" ("+sc.desc+")"};
   }
   return {type:"lvl",txt:"Cumul Niv."+newLvl+" : "+c.name+" ("+c.desc+")"};
  }
 }

 for(const c of COMBOS){
  if(p.combos.some(x=>x.id===c.id))continue;
  const targetLvl=Math.min(nextInv[c.req[0]],nextInv[c.req[1]])-p.fusedLvl[c.id];
  if(targetLvl>0){
   if(p.combos.length>=MAX_COMBOS)return {type:"full",txt:"Slots combos pleins ("+MAX_COMBOS+"/"+MAX_COMBOS+")"};
   if(p.combos.length===1&&(p.combos[0].lvl+targetLvl)>=3){
    if(p.supers.length>=MAX_SUPER)return {type:"full",txt:"Max 1 Super-Combo · Combo : "+c.name};
    const sc=findSuper(p.combos[0].id,c.id);
    if(sc)return {type:"fuse",txt:"FUSION : "+sc.name+" ("+sc.desc+")"};
   }
   return {type:"new",txt:"Combo : "+c.name+" ("+c.desc+")"};
  }
 }
 return null;
}

function applyUpgrade(r,p,uIdx){
 UPS[uIdx][2](p);
 p.invList[uIdx]++;

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

 if(p.supers.length<MAX_SUPER&&p.combos.length===2&&(p.combos[0].lvl+p.combos[1].lvl)>=3){
  const cA=p.combos[0],cB=p.combos[1];
  const sc=findSuper(cA.id,cB.id);
  if(sc){
   p.fusedLvl[cA.id]+=cA.lvl;
   p.fusedLvl[cB.id]+=cB.lvl;
   p.combos=[];
   p.supers.push({id:sc.id,lvl:1});
   sc.apply(p);
   r.ev.push([Math.round(p.x),Math.round(p.y),6,p.i,sc.id,1]);
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

function shootX(r,x,y,vx,vy,dmg,l=3.4){
 r.X.push({x,y,vx,vy,d:dmg,l});
}

function spawnBoss(r,forcedType){
 const w=r.wave,pCount=r.pl.length;
 const nHp=1+(pCount-1)*0.55;
 const nDmg=1+(pCount-1)*0.18;
 const scHp=bossHpScale(w),scDmg=bossDmgScale(w);
 const bType=forcedType!==undefined?forcedType:Math.floor((w/5-1)%5);
 const [x,y]=edgePos(32);

 let e={k:4,bk:bType,r:30,xp:14+Math.floor(w/2),d:26*nDmg*scDmg,bd:13*nDmg*scDmg,sh:2.0,sp2:3.2,sp3:5.5,dash:0,chain:0,windup:0,spiral:0,vx:0,vy:0};
 if(bType===0){e.hp=(145+w*24)*nHp*scHp;e.sp=38;e.r=32;e.d=30*nDmg*scDmg}
 else if(bType===1){e.hp=(120+w*20)*nHp*scHp;e.sp=64;e.r=26;e.d=24*nDmg*scDmg}
 else if(bType===2){e.hp=(130+w*21)*nHp*scHp;e.sp=34;e.r=28}
 else if(bType===3){e.hp=(160+w*25)*nHp*scHp;e.sp=30;e.r=34}
 else{e.hp=(200+w*30)*nHp*scHp;e.sp=42;e.r=36;e.d=34*nDmg*scDmg;e.bd=15*nDmg*scDmg}

 e.x=x;e.y=y;e.mh=e.hp;e.bc=0;
 r.E.push(e);
}

function spawnE(r){
 const w=r.wave,pCount=r.pl.length;
 const nHp=1+(pCount-1)*0.32;
 const nDmg=1+(pCount-1)*0.09;
 const scHp=mobHpScale(w),scDmg=mobDmgScale(w);
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
 if(k===1)e={k:1,r:8,hp:(1.3+w*.20)*nHp*scHp,sp:100,xp:1,d:6*nDmg*scDmg};
 else if(k===2)e={k:2,r:17,hp:(7.5+w*1.05)*nHp*scHp,sp:41,xp:3,d:13*nDmg*scDmg};
 else if(k===3)e={k:3,r:10,hp:(2.3+w*.36)*nHp*scHp,sp:52,xp:2,d:6*nDmg*scDmg,bd:8*nDmg*scDmg,sh:2.2};
 else if(k===5)e={k:5,r:10,hp:(2.5+w*.38)*nHp*scHp,sp:64,xp:2,d:8*nDmg*scDmg,tp:2.7};
 else if(k===6)e={k:6,r:9,hp:(1.6+w*.22)*nHp*scHp,sp:110,xp:2,d:12*nDmg*scDmg,bd:8*nDmg*scDmg};
 else if(k===7)e={k:7,r:13,hp:(4.6+w*.68)*nHp*scHp,sp:45,xp:2,d:13*nDmg*scDmg,chg:2.8,dash:0,vx:0,vy:0};
 else if(k===8)e={k:8,r:12,hp:(3.8+w*.55)*nHp*scHp,sp:43,xp:2,d:8*nDmg*scDmg,bd:8.5*nDmg*scDmg,sh:2.6};
 else if(k===9)e={k:9,r:13,hp:(5.0+w*.72)*nHp*scHp,sp:38,xp:3,d:7*nDmg*scDmg,sum:3.8};
 else e={k:0,r:11,hp:(1.9+w*.33)*nHp*scHp,sp:62+Math.min(w*1.3,28),xp:1,d:7*nDmg*scDmg};

 e.x=x;e.y=y;e.mh=e.hp;e.bc=0;
 r.E.push(e);
}

function explodeKamikaze(r,e){
 r.ev.push([Math.round(e.x),Math.round(e.y),6]);
 const bd=e.bd||8*mobDmgScale(r.wave);
 for(let i=0;i<6;i++){
  const a=i*1.0472;
  shootX(r,e.x,e.y,Math.cos(a)*195,Math.sin(a)*195,bd,2.4);
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

function damagePlayer(p,rawDmg){
 const dmg=rawDmg*(p.linked===2?0.75:1);
 p.hp-=dmg;
 p.inv=.75;
 p.st.taken+=dmg;
 if(p.hp<=0){p.hp=0;p.down=1;p.rev=0;p.revBy=0}
}

function tick(r){
 if(r.st!=="play")return;
 if(r.paused||r.pl.some(p=>p.ch!==null))return;

 r.t+=DT;
 const pl=r.pl,al=pl.filter(p=>!p.down);
 const pRate=1+(pl.length-1)*0.12;

 // Calcul des liens entre joueurs et détection du Lien Total (graphe complet)
 r.links=[];
 for(const p of pl)p.linked=0;
 for(let i=0;i<al.length;i++){
  for(let j=i+1;j<al.length;j++){
   if(dist(al[i],al[j])<205){
    al[i].linked=1;al[j].linked=1;
    r.links.push([al[i].i,al[j].i]);
   }
  }
 }
 const neededPairs=(pl.length*(pl.length-1))/2;
 r.fullLink=(pl.length>=2&&al.length===pl.length&&r.links.length===neededPairs)?1:0;
 if(r.fullLink)for(const p of al)p.linked=2;

 for(const p of al){
  const full=p.linked===2;
  const spdMult=full?1.15:1;
  const regenBonus=full?3.0:(p.linked===1?0.8:0);
  const dmgMult=full?1.65:(p.linked===1?1.25:1);
  const rateMult=full?1.60:(p.linked===1?1.30:1);

  const l=Math.hypot(p.dx,p.dy),k=l>1?1/l:1,sp=175*p.S.speed*spdMult*(p.dsh>0?3.2:1);
  p.x=Math.max(p.r,Math.min(W-p.r,p.x+p.dx*k*sp*DT));
  p.y=Math.max(p.r,Math.min(H-p.r,p.y+p.dy*k*sp*DT));
  p.inv-=DT;p.dsh-=DT;p.dc-=DT;
  p.hp=Math.min(p.max,p.hp+(p.S.regen+regenBonus)*DT);
  p.cd-=DT;
  if(p.cd<=0&&r.E.length){
   let n=null,nd=1e9;
   for(const e of r.E){const d=(e.x-p.x)**2+(e.y-p.y)**2;if(d<nd){nd=d;n=e}}
   const an=Math.atan2(n.y-p.y,n.x-p.x),dm=p.S.dmg*dmgMult;
   const hasHeavy=p.combos.some(c=>c.id===0)||p.supers.length>0||full;
   for(let i=0;i<p.S.multi;i++){
    const a=an+(i-(p.S.multi-1)/2)*.18;
    r.B.push({x:p.x,y:p.y,vx:Math.cos(a)*460,vy:Math.sin(a)*460,l:1.1,p:p.S.pierce,h:[],o:p.i,d:dm,hv:hasHeavy?1:0});
   }
   p.sc=(p.sc+1)%256;
   p.cd=.52/(p.S.rate*rateMult);
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
   const enraged=e.hp<e.mh*0.5;
   const rMult=pRate*(enraged?1.32:1);

   if(e.bk===0){
    if(e.dash>0){
     e.dash-=DT;
     e.x=Math.max(e.r,Math.min(W-e.r,e.x+e.vx*DT));
     e.y=Math.max(e.r,Math.min(H-e.r,e.y+e.vy*DT));
     if(Math.random()<0.35){
      const a=Math.random()*6.283;
      shootX(r,e.x,e.y,Math.cos(a)*130,Math.sin(a)*130,e.bd,2.6);
     }
    }else if(e.windup>0){
     e.windup-=DT;
     if(e.windup<=0){
      r.ev.push([Math.round(e.x),Math.round(e.y),4]);
      const cnt=enraged?20:14;
      for(let i=0;i<cnt;i++){
       const a=i*(6.283/cnt)+r.t;
       shootX(r,e.x,e.y,Math.cos(a)*175,Math.sin(a)*175,e.bd,3.8);
      }
     }
    }else{
     e.x+=(t.x-e.x)/d*e.sp*DT;e.y+=(t.y-e.y)/d*e.sp*DT;
     e.sh-=DT*rMult;
     if(e.sh<=0){
      e.sh=2.3;
      const ba=Math.atan2(t.y-e.y,t.x-e.x);
      for(let i=-2;i<=2;i++){
       const a=ba+i*.2;
       shootX(r,e.x,e.y,Math.cos(a)*210,Math.sin(a)*210,e.bd,3.4);
      }
     }
     e.sp2-=DT*rMult;
     if(e.sp2<=0){
      e.sp2=4.6;
      e.windup=0.65;
     }
     if(enraged){
      e.sp3-=DT;
      if(e.sp3<=0){e.sp3=4.5;e.dash=.42;e.vx=(t.x-e.x)/d*340;e.vy=(t.y-e.y)/d*340}
     }
    }
   }else if(e.bk===1){
    if(e.dash>0){
     e.dash-=DT;
     e.x=Math.max(e.r,Math.min(W-e.r,e.x+e.vx*DT));
     e.y=Math.max(e.r,Math.min(H-e.r,e.y+e.vy*DT));
     if(e.dash<=0){
      const ba=Math.atan2(t.y-e.y,t.x-e.x);
      for(let i=-2;i<=2;i++){
       const a=ba+i*.16;
       shootX(r,e.x,e.y,Math.cos(a)*245,Math.sin(a)*245,e.bd,2.8);
      }
      if(e.chain>0){
       e.chain--;
       e.windup=0.22;
      }
     }
    }else if(e.windup>0){
     e.windup-=DT;
     if(e.windup<=0){
      e.dash=.32;
      e.vx=(t.x-e.x)/d*420;e.vy=(t.y-e.y)/d*420;
     }
    }else{
     e.x+=(t.x-e.x)/d*e.sp*DT;e.y+=(t.y-e.y)/d*e.sp*DT;
     e.sp2-=DT*rMult;
     if(e.sp2<=0){
      e.sp2=3.6;
      e.chain=enraged?2:1;
      e.windup=0.45;
     }
     e.sh-=DT*rMult;
     if(e.sh<=0){
      e.sh=2.8;
      const cnt=enraged?12:8;
      for(let i=0;i<cnt;i++){
       const a=i*(6.283/cnt)+r.t*1.4;
       shootX(r,e.x,e.y,Math.cos(a)*195,Math.sin(a)*195,e.bd,3.2);
      }
     }
    }
   }else if(e.bk===2){
    const v=td<220?0:e.sp;
    e.x+=(t.x-e.x)/d*v*DT;e.y+=(t.y-e.y)/d*v*DT;
    for(const p of al){
     const pd=dist(e,p);
     if(pd>45&&pd<310){
      const pull=(enraged?52:34)*DT;
      p.x=Math.max(p.r,Math.min(W-p.r,p.x+(e.x-p.x)/pd*pull));
      p.y=Math.max(p.r,Math.min(H-p.r,p.y+(e.y-p.y)/pd*pull));
     }
    }
    e.sp2-=DT*rMult;
    if(e.sp2<=0){
     e.sp2=4.2;
     e.x=rnd(80,W-80);e.y=rnd(80,H-80);
     r.ev.push([Math.round(e.x),Math.round(e.y),2]);
     const cnt=enraged?12:8;
     for(let i=0;i<cnt;i++){
      const a=i*(6.283/cnt);
      shootX(r,e.x,e.y,Math.cos(a)*185,Math.sin(a)*185,e.bd,3.4);
     }
    }
    e.sh-=DT*rMult;
    if(e.sh<=0){
     e.sh=1.7;
     const ba=Math.atan2(t.y-e.y,t.x-e.x);
     for(let i=-2;i<=2;i++){const a=ba+i*.22;shootX(r,e.x,e.y,Math.cos(a)*215,Math.sin(a)*215,e.bd,3.2)}
    }
    e.sp3-=DT*rMult;
    if(e.sp3<=0){
     e.sp3=4.8;
     e.spiral=1.2;
    }
    if(e.spiral>0){
     e.spiral-=DT;
     if(Math.floor(e.spiral*15)!==Math.floor((e.spiral+DT)*15)){
      const a=r.t*6.5;
      shootX(r,e.x,e.y,Math.cos(a)*195,Math.sin(a)*195,e.bd,3.2);
      shootX(r,e.x,e.y,Math.cos(a+3.14)*195,Math.sin(a+3.14)*195,e.bd,3.2);
     }
    }
   }else if(e.bk===3){
    e.x+=(t.x-e.x)/d*e.sp*DT;e.y+=(t.y-e.y)/d*e.sp*DT;
    e.sp2-=DT*rMult;
    if(e.sp2<=0&&r.E.length<55){
     e.sp2=3.8;
     const scHp=bossHpScale(r.wave),scDmg=bossDmgScale(r.wave),nHp=1+(pl.length-1)*0.55,nDmg=1+(pl.length-1)*0.18;
     for(let i=0;i<3;i++){
      const sa=i*2.09+r.t;
      const sx=Math.max(20,Math.min(W-20,e.x+Math.cos(sa)*40)),sy=Math.max(20,Math.min(H-20,e.y+Math.sin(sa)*40));
      const m={k:1,r:8,hp:(1.8+r.wave*.2)*nHp*scHp,sp:104,xp:1,d:8*nDmg*scDmg,x:sx,y:sy,bc:0};m.mh=m.hp;r.E.push(m);
     }
     if(enraged){
      const km={k:6,r:9,hp:(2.2+r.wave*.25)*nHp*scHp,sp:120,xp:2,d:16*nDmg*scDmg,bd:11*nDmg*scDmg,x:e.x,y:e.y,bc:0};km.mh=km.hp;r.E.push(km);
     }
     if(r.E.length>3)e.hp=Math.min(e.mh,e.hp+e.mh*0.02);
    }
    e.sh-=DT*rMult;
    if(e.sh<=0){
     e.sh=2.1;
     for(let arm=0;arm<4;arm++){
      const base=arm*1.5708+r.t*1.2;
      for(let s=-1;s<=1;s++){
       const a=base+s*.14;
       shootX(r,e.x,e.y,Math.cos(a)*180,Math.sin(a)*180,e.bd,3.5);
      }
     }
    }
   }else{
    if(e.windup>0){
     e.windup-=DT;
     if(e.windup<=0){
      r.ev.push([Math.round(e.x),Math.round(e.y),4]);
      const cnt=enraged?22:16;
      for(let i=0;i<cnt;i++){
       const a=i*(6.283/cnt)+r.t;
       shootX(r,e.x,e.y,Math.cos(a)*185,Math.sin(a)*185,e.bd,4.0);
      }
     }
    }else{
     e.x+=(t.x-e.x)/d*e.sp*DT;e.y+=(t.y-e.y)/d*e.sp*DT;
     e.sh-=DT*rMult;
     if(e.sh<=0){
      e.sh=2.0;
      const cnt=enraged?14:10;
      for(let i=0;i<cnt;i++){
       const a=i*(6.283/cnt)+r.t*1.8;
       shootX(r,e.x,e.y,Math.cos(a)*175,Math.sin(a)*175,e.bd,4.0);
      }
      const ba=Math.atan2(t.y-e.y,t.x-e.x);
      for(let j=-1;j<=1;j++)shootX(r,e.x,e.y,Math.cos(ba+j*.18)*240,Math.sin(ba+j*.18)*240,e.bd,3.4);
     }
     e.sp2-=DT*rMult;
     if(e.sp2<=0&&r.E.length<52){
      e.sp2=4.8;
      const scHp=bossHpScale(r.wave),scDmg=bossDmgScale(r.wave),nHp=1+(pl.length-1)*0.55,nDmg=1+(pl.length-1)*0.18;
      const eliteK=Math.random()>.5?7:8;
      const m=eliteK===7
       ?{k:7,r:13,hp:(6.0+r.wave*.9)*nHp*scHp,sp:50,xp:2,d:17*nDmg*scDmg,chg:2.2,dash:0,vx:0,vy:0,x:e.x,y:e.y,bc:0}
       :{k:8,r:12,hp:(5.0+r.wave*.75)*nHp*scHp,sp:48,xp:2,d:11*nDmg*scDmg,bd:12*nDmg*scDmg,sh:2.0,x:e.x,y:e.y,bc:0};
      m.mh=m.hp;r.E.push(m);
     }
     e.sp3-=DT*rMult;
     if(e.sp3<=0){
      e.sp3=6.2;
      e.x=W/2+rnd(-120,120);e.y=H/2+rnd(-90,90);
      r.ev.push([Math.round(e.x),Math.round(e.y),2]);
      e.windup=0.7;
     }
    }
   }
  }else if(e.k===5){
   e.x+=(t.x-e.x)/d*e.sp*DT;e.y+=(t.y-e.y)/d*e.sp*DT;
   e.tp-=DT;
   if(e.tp<=0){
    e.tp=2.7;
    const step=Math.min(110,Math.max(40,td-28));
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
     e.chg=3.0;e.dash=.40;
     e.vx=(t.x-e.x)/d*320;e.vy=(t.y-e.y)/d*320;
    }
   }
  }else if(e.k===8){
   const v=td<250?0:e.sp;
   e.x+=(t.x-e.x)/d*v*DT;e.y+=(t.y-e.y)/d*v*DT;
   e.sh-=DT;
   if(e.sh<=0){
    e.sh=2.6;
    const ba=Math.atan2(t.y-e.y,t.x-e.x);
    const bd=e.bd||8.5*mobDmgScale(r.wave);
    for(let i=-1;i<=1;i++){const a=ba+i*.22;shootX(r,e.x,e.y,Math.cos(a)*185,Math.sin(a)*185,bd,3.2)}
   }
  }else if(e.k===9){
   const v=td<260?0:e.sp;
   e.x+=(t.x-e.x)/d*v*DT;e.y+=(t.y-e.y)/d*v*DT;
   e.sum-=DT;
   if(e.sum<=0&&r.E.length<45){
    e.sum=3.8;
    const scHp=mobHpScale(r.wave),scDmg=mobDmgScale(r.wave),nHp=1+(pl.length-1)*0.32,nDmg=1+(pl.length-1)*0.09;
    for(let i=0;i<2;i++){
     const a=Math.random()*6.283;
     const sx=Math.max(18,Math.min(W-18,e.x+Math.cos(a)*26));
     const sy=Math.max(18,Math.min(H-18,e.y+Math.sin(a)*26));
     const m={k:1,r:8,hp:(1.2+r.wave*.18)*nHp*scHp,sp:98,xp:1,d:6*nDmg*scDmg,x:sx,y:sy,bc:0};m.mh=m.hp;r.E.push(m);
    }
    r.ev.push([Math.round(e.x),Math.round(e.y),9]);
   }
  }else{
   const v=e.k===3&&td<220?0:e.sp;
   e.x+=(t.x-e.x)/d*v*DT;e.y+=(t.y-e.y)/d*v*DT;
   if(e.k===3){
    e.sh=(e.sh===undefined?2.2:e.sh)-DT;
    if(e.sh<=0){
     e.sh=2.4;
     const bd=e.bd||8*mobDmgScale(r.wave);
     shootX(r,e.x,e.y,(t.x-e.x)/d*175,(t.y-e.y)/d*175,bd,3.2);
    }
   }
  }

  if(td<e.r+t.r&&t.inv<=0){
   damagePlayer(t,e.d);
   if(e.k===6){e.hp=0;e.dead=true}
  }
 }

 r.E=r.E.filter(e=>{
  if(e.hp>0)return true;
  r.kills++;r.G.push({x:e.x,y:e.y,v:e.xp});r.ev.push([Math.round(e.x),Math.round(e.y),e.k]);
  if(e.k===6)explodeKamikaze(r,e);
  if(e.k===4)for(const p of pl){p.pend++;if(!p.ch)offer(p);if(p.down){p.down=0;p.rev=0;p.revBy=0;p.inv=2}p.hp=Math.min(p.max,Math.max(p.hp,p.max*.5)+p.max*.35)}
  return false;
 });

 // Réanimation accélérée quand plusieurs alliés sont dans le cercle
 for(const d of pl)if(d.down){
  const helpers=al.filter(p=>!p.down&&dist(p,d)<62);
  if(helpers.length>0){
   const revSpeed=1+(helpers.length-1)*0.85;
   d.rev+=DT*revSpeed;
   d.revBy=helpers.length;
  }else{
   d.rev=Math.max(0,d.rev-DT*.5);
   d.revBy=0;
  }
  if(d.rev>=2.2){
   d.down=0;d.hp=d.max*.6;d.inv=2.5;d.rev=0;d.revBy=0;
   for(const h of helpers)h.st.revives++;
  }
 }
 if(pl.every(p=>p.down)){r.st="over";return}

 if(r.toSpawn>0){
  r.spawnCd-=DT;
  if(r.spawnCd<=0){
   spawnE(r);
   r.toSpawn--;
   const pSpawnRate=1+(pl.length-1)*0.18;
   r.spawnCd=Math.max(0.08,(0.40-r.wave*0.005)/pSpawnRate);
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

   if(r.wave>=45&&r.wave<=50){
    const multBoss=1+(pl.length-1)*0.48;
    const bossCount=r.wave===50?5:Math.min(4,2+Math.floor((r.wave-45)/2));
    const order=[0,1,2,3,4].sort(()=>Math.random()-.5);
    for(let bi=0;bi<bossCount;bi++)spawnBoss(r,order[bi%5]);
    r.toSpawn=Math.round((10+r.wave*.6)*multBoss);
   }else if(r.wave%5===0){
    const multBoss=1+(pl.length-1)*0.48;
    spawnBoss(r);
    r.toSpawn=Math.round((6+r.wave*.8)*multBoss);
   }else{
    const multMob=1+(pl.length-1)*0.32;
    r.toSpawn=Math.round((5+r.wave*1.85)*multMob);
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
   damagePlayer(p,b.d||10);
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
    r.xp-=r.need;r.lvl++;r.need=nextNeed(r.lvl,pl.length);
    for(const p of pl){p.pend++;if(p.ch===null)offer(p)}
   }
   return false;
  }
  return true;
 });
}

function broadcast(r,obj){
 const raw=JSON.stringify(obj);
 for(const p of r.pl)if(p.ws.readyState===1)p.ws.send(raw);
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
  bName=bosses.length+" BOSS ("+bosses.map(b=>BOSS_NAMES[b.bk]).join(" · ")+")";
  bHp=tot>0?R(cur/tot*100):0;
 }
 const ended=(r.st==="over"||r.st==="win");
 const endStats=ended?r.pl.map(p=>({
  i:p.i,
  name:p.name,
  skin:p.skin,
  kills:p.st.kills,
  dmg:R(p.st.dmg),
  taken:R(p.st.taken),
  rev:p.st.revives,
  gems:p.st.gems,
  cmb:p.combos,
  sup:p.supers
 })):null;

 const b={t:"s",st:r.st,code:r.code,n:r.pl.length,names:r.pl.map(p=>p.name),skins:r.pl.map(p=>p.skin),tm:R(r.t*10)/10,k:r.kills,l:r.lvl,xp:r.xp,nd:r.need,lks:r.links,flk:r.fullLink,wv:r.wave,mw:MAX_WAVE,rem:r.E.length+r.toSpawn,pz:pz,mpz:r.paused?1:0,pby:r.pausedBy,bn:bName,bh:bHp,stats:endStats,
  p:r.pl.map(p=>[R(p.x),R(p.y),R(p.hp),p.max,p.down,R(p.rev*100)/100,p.inv>0?1:0,p.pend,R(85*p.S.magnet),R(Math.max(0,p.dc)*10)/10,p.S.orb,p.ch!==null?1:0,p.dsh>0?1:0,p.sc,p.S.orbSpd,p.linked,p.skin,p.revBy||0]),
  E:r.E.map(e=>[R(e.x),R(e.y),e.k,R(e.hp/e.mh*100),e.bk||0,(e.dash>0||e.windup>0||e.spiral>0)?1:0]),
  B:r.B.map(x=>[R(x.x),R(x.y),x.vx,x.vy,x.o,x.hv||0]),
  G:r.G.map(g=>[R(g.x),R(g.y)]),X:r.X.map(x=>[R(x.x),R(x.y)]),oa:R(r.t*300)/100,ev:r.ev};
 r.ev=[];
 for(const p of r.pl)if(p.ws.readyState===1){
  const full=p.linked===2;
  const dmgM=full?1.65:(p.linked===1?1.25:1);
  const rateM=full?1.60:(p.linked===1?1.30:1);
  p.ws.send(JSON.stringify({
   ...b,me:p.i,inv:p.invList,cmb:p.combos,sup:p.supers,
   stMe:{
    dmg:R(p.S.dmg*dmgM*100)/100,
    rate:R((p.S.rate*rateM/.52)*10)/10,
    multi:p.S.multi,
    pierce:p.S.pierce
   },
   ch:p.ch?p.ch.map(i=>[UPS[i][0],UPS[i][1],comboHint(p,i)]):null
  }));
 }
}
setInterval(()=>{for(const r of rooms.values()){tick(r);snap(r)}},1000/30);

wss.on("connection",ws=>{
 ws.on("message",m=>{
  let d;try{d=JSON.parse(m)}catch(e){return}
  if(d.t==="join"&&!ws.r){
   const c=String(d.room||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6)||"SALLE";
   let r=rooms.get(c);
   if(!r){r={code:c,pl:[],st:"wait"};reset(r);rooms.set(c,r)}
   if(r.pl.length>=MAX_PLAYERS)return ws.send(JSON.stringify({t:"full"}));
   const p=mkP(ws,r.pl.length,d.name,d.skin);
   r.pl.push(p);ws.r=r;ws.p=p;
   if(r.st==="wait")r.need=nextNeed(1,r.pl.length);
   broadcast(r,{t:"chat",sys:1,txt:p.name+" a rejoint l'escouade."});
   return;
  }
  const r=ws.r,p=ws.p;if(!r||!p)return;
  if(d.t==="in"){p.dx=Math.max(-1,Math.min(1,+d.dx||0));p.dy=Math.max(-1,Math.min(1,+d.dy||0))}
  else if(d.t==="skin"&&r.st==="wait"){
   p.skin=cleanSkin(d.skin);
  }
  else if(d.t==="chat"){
   const now=Date.now();
   if(p.lastChat&&now-p.lastChat<400)return;
   p.lastChat=now;
   const msg=String(d.msg||"").replace(/[\r\n\t]/g," ").trim().slice(0,120);
   if(msg)broadcast(r,{t:"chat",i:p.i,name:p.name,txt:msg});
  }
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
  else if(d.t==="start"&&r.st==="wait"){
   r.need=nextNeed(1,r.pl.length);
   r.st="play";
  }
  else if(d.t==="restart"&&(r.st==="over"||r.st==="win")){reset(r);r.st="play"}
 });
 ws.on("close",()=>{
  const r=ws.r,left=ws.p;if(!r)return;
  r.pl=r.pl.filter(p=>p!==left);r.pl.forEach((p,i)=>p.i=i);
  if(!r.pl.length)rooms.delete(r.code);
  else{
   if(r.paused)r.paused=false;
   if(left)broadcast(r,{t:"chat",sys:1,txt:left.name+" a quitté la partie."});
  }
 });
});
srv.listen(PORT,"0.0.0.0",()=>console.log("Survivor Squad (Skins + Lien Total + Revive Co-op) sur le port "+PORT));