/* ============================================================
   NJUGA/CASINO — Tournament mode (4-8 players, elimination bracket)
   ------------------------------------------------------------
   One player creates a table (picks player count + buy-in) and gets a
   room code. Everyone else joins with that code. The creator's phone is
   the "host": it runs the one real game state, using the exact same
   capture/build/raid rules as every other mode — those functions already
   work by seat NUMBER, not by "you vs rival", so nothing about the card
   rules themselves changes here.

   Every other phone is a "guest". A guest never touches the real game
   state — it just receives a snapshot of it after every move, redrawn so
   THEIR OWN seat always appears first (exactly like Online Rooms already
   does for its one guest), with every other seat's hand hidden. When a
   guest acts, it sends that intent to the host, which is the only phone
   allowed to actually apply it.

   Reuses from index.html: createDeck/shuffle, cardHTML, selectionIsValid*,
   performCapture/performBuild/performTrail, endTurn, dealInitial,
   dealMoreIfNeeded, computeAllScores, tournamentPickEliminated, wallet*.
   Reuses from online.js: netServerUrl/netSetServerUrl/netUrlIsPlaceholder
   (both modes talk to the same relay server and share its address).
   ============================================================ */

const tnet = {
  ws: null, role: null,          // 'host' | 'guest'
  mySeat: null, code: '', maxPlayers: 0, buyIn: 0,
  names: [],                     // roster, index = real seat number
  status: 'idle',                // idle | connecting | lobby
  notice: '', myName: '',
  pendingJoinCode: '',
  pingTimer: null, connectTimer: null,
  lastSentPerSeat: {},           // dedupe: avoid re-sending an unchanged snapshot
  lastRoundInfo: null, finalInfo: null
};

/* ---------- connection (mirrors online.js's netOpen, generalized) ---------- */
function tOpen(firstMessage){
  tCloseSocket();
  const urlInput = document.getElementById('tUrl');
  if(urlInput) netSetServerUrl(urlInput.value);
  const url = netServerUrl();
  if(netUrlIsPlaceholder() || !/^wss?:\/\//i.test(url)){
    tnet.notice = 'Enter your server address first (it starts with wss://).';
    tnet.status = 'idle'; render(); return;
  }
  tnet.status = 'connecting'; tnet.notice = ''; render();

  let ws;
  try { ws = new WebSocket(url); }
  catch(e){ tnet.status='idle'; tnet.notice='That server address does not look right.'; render(); return; }
  tnet.ws = ws;

  tnet.connectTimer = setTimeout(()=>{
    if(tnet.ws===ws && ws.readyState!==1){
      tnet.notice = 'Could not reach the server. Check the address and your internet, then try again.';
      tTeardown(); render();
    }
  }, 60000);

  ws.onopen = ()=>{
    clearTimeout(tnet.connectTimer);
    tnet.pingTimer = setInterval(()=>tSend({type:'ping'}), 25000);
    tSend(firstMessage);
  };
  ws.onmessage = (ev)=>{ let m; try{ m = JSON.parse(ev.data); }catch(e){ return; } tHandle(m); };
  ws.onclose = ()=>{
    if(tnet.ws!==ws) return;
    const wasLive = tnet.status!=='idle';
    tTeardown();
    tnet.notice = wasLive ? 'Connection to the server was lost.' : (tnet.notice || 'Could not connect to the server.');
    state = null; ui.screen='tournament'; render();
  };
}
function tSend(obj){ if(tnet.ws && tnet.ws.readyState===1) tnet.ws.send(JSON.stringify(obj)); }
function tCloseSocket(){
  clearTimeout(tnet.connectTimer); clearInterval(tnet.pingTimer);
  if(tnet.ws){ const w=tnet.ws; tnet.ws=null; try{ w.close(); }catch(e){} }
}
function tTeardown(){
  tCloseSocket();
  tnet.role=null; tnet.mySeat=null; tnet.code=''; tnet.maxPlayers=0; tnet.buyIn=0;
  tnet.names=[]; tnet.status='idle'; tnet.lastSentPerSeat={};
}
function tLeaveTournament(){
  tTeardown(); tnet.notice='';
  state=null; ui.screen='tournament'; render();
}

