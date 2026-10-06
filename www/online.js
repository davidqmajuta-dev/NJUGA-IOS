/* ============================================================
   NJUGA/CASINO — Online Rooms client
   ------------------------------------------------------------
   How it works (plain English):
   - One phone CREATES a room and gets a 5-letter code. That phone is the
     "host": the game runs there exactly like it does against the computer,
     except the friend's moves replace the computer's moves.
   - The other phone JOINS with the code. It just shows what the host
     sends and sends back the moves the friend taps.
   - The relay server (see /server) only passes messages between the two.

   >>> AFTER YOU DEPLOY THE SERVER, PUT ITS ADDRESS ON THE LINE BELOW <<<
   Use wss:// (not https://). Example: 'wss://njuga-casino-relay.onrender.com'
   You can also type the address in the app (Online Rooms > Server address).
   ============================================================ */
const DEFAULT_SERVER_URL = 'wss://njuga-relay.onrender.com';

const net = {
  active: false,      // true once two players are in a live game
  role: null,         // 'host' | 'guest'
  ws: null,
  code: '',
  status: 'idle',     // idle | connecting | waiting | joined
  notice: '',
  lastSent: '',
  pingTimer: null,
  connectTimer: null
};

/* ---------- server address ---------- */
function netServerUrl(){
  try { return localStorage.getItem('njuga_server_url') || DEFAULT_SERVER_URL; }
  catch(e){ return DEFAULT_SERVER_URL; }
}
function netSetServerUrl(v){
  try { localStorage.setItem('njuga_server_url', (v||'').trim()); } catch(e){}
}
function netUrlIsPlaceholder(){ return netServerUrl().includes('YOUR-SERVER-NAME'); }

/* ---------- connection ---------- */
function netOpen(firstMessage){
  netCloseSocket();
  const urlInput = document.getElementById('netUrl');
  if(urlInput) netSetServerUrl(urlInput.value);
  const url = netServerUrl();
  if(netUrlIsPlaceholder() || !/^wss?:\/\//i.test(url)){
    net.notice = 'Enter your server address first (it starts with wss://).';
    net.status = 'idle';
    render();
    return;
  }
  net.status = 'connecting';
  net.notice = '';
  render();

  let ws;
  try { ws = new WebSocket(url); }
  catch(e){ net.status='idle'; net.notice='That server address does not look right.'; render(); return; }
  net.ws = ws;

  // A free server that has been asleep can take a while to wake up.
  net.connectTimer = setTimeout(()=>{
    if(net.ws===ws && ws.readyState!==1){
      net.notice = 'Could not reach the server. Check the address and your internet, then try again.';
      netResetSession(); render();
    }
  }, 60000);

  ws.onopen = ()=>{
    clearTimeout(net.connectTimer);
    net.pingTimer = setInterval(()=>netSend({type:'ping'}), 25000); // keeps the connection from idling out
    netSend(firstMessage);
  };
  ws.onmessage = (ev)=>{ let m; try{ m = JSON.parse(ev.data); }catch(e){ return; } netHandle(m); };
  ws.onerror = ()=>{ /* onclose follows and reports it */ };
  ws.onclose = ()=>{
    if(net.ws!==ws) return; // an old socket we already replaced
    const wasPlaying = net.active || net.status==='waiting' || net.status==='joined';
    netResetSession();
    net.notice = wasPlaying ? 'Connection to the server was lost.' : (net.notice || 'Could not connect to the server.');
    netGoOnlineScreen();
  };
}
function netSend(obj){
  if(net.ws && net.ws.readyState===1) net.ws.send(JSON.stringify(obj));
}
function netCloseSocket(){
  clearTimeout(net.connectTimer); clearInterval(net.pingTimer);
  if(net.ws){ const w=net.ws; net.ws=null; try{ w.close(); }catch(e){} }
}
function netResetSession(){
  netCloseSocket();
  net.active=false; net.role=null; net.code=''; net.status='idle'; net.lastSent='';
}
function netGoOnlineScreen(){
  if(typeof ui!=='undefined'){ ui.match=null; ui.screen='online'; }
  if(typeof state!=='undefined') state=null;
  render();
}
// Called by the Leave / Back buttons.
function netLeave(){
  const wasLive = net.active;
  netResetSession();
  net.notice='';
  if(typeof state!=='undefined') state=null;
  ui.match=null; ui.screen = wasLive ? 'menu' : 'online';
  render();
}

/* ---------- actions from the Online Rooms screen ---------- */
function netCreateRoom(){ net.role='host'; netOpen({type:'create'}); }
function netJoinRoom(){
  const el = document.getElementById('netCode');
  const code = ((el && el.value) || '').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5);
  if(code.length!==5){ net.notice='Type the 5-letter room code.'; render(); return; }
  net.role='guest'; netOpen({type:'join', code});
}

