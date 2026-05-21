
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, set, update, onValue, get } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const DATA = window.GAME_DATA;
const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
const shuffle = arr => { const x=[...arr]; for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]];} return x; };
const getUid = () => localStorage.qbasisAgileUid || (localStorage.qbasisAgileUid = crypto.randomUUID());

let db=null, online=false, room=null, state=null;
let user={id:getUid(), name:"", isModerator:false};

try{
  if(firebaseConfig && firebaseConfig.apiKey){
    db=getDatabase(initializeApp(firebaseConfig));
    online=true;
    $("connectionBadge").textContent="Realtime aktiv";
    $("connectionBadge").className="badge online";
  }
}catch(e){ console.error(e); }

const normalizeRoom = v => String(v||"").trim().toUpperCase().replace(/[^A-Z0-9-]/g,"");
const randomRoom = () => "QBASIS-" + Math.random().toString(36).slice(2,6).toUpperCase();
const pinHash = v => btoa(unescape(encodeURIComponent(String(v||""))));
const roomRef = path => ref(db, `qbasisRooms/${room}${path?"/"+path:""}`);

function initialState(code, pin){
  const backlog=shuffle(DATA.stories.map((s,i)=>({id:"s"+i,title:s.title,text:s.text,category:s.category||"Schulentwicklung",sp:s.sp||5,progress:0,owner:null,ownerName:null,blockedBy:null,image:s.image||""})));
  return {
    room:code,moderatorPinHash:pinHash(pin || "1234"),phase:"lobby",cycle:1,week:1,
    participants:{},backlog,active:{},blocked:{},done:{},stored:{},
    currentCard:null,currentDilemma:null,lastRoll:null,reflections:{},
    log:[{t:Date.now(),text:"Gruppenraum erstellt."}]
  };
}
async function readFull(){ if(online){const snap=await get(roomRef());return snap.exists()?snap.val():null;} const raw=localStorage.getItem("qbasisRoom:"+room);return raw?JSON.parse(raw):null; }
async function writeFull(next){ if(online) await set(roomRef(), next); else {state=next; localStorage.setItem("qbasisRoom:"+room, JSON.stringify(next)); render();} }
async function save(patch){ if(online) await update(roomRef(), patch); else {state={...state,...patch}; localStorage.setItem("qbasisRoom:"+room, JSON.stringify(state)); render();} }
async function log(text){ await save({log:[{t:Date.now(),text},...(state.log||[])].slice(0,100)}); }
function requireModerator(){ if(!user.isModerator){ alert("Diese Funktion ist der Moderation vorbehalten."); return false; } return true; }

async function createRoom(){
  room=normalizeRoom($("roomInput").value)||randomRoom(); $("roomInput").value=room;
  user.name=$("nameInput").value.trim()||"Moderation"; user.isModerator=true;
  const pin=$("pinInput").value.trim()||"1234";
  await writeFull(initialState(room,pin));
  await enterRoom();
}
async function joinRoom(asModerator=false){
  room=normalizeRoom($("roomInput").value); if(!room) return alert("Bitte Raumcode eingeben.");
  user.name=$("nameInput").value.trim()||"Teilnehmer/in";
  const existing=await readFull();
  if(!existing) return alert("Raum existiert noch nicht. Die Moderation muss ihn zuerst erstellen.");
  if(asModerator){
    const pin=$("pinInput").value.trim();
    if(pinHash(pin)!==existing.moderatorPinHash) return alert("Moderations-PIN stimmt nicht.");
    user.isModerator=true;
  } else user.isModerator=false;
  await enterRoom();
}
async function enterRoom(){
  $("setup").classList.add("hidden"); $("game").classList.remove("hidden");
  if(online) onValue(roomRef(), snap=>{state=snap.val(); render();});
  else {state=await readFull(); render();}
  await saveParticipant();
}
async function saveParticipant(){
  const p={id:user.id,name:user.name,isModerator:user.isModerator,joinedAt:Date.now()};
  if(online) await set(roomRef("participants/"+user.id),p);
  else {state.participants[user.id]=p; await writeFull(state);}
}