/* ---------- lobby actions ---------- */
function tCreateTournament(){
  const nameEl=document.getElementById('tName'), cntEl=document.getElementById('tCount'), buyEl=document.getElementById('tBuyIn');
  const name = ((nameEl && nameEl.value.trim()) || 'Host').slice(0,16);
  const count = cntEl ? parseInt(cntEl.value,10) : 4;
  const buyIn = buyEl ? parseInt(buyEl.value,10) : 50;
  if(buyIn>wallet){ tnet.notice='Not enough in your wallet for that buy-in.'; render(); return; }
  tnet.myName=name; tnet.role='host';
  tOpen({type:'create', maxPlayers:count, buyIn, name}); // buy-in is only taken once the server confirms the table (see 'created' below)
}
function tJoinTournament(){
  const nameEl=document.getElementById('tJoinName'), codeEl=document.getElementById('tJoinCode');
  const name = ((nameEl && nameEl.value.trim()) || 'Player').slice(0,16);
  const code = ((codeEl && codeEl.value) || '').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5);
  if(code.length!==5){ tnet.notice='Type the 5-letter table code.'; render(); return; }
  tnet.myName=name; tnet.role='guest';
  tOpen({type:'join', code, name});
}

/* ---------- messages from the server ---------- */
function tHandle(m){
  switch(m.type){
    case 'created':
      walletAdd(-m.buyIn); // confirmed — now actually take the host's own buy-in
      tnet.code=m.code; tnet.mySeat=m.seat; tnet.maxPlayers=m.maxPlayers; tnet.buyIn=m.buyIn;
      tnet.names = new Array(m.maxPlayers).fill(null); tnet.names[0]=tnet.myName;
      tnet.status='lobby'; render(); break;

    case 'joined':
      if(wallet < m.buyIn){
        tnet.notice = `You need ${walletFmt(m.buyIn)} to join this table.`;
        tTeardown(); render(); return;
      }
      walletAdd(-m.buyIn);
      tnet.code=m.code; tnet.mySeat=m.seat; tnet.maxPlayers=m.maxPlayers; tnet.buyIn=m.buyIn;
      tnet.status='lobby'; render(); break;

    case 'join-error':
      tnet.notice = m.reason==='room-full' ? 'That table is already full.' : 'No table with that code. Check the letters and try again.';
      tTeardown(); render(); break;

    case 'roster':
      tnet.names = m.names; tnet.maxPlayers = m.maxPlayers; render(); break;

    case 'room-full':
      if(tnet.role==='host') tHostStartTournament();
      break;

    case 'seat-left':
      if(tnet.role==='host') tHostHandleSeatLeft(m.seat);
      break;

    case 'host-left':
      tnet.notice = 'The host ended the tournament.';
      tTeardown(); state=null; ui.screen='tournament'; render(); break;

    case 'relay': {
      const p = m.payload || {};
      if(p.t==='snap' && tnet.role==='guest') tApplySnapshot(p.s);
      else if(p.t==='act' && tnet.role==='host') tHostHandleAction(m.fromSeat, p);
      else if(p.t==='round-over' && tnet.role==='guest') tGuestApplyRoundOver(p);
      else if(p.t==='final' && tnet.role==='guest') tGuestApplyFinal(p);
      break;
    }
  }
}

/* ---------- HOST: start the tournament and deal the first round ---------- */
function tBuildDeck(seatCount){
  // A single 52-card deck runs dry fast once there are 5+ hands drawing from
  // it, so bigger tables play with two shuffled decks combined.
  let d = createDeck();
  if(seatCount>=5) d = d.concat(createDeck());
  return shuffle(d);
}
function tHostStartTournament(){
  const seatCount = tnet.maxPlayers;
  const players = [];
  for(let i=0;i<seatCount;i++) players.push({id:i, name: tnet.names[i] || ('Player '+(i+1)), hand:[], captured:[]});
  state = {
    phase:'playing', table:[], players,
    active: players.map(p=>p.id), turn:0, lastCapturer:null,
    log:'Tournament started! '+seatCount+' players.',
    selHand:null, selTable:new Set(), selCaptured:new Set(), forcedCapture:null,
    tournament:true, raidTarget:null,
    deck: tBuildDeck(seatCount)
  };
  dealInitial();
  ui.screen='tournament';
  tBroadcastSnapshots();
  render();
}
function tStartNextRound(){
  if(tnet.role!=='host' || !state) return;
  const seats = state.active;
  seats.forEach(s=>{ state.players[s].hand=[]; state.players[s].captured=[]; });
  state.table=[]; state.lastCapturer=null; state.forcedCapture=null;
  state.deck = tBuildDeck(seats.length);
  state.turn = seats[0];
  state.phase='playing';
  state.log = 'New round — '+seats.length+' players remain.';
  dealInitial();
  tBroadcastSnapshots();
  render();
}