/* ---------- messages from the server ---------- */
function netHandle(m){
  switch(m.type){
    case 'created':            // host: room exists, wait for a friend
      net.code = m.code; net.status='waiting'; render(); break;
    case 'peer-joined':        // host: friend arrived, start the game
      net.active = true; net.status='joined'; net.lastSent='';
      ui.match = null; ui.screen='game';
      newGame();               // render() inside sends the first snapshot
      break;
    case 'joined':             // guest: in the room, host will start the game
      net.code = m.code; net.status='joined'; net.active=true; render(); break;
    case 'join-error':
      net.notice = m.reason==='room-full' ? 'That room already has two players.' : 'No room with that code. Check the letters and try again.';
      netResetSession(); render(); break;
    case 'peer-left':
      netResetSession(); net.notice='Your friend left the game.'; netGoOnlineScreen(); break;
    case 'relay': {
      const p = m.payload || {};
      if(p.t==='snap' && net.role==='guest') netApplySnapshot(p.s);
      else if(p.t==='act' && net.role==='host') netHostApplyAction(p);
      break;
    }
  }
}

/* ---------- HOST: send the game state to the friend ---------- */
const NET_HIDDEN = {rank:'?', suit:'?'};
function netSnapshot(){
  return {
    phase: state.phase,
    deckCount: state.deck.length,
    table: state.table.map(it=> it.type==='card'
      ? {type:'card', card:it.card}
      : {type:'build', targetValue:it.targetValue, targetRank:it.targetRank, cards:it.cards, owner:it.owner}),
    players: state.players.map((p,i)=>({
      name:p.name,
      hand: i===1 ? p.hand : p.hand.map(()=>NET_HIDDEN), // never reveal the host's hand
      captured: p.captured
    })),
    turn: state.turn,
    lastCapturer: state.lastCapturer,
    log: state.log,
    forced: state.forcedCapture ? {owner:state.forcedCapture.owner, idx:state.table.indexOf(state.forcedCapture.buildRef)} : null,
    cuttingAnim: !!state.cuttingAnim
  };
}
// Called from render(): whenever something the friend can see has changed, send it.
function netMaybeSync(){
  if(!net.active || net.role!=='host' || !state) return;
  const json = JSON.stringify(netSnapshot());
  if(json===net.lastSent) return;
  net.lastSent = json;
  netSend({type:'relay', payload:{t:'snap', s:JSON.parse(json)}});
}

/* ---------- GUEST: show the host's game from the friend's side ---------- */
// The game screen always draws "You" as player 0, so the guest's copy of the
// state is flipped: the guest becomes player 0 and the host becomes the rival.
function netSwapNames(t){
  return String(t||'').replace(/\bYou\b/g,'\u0001').replace(/\bRival\b/g,'You').replace(/\u0001/g,'Rival');
}
function netApplySnapshot(s){
  const flip = i=>1-i;
  const table = s.table.map(it=> it.type==='card' ? it : Object.assign({}, it, {owner:flip(it.owner)}));
  state = {
    phase: s.phase,
    deck: Array.from({length:s.deckCount}, ()=>NET_HIDDEN),
    table,
    players: [
      {id:0, name:'You',   hand:s.players[1].hand, captured:s.players[1].captured},
      {id:1, name:'Rival', hand:s.players[0].hand, captured:s.players[0].captured}
    ],
    turn: flip(s.turn),
    lastCapturer: s.lastCapturer===null ? null : flip(s.lastCapturer),
    log: netSwapNames(s.log),
    selHand:null, selTable:new Set(), selCaptured:new Set(),
    forcedCapture: s.forced && table[s.forced.idx] ? {owner:flip(s.forced.owner), buildRef:table[s.forced.idx]} : null,
    rulesOpen:false,
    cuttingAnim: s.cuttingAnim
  };
  ui.match = null; ui.screen='game';
  render();
}
// Guest taps Capture / Build / Trail: check it locally for quick feedback, then ask the host to do it.
function netSendAction(kind){
  const hand = state.players[0].hand;
  const card = hand[state.selHand];
  if(!card) return;
  const selT = [...state.selTable], selC = [...state.selCaptured];
  const ok = kind==='capture' ? selectionIsValidCapture(card, selT, selC)
           : kind==='build'   ? selectionIsValidBuild(card, selT, selC, hand)
           : (selT.length===0 && selC.length===0);
  if(!ok) return;
  netSend({type:'relay', payload:{
    t:'act', kind, hand:state.selHand, sel:selT,
    cap: selC.map(k=>{ const [o,i]=k.split('_').map(Number); return `${1-o}_${i}`; }) // back to the host's numbering
  }});
  state.selHand=null; state.selTable=new Set(); state.selCaptured=new Set();
  state.turn = 1; // disable the buttons until the host's update arrives
  render();
}