async function nextPhase(){
  if(!requireModerator()) return;
  if(state.phase==="lobby") return startDilemma();
  if(state.phase==="dilemma") return save({phase:"select",currentCard:null});
  if(state.phase==="select") return save({phase:"week",week:1,currentCard:null});
  if(state.phase==="week" && state.week===1) return save({week:2,currentCard:null});
  if(state.phase==="week" && state.week===2) return save({phase:"review",currentCard:null});
  if(state.phase==="review") return save({phase:"retro"});
  if(state.phase==="retro") return nextCycle();
}
async function startDilemma(){
  const d=shuffle(DATA.scenarios)[0] || {title:"Schulentwicklung unter Unsicherheit",situation:"Die Gruppe muss eine Führungsentscheidung treffen.",choices:[{label:"klein starten",text:"Pilotieren",effectText:"geringeres Risiko"},{label:"breit beteiligen",text:"Beteiligung stärken",effectText:"höherer Aufwand"},{label:"klar steuern",text:"Zügig entscheiden",effectText:"mehr Tempo"}]};
  await save({phase:"dilemma",currentDilemma:d,currentCard:null});
  await log("Dilemma gestartet.");
}
async function chooseDilemma(i){
  if(!requireModerator()) return;
  const d=state.currentDilemma, choice=d.choices[i];
  await save({phase:"select",decision:{cycle:state.cycle,title:d.title,choice:choice.label,effect:choice.effectText}});
  await log("Dilemma entschieden: "+choice.label);
}
async function nextCycle(){
  if(!requireModerator()) return;
  const backlog=[...state.backlog,...Object.values(state.active||{}).map(s=>({...s,owner:null,ownerName:null}))];
  await save({cycle:state.cycle+1,phase:"dilemma",week:1,active:{},backlog,currentCard:null,currentDilemma:null,lastRoll:null});
  await startDilemma();
}
async function resetRoom(){ if(!requireModerator()) return; if(confirm("Raum wirklich zurücksetzen?")){ await writeFull(initialState(room,"1234")); await saveParticipant(); } }

async function claimStory(id){
  if(state.phase!=="select") return alert("Vorhaben können nur in der Auswahlphase gewählt werden.");
  if(Object.values(state.active||{}).some(s=>s.owner===user.id)) return alert("Du hast bereits ein Vorhaben gewählt.");
  const story=state.backlog.find(s=>s.id===id); if(!story) return;
  await save({backlog:state.backlog.filter(s=>s.id!==id),active:{...state.active,[id]:{...story,owner:user.id,ownerName:user.name}}});
  await log(user.name+" wählt: "+story.title);
}
async function drawCard(){
  if(state.phase!=="week") return alert("Karten werden nur in der Umsetzungsphase gezogen.");
  if(state.currentCard) return alert("Es liegt bereits eine aktive Karte. Diese muss erst angewendet werden.");
  const type=shuffle(["event","problem","solution"])[0];
  const source=type==="event"?DATA.events:type==="problem"?DATA.problems:DATA.solutions;
  const card=shuffle(source)[0];
  await save({currentCard:{type,card,drawnBy:user.id,drawnByName:user.name,t:Date.now()}});
  await log(user.name+" zieht: "+card.title);
}
async function applyCurrentCard(){
  const cc=state.currentCard; if(!cc) return;
  if(cc.drawnBy!==user.id && !user.isModerator) return alert("Nur die ziehende Person oder die Moderation kann die Karte anwenden.");
  if(cc.type==="event"){ await save({currentCard:null}); await log("Ereignis durchgeführt."); return; }
  if(cc.type==="problem"){
    const own=Object.values(state.active||{}).find(s=>s.owner===cc.drawnBy);
    if(!own) return alert("Keine passende eigene Aufgabe vorhanden.");
    const active={...state.active}; delete active[own.id];
    const blocked={...state.blocked,[own.id]:{...own,blockedBy:cc.card}};
    await save({active,blocked,currentCard:null}); await log("Problem blockiert: "+own.title); return;
  }
  if(cc.type==="solution"){
    const stored={...(state.stored||{})}; stored[cc.drawnBy]=[...(stored[cc.drawnBy]||[]),cc.card];
    await save({stored,currentCard:null}); await log("Intervention gespeichert: "+cc.card.title); return;
  }
}
async function useSolution(index, blockedId){
  const stored={...(state.stored||{})}, list=[...(stored[user.id]||[])], sol=list[index];
  const item=state.blocked[blockedId]; if(!sol||!item) return;
  if(item.blockedBy?.match!==sol.title) return alert("Diese Intervention passt nicht zu diesem Problem.");
  const blocked={...state.blocked}; delete blocked[blockedId];
  const active={...state.active,[blockedId]:{...item,blockedBy:null}};
  list.splice(index,1); stored[user.id]=list;
  await save({blocked,active,stored}); await log(user.name+" löst Blockade: "+item.title);
}
async function rollAndApply(id){
  if(state.phase!=="week") return;
  const story=state.active[id]; if(!story||story.owner!==user.id) return alert("Du kannst nur dein eigenes Vorhaben bearbeiten.");
  const dice=Array.from({length:5},()=>1+Math.floor(Math.random()*4)); const sum=dice.reduce((a,b)=>a+b,0);
  const active={...state.active}, done={...state.done};
  const upd={...story,progress:Math.min(story.sp,(story.progress||0)+sum)};
  if(upd.progress>=upd.sp){delete active[id]; done[id]=upd;} else active[id]=upd;
  await save({active,done,lastRoll:{by:user.name,dice,sum,story:story.title,t:Date.now()}});
  await log(`${user.name} würfelt ${dice.join("+")} = ${sum} KP für ${story.title}.`);
}
async function saveReflections(){
  const reflections={...(state.reflections||{})};
  reflections[user.id]={name:user.name,insight:$("refInsight")?.value||"",blockade:$("refBlockade")?.value||"",intervention:$("refIntervention")?.value||"",t:Date.now()};
  await save({reflections}); await log(user.name+" speichert Reflexion.");
}
function exportResults(){
  if(!requireModerator()) return;
  const data={room:state.room,cycle:state.cycle,phase:state.phase,participants:state.participants,done:state.done,blocked:state.blocked,reflections:state.reflections,log:state.log};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a");
  a.href=url; a.download=`${state.room}_ergebnisse.json`; a.click(); URL.revokeObjectURL(url);
}