/* ---------- HOST: build and send each guest its own private view ---------- */
const T_HIDDEN = {rank:'?', suit:'?'};
function tSnapshotFor(seat){
  const order = state.active;
  const pos = order.indexOf(seat);
  const rotated = order.map((_,i)=>order[(pos+i)%order.length]);
  const players = rotated.map(s=>({
    seat: s, name: state.players[s].name,
    hand: s===seat ? state.players[s].hand : state.players[s].hand.map(()=>T_HIDDEN),
    captured: state.players[s].captured
  }));
  return {
    phase: state.phase, deckCount: state.deck.length,
    table: state.table.map(it=> it.type==='card'
      ? {type:'card', card:it.card}
      : {type:'build', targetValue:it.targetValue, targetRank:it.targetRank, cards:it.cards, owner: rotated.indexOf(it.owner)}),
    players,
    turnLocal: rotated.indexOf(state.turn),
    lastCapturerLocal: state.lastCapturer===null ? null : rotated.indexOf(state.lastCapturer),
    log: state.log,
    forced: state.forcedCapture ? {ownerLocal: rotated.indexOf(state.forcedCapture.owner), idx: state.table.indexOf(state.forcedCapture.buildRef)} : null,
    seatMapReal: rotated
  };
}
function tBroadcastSnapshots(){
  if(tnet.role!=='host' || !state) return;
  state.active.forEach(seat=>{
    if(seat===0) return; // the host reads its own state directly, no snapshot needed
    const snap = tSnapshotFor(seat);
    const json = JSON.stringify(snap);
    if(tnet.lastSentPerSeat[seat]===json) return;
    tnet.lastSentPerSeat[seat] = json;
    tSend({type:'relay-to', seat, payload:{t:'snap', s:snap}});
  });
}

/* ---------- GUEST: receive and show the host's game from our own side ---------- */
function tApplySnapshot(s){
  const players = s.players.map(p=>({id:p.seat, name:p.name, hand:p.hand, captured:p.captured}));
  state = {
    phase: s.phase, deck: Array.from({length:s.deckCount}, ()=>T_HIDDEN),
    table: s.table, players, active: players.map((_,i)=>i),
    turn: s.turnLocal, lastCapturer: s.lastCapturerLocal, log: s.log,
    selHand:null, selTable:new Set(), selCaptured:new Set(),
    forcedCapture: s.forced ? {owner:s.forced.ownerLocal, buildRef:s.table[s.forced.idx]} : null,
    tournament:true, raidTarget:null, seatMapReal: s.seatMapReal
  };
  ui.screen='tournament'; render();
}
// Capture/Build/Trail call this when we're a tournament guest (hooked into
// the shared playerCapture/playerBuild/playerTrail in index.html).
function tSendAction(kind){
  const hand = state.players[0].hand;
  const card = hand[state.selHand];
  if(!card) return;
  const selT = [...state.selTable], selCLocal = [...state.selCaptured];
  const ok = kind==='capture' ? selectionIsValidCapture(card, selT, selCLocal)
           : kind==='build'   ? selectionIsValidBuild(card, selT, selCLocal, hand)
           : (selT.length===0 && selCLocal.length===0);
  if(!ok) return;
  const selCReal = selCLocal.map(k=>{
    const [ownerLocal, idx] = k.split('_').map(Number);
    return `${state.seatMapReal[ownerLocal]}_${idx}`;
  });
  tSend({type:'relay', payload:{t:'act', kind, hand:state.selHand, sel:selT, cap:selCReal}});
  state.selHand=null; state.selTable=new Set(); state.selCaptured=new Set();
  state.turn = -1; // no local seat matches -1, so the UI locks until the next snapshot
  render();
}