/* ---------- HOST: carry out the friend's move ---------- */
function netHostApplyAction(a){
  if(!state || state.phase!=='playing' || state.turn!==1) return;
  const p = state.players[1];
  if(!Number.isInteger(a.hand)) return;
  const card = p.hand[a.hand];
  if(!card) return;
  const selT = Array.isArray(a.sel) ? a.sel : [];
  const selC = Array.isArray(a.cap) ? a.cap : [];
  if(new Set(selT).size!==selT.length) return;
  if(!selT.every(i=>Number.isInteger(i) && i>=0 && i<state.table.length)) return;
  // the friend may only raid the HOST's pile (owner 0), never their own
  if(!selC.every(k=>typeof k==='string' && /^0_\d+$/.test(k))) return;
  if(a.kind==='capture'){
    if(!selectionIsValidCapture(card, selT, selC)) return;
    performCapture(1, card, selT, selC);
  } else if(a.kind==='build'){
    if(!selectionIsValidBuild(card, selT, selC, p.hand)) return;
    performBuild(1, card, selT, selC);
  } else if(a.kind==='trail'){
    if(selT.length>0 || selC.length>0) return;
    performTrail(1, card);
  } else return;
  endTurn();
}

/* ---------- screens ---------- */
function netScreenHTML(){
  const esc = s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const notice = net.notice ? `<p style="color:var(--gold-bright);">${esc(net.notice)}</p>` : '';
  let body;
  if(net.status==='connecting'){
    body = `<p>Connecting to the server…</p>
      <p style="font-size:12px;color:var(--muted);">The first connection can take up to a minute while a free server wakes up.</p>
      <div class="back-btn-row"><button class="ghost" onclick="netLeave()">Cancel</button></div>`;
  } else if(net.status==='waiting'){
    body = `<p>Room created. Tell your friend to tap <b>Join a Room</b> and type this code:</p>
      <div style="font-size:44px;letter-spacing:0.25em;font-weight:800;color:var(--gold-bright);text-align:center;margin:14px 0;">${esc(net.code)}</div>
      <p style="font-size:12px;color:var(--muted);">The game starts automatically when they join. Keep this screen open.</p>
      <div class="back-btn-row"><button class="ghost" onclick="netLeave()">Cancel</button></div>`;
  } else if(net.status==='joined'){
    body = `<p>You're in room <b>${esc(net.code)}</b>. Waiting for the host to shuffle and cut the cards…</p>
      <div class="back-btn-row"><button class="ghost" onclick="netLeave()">Leave</button></div>`;
  } else {
    body = `${notice}
      ${typeof walletBadgeHTML==='function' ? walletBadgeHTML('Everyone online starts with $1000.00. Real-money wagers are coming in a future update — agree on stakes with your friend outside the app for now.') : ''}
      <div style="text-align:center;margin:10px 0;"><button class="primary" onclick="netCreateRoom()">Create a Room</button></div>
      <p style="text-align:center;margin:14px 0 6px;">— or join a friend —</p>
      <div style="text-align:center;">
        <input id="netCode" maxlength="5" placeholder="CODE" autocapitalize="characters" autocomplete="off"
          style="width:130px;text-align:center;font-size:22px;letter-spacing:0.2em;text-transform:uppercase;padding:8px;border-radius:8px;border:1px solid rgba(201,162,39,0.6);background:rgba(255,255,255,0.06);color:var(--ivory);">
        <button onclick="netJoinRoom()">Join a Room</button>
      </div>
      <details ${netUrlIsPlaceholder()?'open':''} style="margin-top:18px;">
        <summary style="cursor:pointer;color:var(--muted);font-size:12px;">Server address</summary>
        <input id="netUrl" value="${esc(netServerUrl())}" autocomplete="off" autocapitalize="off" spellcheck="false"
          style="width:100%;box-sizing:border-box;margin-top:8px;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);color:var(--ivory);font-size:12px;">
      </details>
      <div class="back-btn-row"><button class="primary" onclick="goToMenu()">Back to Menu</button></div>`;
  }
  return `<h1>Online Rooms</h1><div class="screen-panel">${body}</div>`;
}
function netWaitingOverlayHTML(){
  return `<h1>NJUGA/CASINO</h1>
    <div class="overlay"><h2>Room ${net.code}</h2>
    <p>The host is shuffling and cutting the cards…</p>
    <button class="ghost" onclick="netLeave()">Leave Room</button></div>`;
}
function netGameOverButtons(){
  const again = net.role==='host'
    ? `<button class="primary" onclick="newGame()">Play Again</button>`
    : `<p style="font-size:12px;color:var(--muted);">Waiting for the host to start another game…</p>`;
  return `${again}<div style="margin-top:8px;"><button class="ghost" onclick="netLeave()">Leave Room</button></div>`;
}