function render(){
  if(!state) return;
  $("roomTitle").innerText="Gruppenraum "+state.room;
  $("phaseExplain").innerText=phaseText();
  $("roleNotice").innerText=user.isModerator?"Du bist Moderation. Du steuerst Phasen, Reset und Export.":"Du bist Teilnehmer/in. Du wählst ein Vorhaben, ziehst Karten, würfelst und reflektierst.";
  $("nextPhaseBtn").disabled=!user.isModerator; $("resetRoomBtn").disabled=!user.isModerator; $("exportBtn").disabled=!user.isModerator;
  $("participants").innerHTML=Object.values(state.participants||{}).map(p=>`<div class="participant ${p.isModerator?'mod':''}">${esc(p.name)}${p.isModerator?" · Moderation":""}</div>`).join("");
  $("metrics").innerHTML=[["Phase",label(state.phase)],["Zyklus",state.cycle],["Woche",state.phase==="week"?state.week:"-"],["Sammlung",state.backlog.length],["Aktiv",Object.keys(state.active||{}).length],["Blockiert",Object.keys(state.blocked||{}).length],["Fertig",Object.keys(state.done||{}).length]].map(([k,v])=>`<div class="metric"><span>${k}</span><strong>${v}</strong></div>`).join("");
  $("phasePanel").innerHTML=renderPhase();
  $("teamProfile").innerHTML=renderTeamProfile();
  $("backlog").innerHTML=state.backlog.map(renderBacklog).join("")||"<p>Keine Vorhaben.</p>";
  $("activeWork").innerHTML=Object.values(state.active||{}).map(renderActive).join("")||"<p>Keine Vorhaben.</p>";
  $("blocked").innerHTML=Object.values(state.blocked||{}).map(renderBlocked).join("")||"<p>Keine Blockaden.</p>";
  $("done").innerHTML=Object.values(state.done||{}).map(renderDone).join("")||"<p>Noch nichts abgeschlossen.</p>";
  $("currentStep").innerHTML=renderCurrent();
  $("storedSolutionsBox").innerHTML=renderStored();
  $("log").innerHTML=(state.log||[]).map(x=>new Date(x.t).toLocaleTimeString("de-DE")+" · "+esc(x.text)).join("<br>");
}
const label=p=>({lobby:"Lobby",dilemma:"Dilemma",select:"Vorhaben wählen",week:"Umsetzung",review:"Review",retro:"Retrospektive"})[p]||p;
function phaseText(){return {lobby:"Teilnehmende treten bei.",dilemma:"Die Moderation lässt einen Entscheidungsweg wählen.",select:"Jede Person wählt ein Vorhaben.",week:"Karte ziehen, anwenden, würfeln.",review:"Ergebnisse und Blockaden prüfen.",retro:"Arbeitsweise verbessern und Transfer sichern."}[state.phase]||"";}
function renderPhase(){
  if(state.phase==="lobby") return `<h2>Lobby</h2><p>Empfohlen: 4–6 Personen pro Gruppenraum. Moderation startet danach den ersten Entwicklungszyklus.</p>`;
  if(state.phase==="dilemma"){const d=state.currentDilemma; return `<h2>${esc(d.title)}</h2><p>${esc(d.situation)}</p><div class="choice-grid">${d.choices.map((c,i)=>`<button class="choice" ${!user.isModerator?'disabled':''} onclick="game.chooseDilemma(${i})"><strong>${esc(c.label)}</strong><br>${esc(c.text)}<br><small>${esc(c.effectText)}</small></button>`).join("")}</div>`;}
  if(state.phase==="select") return `<h2>Vorhaben wählen</h2><div class="phase-note">Jede Person wählt genau ein Vorhaben. Ziel ist Fokus, nicht maximale Auslastung.</div>`;
  if(state.phase==="week") return `<h2>Woche ${state.week}: Umsetzung</h2><div class="actions"><button class="primary" onclick="game.drawCard()">Karte ziehen</button></div><p>Karte anwenden, dann das eigene Vorhaben würfeln und bearbeiten.</p>`;
  if(state.phase==="review") return `<h2>Review</h2><ul><li>Welche Vorhaben sind wirklich abgeschlossen?</li><li>Welche Vorhaben blieben blockiert?</li><li>Welche Entscheidung hatte die stärkste Wirkung?</li></ul>`;
  if(state.phase==="retro") return `<h2>Retrospektive und Transfer</h2><div class="reflection"><label>Unsere wichtigste Erkenntnis zu agiler Schulentwicklung<textarea id="refInsight">${esc(state.reflections?.[user.id]?.insight||"")}</textarea></label><label>Eine typische Blockade schulischer Entwicklung<textarea id="refBlockade">${esc(state.reflections?.[user.id]?.blockade||"")}</textarea></label><label>Eine Führungsintervention, die ich mitnehme<textarea id="refIntervention">${esc(state.reflections?.[user.id]?.intervention||"")}</textarea></label><button class="primary" onclick="game.saveReflections()">Reflexion speichern</button></div>`;
}
function renderTeamProfile(){
  if(!state || state.phase==="lobby") return "";
  const active=Object.keys(state.active||{}).length, blocked=Object.keys(state.blocked||{}).length, done=Object.keys(state.done||{}).length, total=active+blocked+done;
  const focus=total?Math.max(0,100-Math.max(0,total-Object.keys(state.participants||{}).length)*15):100;
  const completion=total?Math.round(done/total*100):0;
  const blockage=total?Math.round(blocked/total*100):0;
  const interventions=Object.values(state.stored||{}).reduce((a,b)=>a+(b?.length||0),0);
  return `<h3>Teamprofil ohne Gewinnerlogik</h3><div class="profile-grid"><div class="profile-card"><strong>Fokusgrad</strong><br>${focus}%<br><span class="small">weniger Parallelität ist besser</span></div><div class="profile-card"><strong>Abschlussgrad</strong><br>${completion}%<br><span class="small">fertig statt angefangen</span></div><div class="profile-card"><strong>Blockadengrad</strong><br>${blockage}%<br><span class="small">sichtbare Hindernisse</span></div><div class="profile-card"><strong>Interventionen</strong><br>${interventions}<br><span class="small">vorbereitete Optionen</span></div></div>`;
}
function cardImg(s){return s.image?`<img src="${esc(s.image)}">`:"";}
function renderBacklog(s){return `<div class="card">${cardImg(s)}<strong>${esc(s.title)}</strong><p>${esc(s.text)}</p><div class="meta">${s.sp} KP · ${esc(s.category)}</div><button onclick="game.zoom('${s.id}')">🔍</button> ${state.phase==="select"?`<button class="primary" onclick="game.claimStory('${s.id}')">wählen</button>`:""}</div>`;}
function renderActive(s){return `<div class="card">${cardImg(s)}<strong>${esc(s.title)}</strong><p>${esc(s.text)}</p><div class="meta">${s.progress}/${s.sp} KP · ${esc(s.ownerName)}</div><button onclick="game.zoom('${s.id}')">🔍</button> ${s.owner===user.id&&state.phase==="week"?`<button class="primary" onclick="game.rollAndApply('${s.id}')">Würfeln & anwenden</button>`:""}</div>`;}
function renderBlocked(s){return `<div class="card problem">${cardImg(s)}<strong>${esc(s.title)}</strong><p>${esc(s.blockedBy?.text||"")}</p><div class="meta">Problem: ${esc(s.blockedBy?.title)} · passende Intervention: ${esc(s.blockedBy?.match)} · ${esc(s.ownerName||"")}</div><button onclick="game.zoom('${s.id}')">🔍</button></div>`;}
function renderDone(s){return `<div class="card solution">${cardImg(s)}<strong>${esc(s.title)}</strong><div class="meta">${s.sp} KP abgeschlossen · ${esc(s.ownerName||"")}</div></div>`;}
function renderCurrent(){
  const cc=state.currentCard; if(!cc) return "Keine aktive Karte.";
  const type=cc.type==="event"?"Ereignis":cc.type==="problem"?"Problem":"Intervention";
  return `<div class="card ${cc.type}"><strong>${type}: ${esc(cc.card.title)}</strong><p>${esc(cc.card.text)}</p><div class="meta">gezogen von ${esc(cc.drawnByName)}</div><button class="primary" onclick="game.applyCurrentCard()">anwenden</button></div>`;
}
function renderStored(){
  const mine=(state.stored||{})[user.id]||[], blocked=Object.values(state.blocked||{});
  if(!mine.length) return "Keine vorbereiteten Handlungsoptionen.";
  return mine.map((sol,i)=>{const matches=blocked.filter(b=>b.blockedBy?.match===sol.title);return `<div class="card solution"><strong>${esc(sol.title)}</strong><p>${esc(sol.text)}</p>${matches.map(b=>`<button class="good" onclick="game.useSolution(${i},'${b.id}')">lösen: ${esc(b.title)}</button>`).join("")||"<div class='meta'>Keine passende Blockade.</div>"}</div>`}).join("");
}
function openZoom(id){
  const all=[...state.backlog,...Object.values(state.active||{}),...Object.values(state.blocked||{}),...Object.values(state.done||{})];
  const s=all.find(x=>x.id===id); if(!s) return;
  $("zoomCard").innerHTML=`${cardImg(s)}<h2>${esc(s.title)}</h2><p>${esc(s.text)}</p><div class="meta">${s.sp} KP · ${esc(s.category)} · ${s.progress||0}/${s.sp}</div><button class="primary" onclick="game.closeZoom()">Schließen</button>`;
  $("zoomOverlay").classList.add("show");
}
function closeZoom(){$("zoomOverlay").classList.remove("show");}

window.game={createRoom,joinRoom,nextPhase,resetRoom,chooseDilemma,claimStory,drawCard,applyCurrentCard,rollAndApply,useSolution,saveReflections,exportResults,zoom:openZoom,closeZoom};
document.addEventListener("DOMContentLoaded",()=>{
  $("createRoomBtn").onclick=createRoom;
  $("joinRoomBtn").onclick=()=>joinRoom(false);
  $("joinModeratorBtn").onclick=()=>joinRoom(true);
  $("nextPhaseBtn").onclick=nextPhase;
  $("resetRoomBtn").onclick=resetRoom;
  $("exportBtn").onclick=exportResults;
  $("zoomOverlay").onclick=e=>{if(e.target.id==="zoomOverlay")closeZoom();}
});