/* ---------- HOST: apply a guest's move ---------- */
function tHostHandleAction(fromSeat, a){
  if(!state || state.phase!=='playing' || state.turn!==fromSeat) return;
  const p = state.players[fromSeat];
  if(!Number.isInteger(a.hand)) return;
  const card = p.hand[a.hand];
  if(!card) return;
  const selT = Array.isArray(a.sel) ? a.sel : [];
  const selC = Array.isArray(a.cap) ? a.cap : [];
  if(new Set(selT).size!==selT.length) return;
  if(!selT.every(i=>Number.isInteger(i) && i>=0 && i<state.table.length)) return;
  // A seat may raid any OTHER active seat's pile, never its own.
  if(!selC.every(k=>{
    const m = /^(\d+)_(\d+)$/.exec(k);
    if(!m) return false;
    const owner = +m[1];
    return owner!==fromSeat && state.active.includes(owner);
  })) return;
  if(a.kind==='capture'){
    if(!selectionIsValidCapture(card, selT, selC)) return;
    performCapture(fromSeat, card, selT, selC);
  } else if(a.kind==='build'){
    if(!selectionIsValidBuild(card, selT, selC, p.hand)) return;
    performBuild(fromSeat, card, selT, selC);
  } else if(a.kind==='trail'){
    if(selT.length>0 || selC.length>0) return;
    performTrail(fromSeat, card);
  } else return;
  endTurn();
}

/* ---------- HOST: round ends when the deck runs out (hooked from dealMoreIfNeeded) ---------- */
function tEndRound(){
  if(state.lastCapturer!==null && state.table.length>0){
    let remaining = [];
    state.table.forEach(it=>{ remaining = remaining.concat(it.type==='build' ? it.cards : [it.card]); });
    state.players[state.lastCapturer].captured = state.players[state.lastCapturer].captured.concat(remaining);
    state.table = [];
  }
  const scores = computeAllScores(state.active);

  if(state.active.length<=2){
    const a = scores[0], b = scores[1];
    if(b && a.total===b.total){
      // A tie for the title isn't settled by seat order — play the decider again.
      state.phase = 'roundover';
      tnet.lastRoundInfo = {scores, eliminatedSeat:null, eliminatedName:null, tie:true, active:state.active};
      state.active.forEach(seat=>{
        if(seat===0) return;
        tSend({type:'relay-to', seat, payload:{t:'round-over', scores, eliminatedSeat:null, eliminatedName:null, tie:true, active:state.active}});
      });
      render();
      return;
    }
    const winnerRow = !b ? a : (a.total>b.total ? a : b);
    const pot = tnet.buyIn * tnet.maxPlayers;
    state.phase = 'tournamentover';
    tnet.finalInfo = {winnerSeat:winnerRow.seat, winnerName:state.players[winnerRow.seat].name, pot, scores};
    if(winnerRow.seat===0) walletAdd(pot);
    state.active.forEach(seat=>{
      if(seat===0) return;
      tSend({type:'relay-to', seat, payload:{t:'final', winnerSeat:winnerRow.seat, winnerName:state.players[winnerRow.seat].name, pot, scores}});
    });
    render();
  } else {
    const worst = tournamentPickEliminated(scores);
    const eliminatedName = state.players[worst.seat].name;
    const prevActive = state.active.slice();
    state.active = state.active.filter(s=>s!==worst.seat);
    state.phase = 'roundover';
    tnet.lastRoundInfo = {scores, eliminatedSeat:worst.seat, eliminatedName, active:state.active};
    prevActive.forEach(seat=>{
      if(seat===0) return;
      tSend({type:'relay-to', seat, payload:{t:'round-over', scores, eliminatedSeat:worst.seat, eliminatedName, active:state.active}});
    });
    render();
  }
}

/* ---------- HOST: a guest's connection dropped mid-tournament ---------- */
function tHostHandleSeatLeft(seat){
  if(!state || !state.active.includes(seat)) return;
  state.active = state.active.filter(s=>s!==seat);
  state.log = (state.players[seat].name)+' disconnected and is out. '+state.log;
  if(state.active.length<=2){
    tEndRound(); // resolve on whatever's been captured so far rather than stall the table
    return;
  }
  if(state.turn===seat) state.turn = state.active[0];
  evaluateForcedCapture(state.turn);
  tBroadcastSnapshots();
  render();
}

/* ---------- GUEST: round-over / eliminated / final messages from the host ---------- */
function tGuestApplyRoundOver(p){
  tnet.lastRoundInfo = p;
  state.phase = (p.eliminatedSeat===tnet.mySeat) ? 'eliminated' : 'roundover';
  render();
}
function tGuestApplyFinal(p){
  tnet.finalInfo = p;
  if(p.winnerSeat===tnet.mySeat) walletAdd(p.pot);
  state.phase = 'tournamentover';
  render();
}

/* ---------- raid-target picker (which OTHER seat's pile is shown) ---------- */
function tSetRaidTarget(localSeat){
  if(localSeat===0) return; // can never raid your own pile
  state.raidTarget = (state.raidTarget===localSeat) ? null : localSeat;
  render();
}

/* ---------- screens ---------- */
function tEsc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function tournamentScreenHTML(){
  if(state && state.tournament){
    if(state.phase==='playing') return tBoardHTML();
    if(state.phase==='roundover') return tRoundOverHTML();
    if(state.phase==='eliminated') return tEliminatedHTML();
    if(state.phase==='tournamentover') return tFinalHTML();
  }
  if(tnet.status==='connecting'){
    return `<h1>Tournament</h1><div class="screen-panel"><p>Connecting to the server…</p>
      <p style="font-size:12px;color:var(--muted);">The first connection can take up to a minute while a free server wakes up.</p></div>
      <div class="back-btn-row"><button class="ghost" onclick="tLeaveTournament()">Cancel</button></div>`;
  }
  if(tnet.status==='lobby') return tRosterWaitingHTML();
  return tLobbyFormHTML();
}

function tLobbyFormHTML(){
  const notice = tnet.notice ? `<p style="color:var(--gold-bright);">${tEsc(tnet.notice)}</p>` : '';
  const countOpts = [3,4,5,6,7,8].map(n=>`<option value="${n}" ${n===4?'selected':''}>${n} players</option>`).join('');
  const buyOpts = [50,100,200].map(n=>`<option value="${n}" ${n===50?'selected':''}>$${n}.00</option>`).join('');
  return `<h1>Tournament</h1><div class="screen-panel">
    ${notice}
    ${walletBadgeHTML()}
    <h3>Create a table</h3>
    <p>Everyone plays on their own phone. Lowest score is knocked out each round until 2 remain — they play one more round for the whole pot.</p>
    <p><input id="tName" maxlength="16" placeholder="Your name" style="width:150px;padding:6px;"></p>
    <p><select id="tCount" style="padding:6px;">${countOpts}</select> <select id="tBuyIn" style="padding:6px;">${buyOpts}</select></p>
    <button class="primary" onclick="tCreateTournament()">Create Table</button>
    <h3 style="margin-top:20px;">Join a table</h3>
    <p><input id="tJoinName" maxlength="16" placeholder="Your name" style="width:150px;padding:6px;"></p>
    <p><input id="tJoinCode" maxlength="5" placeholder="CODE" autocapitalize="characters" style="width:100px;padding:6px;text-transform:uppercase;letter-spacing:0.15em;text-align:center;"></p>
    <button onclick="tJoinTournament()">Join Table</button>
    <details ${netUrlIsPlaceholder()?'open':''} style="margin-top:18px;">
      <summary style="cursor:pointer;color:var(--muted);font-size:12px;">Server address</summary>
      <input id="tUrl" value="${tEsc(netServerUrl())}" autocomplete="off" autocapitalize="off" spellcheck="false"
        style="width:100%;box-sizing:border-box;margin-top:8px;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);color:var(--ivory);font-size:12px;">
    </details>
  </div>
  <div class="back-btn-row"><button class="primary" onclick="goToMenu()">Back to Menu</button></div>`;
}

function tRosterWaitingHTML(){
  const seats = tnet.names || [];
  const filled = seats.filter(Boolean).length;
  const seatsHTML = seats.map((n,i)=>`<li>${i===0?'\u{1F451} ':''}${n?tEsc(n):'<span style="color:var(--muted);">\u2014 waiting \u2014</span>'}</li>`).join('');
  return `<h1>Tournament Lobby</h1><div class="screen-panel">
    ${tnet.role==='host'
      ? `<p>Share this code with your friends:</p><div style="font-size:40px;letter-spacing:0.25em;font-weight:800;color:var(--gold-bright);text-align:center;margin:10px 0;">${tEsc(tnet.code)}</div>`
      : `<p>Table <b>${tEsc(tnet.code)}</b></p>`}
    <p>Buy-in: <b>${walletFmt(tnet.buyIn)}</b> each &nbsp;\u2022&nbsp; Pot so far: <b>${walletFmt(tnet.buyIn*filled)}</b></p>
    <ul style="line-height:1.8;">${seatsHTML}</ul>
    <p style="font-size:12px;color:var(--muted);">The tournament starts the moment every seat is filled.</p>
  </div>
  <div class="back-btn-row"><button class="ghost" onclick="tLeaveTournament()">Leave</button></div>`;
}

function tPileStripHTML(){
  const you = state.players[0];
  const others = state.players.slice(1);
  return `<div style="display:flex;gap:8px;overflow-x:auto;padding:4px 0;margin:6px 0;">
    ${others.map((p,i)=>{
      const localSeat = i+1;
      const active = state.raidTarget===localSeat;
      return `<div onclick="tSetRaidTarget(${localSeat})" style="flex:0 0 auto;text-align:center;padding:6px 10px;border-radius:10px;cursor:pointer;background:${active?'rgba(201,162,39,0.25)':'rgba(255,255,255,0.05)'};border:1px solid ${active?'var(--gold-bright)':'rgba(255,255,255,0.15)'};">
        <div style="font-size:11px;color:var(--ivory);">${tEsc(p.name)}${state.turn===localSeat?' \u2022 turn':''}</div>
        <div style="font-size:11px;color:var(--muted);">${p.captured.length} captured</div>
      </div>`;
    }).join('')}
  </div>`;
}
function tRaidPileHTML(){
  if(state.raidTarget==null) return '';
  const ownerIdx = state.raidTarget;
  const pile = state.players[ownerIdx].captured;
  if(pile.length===0) return `<p style="font-size:12px;color:var(--muted);">${tEsc(state.players[ownerIdx].name)}'s pile is empty.</p>`;
  const topIdx = pile.length-1;
  const key = `${ownerIdx}_${topIdx}`;
  const picked = state.selCaptured.has(key);
  return `<div style="text-align:center;margin:8px 0;">
    <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">${tEsc(state.players[ownerIdx].name)}'s top card \u2014 raid it as part of a build</div>
    <div onclick="playerClickCaptured(${ownerIdx},${topIdx})" style="display:inline-block;">${cardHTML(pile[topIdx], picked?'selected':'')}</div>
  </div>`;
}

function tBoardHTML(){
  const you = state.players[0];
  const myTurn = state.turn===0;
  const turnLabel = myTurn ? 'Your turn' : `Waiting for ${tEsc(state.players[state.turn] ? state.players[state.turn].name : '...')}`;
  const handHTML = you.hand.map((c,i)=>`<div onclick="playerClickHand(${i})">${cardHTML(c, state.selHand===i?'selected':'')}</div>`).join('');
  const tableHTML = state.table.map((it,i)=>{
    const picked = state.selTable.has(i);
    if(it.type==='card') return `<div onclick="playerClickTable(${i})">${cardHTML(it.card, picked?'selected':'')}</div>`;
    const label = it.targetRank ? `${it.targetRank}s` : `${it.targetValue}`;
    return `<div onclick="playerClickTable(${i})" style="text-align:center;">
      <div style="font-size:10px;color:var(--gold-bright);">Build ${label}</div>
      <div style="display:flex;">${it.cards.map(c=>cardHTML(c)).join('')}</div>
    </div>`;
  }).join('');
  const forcedNotice = state.forcedCapture && state.forcedCapture.owner===0
    ? `<p style="color:var(--gold-bright);font-size:12px;">Capture your build now, or it breaks apart on your next turn.</p>` : '';
  return `<h1>Tournament \u2014 ${state.active.length} left</h1>
    <div style="text-align:center;font-size:12px;color:var(--muted);">Room ${tEsc(tnet.code)} &nbsp;\u2022&nbsp; Deck: ${state.deck.length} &nbsp;\u2022&nbsp; You: ${you.captured.length} captured</div>
    <div style="text-align:center;font-weight:700;margin:6px 0;color:${myTurn?'var(--gold-bright)':'var(--ivory)'};">${turnLabel}</div>
    ${tPileStripHTML()}
    ${tRaidPileHTML()}
    <div class="screen-panel">
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Table</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">${tableHTML || '<span style="font-size:12px;color:var(--muted);">(empty)</span>'}</div>
    </div>
    ${forcedNotice}
    <div class="screen-panel">
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Your hand</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">${handHTML}</div>
    </div>
    <div style="text-align:center;margin:10px 0;" class="action-row">
      <button ${myTurn?'':'disabled'} onclick="playerCapture()">Capture</button>
      <button ${myTurn?'':'disabled'} onclick="playerBuild()">Build</button>
      <button ${myTurn?'':'disabled'} onclick="playerTrail()">Trail</button>
    </div>
    <p style="font-size:11px;color:var(--muted);text-align:center;">${tEsc(state.log)}</p>
    <div class="back-btn-row"><button class="ghost" onclick="tLeaveTournament()">Leave Tournament</button></div>`;
}

function tScoreTableHTML(scores){
  const sorted = scores.slice().sort((a,b)=>b.total-a.total);
  return `<table class="score-table"><tr><td></td><td>Total</td><td>Spades</td><td>Cards</td></tr>
    ${sorted.map(s=>`<tr><td>${tEsc(s.name)}</td><td>${s.total}</td><td>${s.spades}</td><td>${s.cards}</td></tr>`).join('')}
  </table>`;
}

function tRoundOverHTML(){
  const info = tnet.lastRoundInfo;
  const headline = info.tie
    ? `<p style="color:var(--gold-bright);text-align:center;"><b>It's a tie for the title!</b> Play once more to decide it.</p>`
    : `<p style="color:#ff8f8f;text-align:center;"><b>${tEsc(info.eliminatedName)}</b> is eliminated \u2014 lowest score this round.</p>`;
  return `<h1>Round Over</h1><div class="screen-panel">
    ${headline}
    ${tScoreTableHTML(info.scores)}
    <p style="text-align:center;">${info.active.length} players remain.</p>
    ${tnet.role==='host'
      ? `<button class="primary" onclick="tStartNextRound()">${info.tie?'Play the Decider':'Start Next Round'}</button>`
      : `<p style="font-size:12px;color:var(--muted);text-align:center;">Waiting for the host to start the next round\u2026</p>`}
  </div>
  <div class="back-btn-row"><button class="ghost" onclick="tLeaveTournament()">Leave</button></div>`;
}

function tEliminatedHTML(){
  const info = tnet.lastRoundInfo;
  return `<h1>You're Out</h1><div class="screen-panel">
    <p style="text-align:center;">Lowest score this round \u2014 your buy-in stays in the pot for the players still at the table.</p>
    ${tScoreTableHTML(info.scores)}
  </div>
  <div class="back-btn-row"><button class="primary" onclick="tLeaveTournament()">Back to Menu</button></div>`;
}

function tFinalHTML(){
  const info = tnet.finalInfo;
  const iWon = info.winnerSeat===(tnet.role==='host'?0:tnet.mySeat);
  return `<h1>Tournament Over</h1><div class="screen-panel">
    <div style="text-align:center;font-size:20px;font-weight:800;color:var(--gold-bright);margin:8px 0;">
      ${tEsc(info.winnerName)} wins ${walletFmt(info.pot)}!
    </div>
    ${iWon ? `<p style="text-align:center;color:var(--gold-bright);">That's you \u2014 added to your wallet.</p>` : ''}
    ${tScoreTableHTML(info.scores)}
    ${walletBadgeHTML()}
  </div>
  <div class="back-btn-row"><button class="primary" onclick="tLeaveTournament()">Back to Menu</button></div>`;
}
