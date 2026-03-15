
# -*- coding: utf-8 -*-
"""room-play.html を生成するスクリプト"""
import re, os

src = open('C:/Projects/Compile/solo-play.html','r',encoding='utf-8').read()

# ── CSS抽出 ──────────────────────────────────────
css_start = src.index('<style>') + len('<style>')
css_end   = src.index('</style>')
css = src[css_start:css_end]

# ── DATAブロック抽出 ──────────────────────────────
data_start = src.index('var DATA=[')
data_end   = src.index('];', data_start) + 2
data_block = src[data_start:data_end]

# ── JSブロック抽出（GLOBALS〜script終わりまで） ───
js_start  = src.index('/* ============ GLOBALS ============ */')
js_end    = src.index('</script>')
js = src[js_start:js_end]

# ── JS 修正 ──────────────────────────────────────

# gMode デフォルトを 'both' に (2人ゲームなので)
js = js.replace(
    "var uid=0, GS=null, hist=[], actionLog=[], gMode='solo', sel1=[], sel2=[];",
    "var uid=0, GS=null, hist=[], actionLog=[], gMode='both', sel1=[], sel2=[];\n"
    "/* online */\n"
    "var fbMode=false, myRole=0, roomCode='';\n"
    "var fbApp=null, fbDb=null, fbRef=null;\n"
    "var pendingPush=false, isSyncing=false, localLastPush=0;\n"
    "var onlineSel=[];",
    1
)

# AI ターン自動実行を削除
js = js.replace("if(GS.ai&&GS.turn===2)setTimeout(doAiTurn,900);", "")

# doCompile に自ターンチェック追加
js = js.replace(
    "function doCompile(pn,li){\n  var ps=GS.p[pn];",
    "function doCompile(pn,li){\n"
    "  if(fbMode&&pn!==myRole&&GS.turn!==myRole){showToast('相手のターンです');return;}\n"
    "  var ps=GS.p[pn];"
)

# doRefresh に自ターンチェック追加
js = js.replace(
    "function doRefresh(pn){\n  var ps=GS.p[pn];",
    "function doRefresh(pn){\n"
    "  if(fbMode&&pn!==myRole&&GS.turn!==myRole){showToast('相手のターンです');return;}\n"
    "  var ps=GS.p[pn];"
)

# save() に pendingPush 追加
js = js.replace(
    "  document.getElementById('uBtn').disabled=false;\n}",
    "  document.getElementById('uBtn').disabled=false;\n"
    "  if(fbMode)pendingPush=true;\n}",
    1
)

# renderAll() に fbPush フック追加
js = js.replace(
    "  if(GS.mode==='both'){rHandVis(1);rHandVis(2)}\n}",
    "  if(GS.mode==='both'){rHandVis(1);rHandVis(2)}\n"
    "  if(fbMode&&pendingPush&&!isSyncing){pendingPush=false;fbPush();}\n}",
    1
)

# rHand() — 相手の手札は裏向き表示
old_rhand = (
    "function rHand(pn){\n"
    "  var el=document.getElementById(pn===1?'h1':'h2');el.innerHTML='';\n"
    "  var ps=GS.p[pn];\n"
    "  if(!ps.hand.length){el.innerHTML='<div style=\"color:var(--empty-color);font-size:.6rem;display:flex;align-items:center;justify-content:center;width:100%\">手札なし</div>';return}\n"
    "  ps.hand.forEach(function(cr){el.appendChild(mkHCard(cr,pn))});\n"
    "}"
)
new_rhand = (
    "function rHand(pn){\n"
    "  var el=document.getElementById(pn===1?'h1':'h2');el.innerHTML='';\n"
    "  var ps=GS.p[pn];\n"
    "  var isOpp=fbMode&&pn!==myRole;\n"
    "  if(!ps.hand.length){el.innerHTML='<div style=\"color:var(--empty-color);font-size:.6rem;display:flex;align-items:center;justify-content:center;width:100%\">手札なし</div>';return}\n"
    "  ps.hand.forEach(function(cr){el.appendChild(mkHCard(cr,pn,isOpp))});\n"
    "}"
)
if old_rhand in js:
    js = js.replace(old_rhand, new_rhand)
    print("rHand OK")
else:
    print("rHand NOT FOUND")

# mkHCard(cr,pn) → mkHCard(cr,pn,isOpp) — 相手手札は中身非表示
js = js.replace("function mkHCard(cr,pn){", "function mkHCard(cr,pn,isOpp){", 1)

# cr.up → showUp で表示制御
js = js.replace(
    "  el.className='hcard '+(cr.up?'up':'dn');\n  if(cr.up){",
    "  var showUp=cr.up&&!isOpp;\n"
    "  el.className='hcard '+(showUp?'up':'dn');\n  if(showUp){",
    1
)

# mkHCard 内の initDrag の手前に isOpp チェック追加
# mkHCard 末尾の initDrag 行を特定して置換
idx_mkhcard = js.find("function mkHCard")
idx_next    = js.find("\nfunction ", idx_mkhcard + 1)
hcard_chunk = js[idx_mkhcard:idx_next]

old_drag_in_hcard = (
    "  initDrag(el,cr,pn,function(){openMod(cr.card,cr.proto)});\n"
    "  return el;\n"
    "}"
)
new_drag_in_hcard = (
    "  if(isOpp)fb.style.display='none';\n"
    "  initDrag(el,cr,pn,function(){if(!isOpp)openMod(cr.card,cr.proto)});\n"
    "  return el;\n"
    "}"
)
if old_drag_in_hcard in hcard_chunk:
    hcard_chunk = hcard_chunk.replace(old_drag_in_hcard, new_drag_in_hcard, 1)
    js = js[:idx_mkhcard] + hcard_chunk + js[idx_next:]
    print("mkHCard drag OK")
else:
    print("mkHCard drag NOT FOUND")

# URL restore ブロックを削除
url_s = js.find("/* ============ URL RESTORE ============ */")
url_e = js.find("\n})();", url_s) + len("\n})();")
if url_s >= 0:
    js = js[:url_s] + js[url_e:]
    print("URL restore removed")

# mkPills 初期化行を削除
js = js.replace("mkPills('pp1',sel1,'cnt1');\nmkPills('pp2',sel2,'cnt2');", "")

# setM 関数は使わないが残しても支障なし
# AI doAiTurn は残すが呼ばれないので問題なし

# ── Firebase + Room JS ─────────────────────────────
firebase_js = r"""
/* ============ FIREBASE CONFIG ============ */
// Firebaseプロジェクトの設定をここに貼り付けてください
var FB_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  databaseURL:       "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

/* ============ FIREBASE INIT ============ */
function initFB(){
  if(fbApp)return true;
  try{
    if(FB_CONFIG.apiKey==='YOUR_API_KEY'){showToast('FB_CONFIGを設定してください');return false;}
    fbApp=firebase.initializeApp(FB_CONFIG);
    fbDb=firebase.database();
    return true;
  }catch(e){showToast('Firebase初期化エラー: '+e.message);return false;}
}
function genCode(){
  var c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',s='';
  for(var i=0;i<6;i++)s+=c[Math.floor(Math.random()*c.length)];
  return s;
}

/* ============ LOBBY ============ */
function showCreate(){
  document.getElementById('lobCreate').classList.add('on');
  document.getElementById('lobJoin').classList.remove('on');
  document.getElementById('createSec').style.display='';
  document.getElementById('joinSec').style.display='none';
}
function showJoinSec(){
  document.getElementById('lobCreate').classList.remove('on');
  document.getElementById('lobJoin').classList.add('on');
  document.getElementById('createSec').style.display='none';
  document.getElementById('joinSec').style.display='';
}

function createRoom(){
  if(!initFB())return;
  roomCode=genCode();myRole=1;
  fbRef=fbDb.ref('rooms/'+roomCode);
  fbRef.set({status:'waiting',created:Date.now(),p1protos:null,p2protos:null,gs:null,seq:0})
    .then(function(){
      document.getElementById('createBtn').style.display='none';
      document.getElementById('roomCodeBox').style.display='';
      document.getElementById('roomCodeText').textContent=roomCode;
      fbRef.onDisconnect().update({status:'closed'});
      startFBListen();
    }).catch(function(e){showToast('エラー: '+e.message);});
}

function joinRoom(){
  var code=document.getElementById('joinCodeInput').value.toUpperCase().trim();
  if(code.length<4){showToast('コードを入力してください');return;}
  if(!initFB())return;
  roomCode=code;myRole=2;
  fbRef=fbDb.ref('rooms/'+roomCode);
  fbRef.once('value').then(function(snap){
    var d=snap.val();
    if(!d||d.status==='closed'){showToast('ルームが見つかりません');myRole=0;return;}
    if(d.status!=='waiting'){showToast('このルームには参加できません');myRole=0;return;}
    return fbRef.update({status:'setup'});
  }).then(function(){
    if(!myRole)return;
    document.getElementById('joinSec').style.display='none';
    document.getElementById('roomCodeBox').style.display='';
    document.getElementById('roomCodeText').textContent=roomCode;
    fbRef.onDisconnect().update({status:'closed'});
    startFBListen();
    showProtoSel();
  }).catch(function(e){if(myRole)showToast('接続エラー: '+e.message);});
}

function startFBListen(){
  fbRef.on('value',function(snap){var d=snap.val();if(d)onRoomData(d);});
}

function onRoomData(d){
  var dot=document.getElementById('connDot');
  if(dot){var p2here=d.status!=='waiting';dot.className='conn-dot'+(p2here?' on':'');}

  if(d.status==='closed'&&myRole!==0){
    showToast('対戦相手が切断しました');return;
  }

  // P2参加 → P1もプロトコル選択へ
  if(d.status==='setup'&&myRole===1&&document.getElementById('protoSel').style.display==='none'){
    showProtoSel();
  }

  // 両者プロトコル確定 → P1がゲームを開始
  if(d.p1protos&&d.p2protos&&myRole===1&&!GS){
    sel1=d.p1protos;sel2=d.p2protos;
    fbMode=true;gMode='both';
    go();
    document.querySelector('.logo small').textContent='ONLINE P1';
    document.getElementById('shareBtn').style.display='none';
    pendingPush=false;localLastPush=1;fbPush();
  }

  // 待機メッセージ更新
  var wm=document.getElementById('protoWait');
  if(wm){
    if(d.p1protos&&d.p2protos){wm.style.display='none';}
    else if((myRole===1&&!d.p2protos)||(myRole===2&&!d.p1protos)){
      wm.style.display='';wm.textContent='相手のプロトコル選択を待っています...';
    }
  }

  // リモートからのGS受信
  if(d.status==='playing'&&d.gs&&d.seq!==localLastPush){
    isSyncing=true;
    try{
      var b64=d.gs.replace(/-/g,'+').replace(/_/g,'/');
      while(b64.length%4)b64+='=';
      var raw=JSON.parse(decodeURIComponent(escape(atob(b64))));
      var firstLoad=!GS||document.getElementById('game').style.display!=='flex';
      GS=decodeGS(raw);
      if(firstLoad)initOnlineGameUI();
      else{renderAll();updateTurnBar();checkAllWin();}
    }catch(e){console.error('GS load error',e);}
    isSyncing=false;
  }
}

/* ============ PROTOCOL SELECT ============ */
function showProtoSel(){
  onlineSel=[];
  document.getElementById('lobby').style.display='none';
  document.getElementById('protoSel').style.display='';
  document.getElementById('protoTitle').textContent='P'+myRole+' プロトコルを選択 (3つ)';
  document.getElementById('protoCnt').textContent='0';
  var sb=document.getElementById('protoSubmit');
  sb.classList.remove('ok');sb.disabled=false;
  document.getElementById('protoWait').style.display='none';
  var el=document.getElementById('protoPills');el.innerHTML='';
  DATA.forEach(function(p){
    var b=document.createElement('button');
    b.className='pill'+(p.set!=='Main'?' aux':'');
    b.textContent=p.name;
    b.onclick=function(){
      var i=onlineSel.indexOf(p.name);
      if(i>=0){onlineSel.splice(i,1);b.classList.remove('on');b.style.color='';b.style.borderColor='';}
      else if(onlineSel.length<3){onlineSel.push(p.name);b.classList.add('on');b.style.color=p.color;b.style.borderColor=p.color;}
      document.getElementById('protoCnt').textContent=onlineSel.length;
      sb.classList.toggle('ok',onlineSel.length===3);
    };
    el.appendChild(b);
  });
}

function submitProtos(){
  if(onlineSel.length!==3){showToast('3つ選択してください');return;}
  var up={};up['p'+myRole+'protos']=onlineSel;
  fbRef.update(up);
  document.getElementById('protoSubmit').disabled=true;
  document.getElementById('protoWait').style.display='';
  document.getElementById('protoWait').textContent='相手のプロトコル選択を待っています...';
}

/* ============ ONLINE GAME UI INIT (P2用) ============ */
function initOnlineGameUI(){
  document.getElementById('protoSel').style.display='none';
  document.getElementById('lobby').style.display='none';
  document.getElementById('game').style.display='flex';
  document.getElementById('histBtn').style.display='';
  document.getElementById('pcBtn').style.display='';
  document.getElementById('leaveBtn').style.display='';
  document.getElementById('hdrRoom').textContent=roomCode;
  document.getElementById('hdrRoom').style.display='';
  document.getElementById('shareBtn').style.display='none';
  appPC(pcMode);
  document.body.classList.add('both-mode');
  document.querySelector('.logo small').textContent='ONLINE P'+myRole;
  if(zoomLv>75)appZoom(75);
  document.getElementById('p2top').style.display='';
  document.getElementById('p2sec').style.display='';
  document.getElementById('fdiv').style.display='';
  document.getElementById('trLbl').textContent='P1 TRASH';
  document.getElementById('oppDraw1').style.display='';
  document.getElementById('oppDraw2').style.display='';
  document.getElementById('h1tog').style.display='none';
  document.getElementById('h2tog').style.display='none';
  handHidden={1:false,2:false};
  document.getElementById('h2wrap').style.display='';
  mkLines(1);mkLines(2);
  initDeckDrag(1);initDeckDrag(2);
  updateTurnBar();
  renderAll();
}

/* ============ FB PUSH ============ */
function fbPush(){
  if(!fbRef||!GS)return;
  localLastPush++;
  var enc=encodeGS();
  fbRef.update({gs:enc,seq:localLastPush,status:'playing'});
}

/* ============ LEAVE ROOM ============ */
function cfLeave(){
  if(!confirm('ルームを退出しますか？'))return;
  if(fbRef){fbRef.update({status:'closed'});fbRef.off();fbRef=null;}
  fbMode=false;myRole=0;roomCode='';GS=null;hist=[];actionLog=[];
  document.getElementById('game').style.display='none';
  document.getElementById('lobby').style.display='';
  document.getElementById('protoSel').style.display='none';
  document.getElementById('createSec').style.display='';
  document.getElementById('joinSec').style.display='none';
  document.getElementById('roomCodeBox').style.display='none';
  document.getElementById('createBtn').style.display='';
  document.getElementById('hdrRoom').style.display='none';
  document.getElementById('leaveBtn').style.display='none';
  document.getElementById('histBtn').style.display='none';
  document.getElementById('pcBtn').style.display='none';
  document.body.classList.remove('both-mode','pc-mode');
  document.querySelector('.logo small').textContent='ROOM';
  appZoom(100);
  var dot=document.getElementById('connDot');if(dot)dot.className='conn-dot';
  document.getElementById('protoSubmit').disabled=false;
  showCreate();
}
"""

# ── 追加CSS ───────────────────────────────────────
extra_css = """
    /* online room UI */
    #lobby,#protoSel{flex:1;min-height:0;overflow-y:auto;padding:14px}
    .room-code-box{text-align:center;margin:16px 0;padding:18px;
      border:1.5px solid rgba(233,30,140,.25);border-radius:11px;background:rgba(233,30,140,.04)}
    .room-code-val{font-family:Orbitron,monospace;font-size:2rem;font-weight:900;
      letter-spacing:8px;color:var(--pk);margin:10px 0;word-break:break-all}
    .room-code-hint{font-size:.62rem;color:var(--txd);margin-bottom:8px}
    .conn-status{font-family:Orbitron,monospace;font-size:.58rem;font-weight:700;
      display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:9px;
      background:var(--pill-bg);border:1px solid var(--bd);margin-top:6px}
    #joinCodeInput{width:100%;padding:12px;margin:8px 0;border-radius:7px;
      border:1.5px solid var(--bd2);background:var(--cbg2);color:var(--tx);
      font-family:Orbitron,monospace;font-size:1.3rem;font-weight:700;
      text-align:center;letter-spacing:4px;text-transform:uppercase;outline:none;
      -webkit-appearance:none}
    #joinCodeInput:focus{border-color:var(--pk)}
    .online-wait{font-size:.7rem;color:var(--txd);text-align:center;padding:10px 0;font-style:italic}
    .opp-hand-row{display:flex;align-items:center;justify-content:center;gap:8px;
      width:100%;font-family:Orbitron,monospace;font-size:.55rem;font-weight:700;
      color:var(--txdd);padding:6px 0;letter-spacing:.5px}
    .hdr-room{font-family:Orbitron,monospace;font-size:.48rem;font-weight:700;
      color:var(--txdd);padding:2px 7px;border-radius:4px;background:var(--pill-bg);
      border:1px solid var(--bd);letter-spacing:1px}
    .conn-dot{width:7px;height:7px;border-radius:50%;background:var(--txdd);
      display:inline-block;flex-shrink:0;transition:all .4s}
    .conn-dot.on{background:#22c55e;box-shadow:0 0 6px rgba(34,197,94,.5)}
"""

# ── 最終HTMLを組み立て ────────────────────────────
html = """<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>COMPILE - Room Play</title>
  <link rel="apple-touch-icon" href="icon-180.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="COMPILE">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Noto+Sans+JP:wght@300;400;500;700&display=swap" rel="stylesheet">
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"></script>
  <style>
""" + css + extra_css + """
  </style>
</head>
<body>

<div class="zoom-bar" id="zoomBar">
  <span class="zoom-lbl">A</span>
  <button class="zoom-btn" onclick="chZoom(-10)">&#x2212;</button>
  <span class="zoom-val" id="zoomVal">100%</span>
  <button class="zoom-btn" onclick="chZoom(10)">+</button>
  <span class="zoom-lbl" style="font-size:.7rem">A</span>
</div>
<div id="gameWrap">

<!-- ヘッダー -->
<div class="hdr">
  <div class="logo">COMPILE <em>&lt;!&gt;</em><small id="logoSub">ROOM</small></div>
  <div style="display:flex;gap:5px;align-items:center">
    <span class="conn-dot" id="connDot"></span>
    <span class="hdr-room" id="hdrRoom" style="display:none"></span>
    <button class="hbtn" id="leaveBtn" style="display:none" onclick="cfLeave()">LEAVE</button>
    <button class="hbtn" id="histBtn" style="display:none" onclick="openHist()">HIST</button>
    <button class="hbtn" id="pcBtn" style="display:none" onclick="togPC()">PC</button>
    <button class="hbtn" onclick="openHelp()">?</button>
    <button class="hbtn" id="thBtn" onclick="togTh()">&#x2600;</button>
  </div>
</div>

<!-- ロビー画面 -->
<div id="lobby">
  <div style="margin-bottom:14px">
    <div class="sec-t"><b>//</b> ONLINE ROOM</div>
    <div class="mode-row">
      <div class="mode-b on" id="lobCreate" onclick="showCreate()">CREATE<small>ルームを作る</small></div>
      <div class="mode-b" id="lobJoin" onclick="showJoinSec()">JOIN<small>コードで参加</small></div>
    </div>
  </div>
  <!-- CREATE側 -->
  <div id="createSec">
    <div class="room-code-box" id="roomCodeBox" style="display:none">
      <div class="room-code-hint">このコードを相手に共有してください</div>
      <div class="room-code-val" id="roomCodeText"></div>
      <div class="conn-status" id="connStatusBox">&#x25CB; 待機中...</div>
    </div>
    <button class="go-btn ok" id="createBtn" onclick="createRoom()">CREATE ROOM</button>
  </div>
  <!-- JOIN側 -->
  <div id="joinSec" style="display:none">
    <div class="sec-t" style="margin-top:10px"><b>//</b> ルームコードを入力</div>
    <input id="joinCodeInput" type="text" maxlength="6" placeholder="XXXXXX"
      oninput="this.value=this.value.toUpperCase()">
    <button class="go-btn ok" style="margin-top:4px" onclick="joinRoom()">JOIN ROOM</button>
  </div>
</div>

<!-- プロトコル選択画面 -->
<div id="protoSel" style="display:none">
  <div style="margin-bottom:14px">
    <div class="sec-t"><b>//</b> <span id="protoTitle">プロトコルを選択</span></div>
    <div class="info">選択中: <b id="protoCnt">0</b> / 3</div>
    <div class="pills" id="protoPills"></div>
    <div id="protoWait" class="online-wait" style="display:none"></div>
    <button class="go-btn" id="protoSubmit" onclick="submitProtos()">READY</button>
  </div>
</div>

<!-- ゲーム画面 (BOTHモードと同じ構造) -->
<div id="game" style="display:none;flex-direction:column;flex:1;min-height:0">
  <!-- P2 上エリア -->
  <div id="p2top" style="display:none;flex-shrink:0">
    <div class="hand-wrap p2w" id="h2wrap" style="display:none">
      <div class="hand-count p2hc" id="h2count"></div>
      <div class="hand-edge left" data-scrollhand="h2" data-scrolldir="-1">&lsaquo;</div>
      <div class="hand-edge right" data-scrollhand="h2" data-scrolldir="1">&rsaquo;</div>
      <div class="hand-nav">
        <button class="hand-arr" onclick="scrollH('h2',-1)">&larr;</button>
        <button class="hand-arr" onclick="scrollH('h2',1)">&rarr;</button>
      </div>
      <div class="hand p2h" id="h2"></div>
    </div>
    <div class="dbar p2bar">
      <button class="d-btn p2" id="d2d">DECK:0</button>
      <button class="u-btn" onclick="doRefresh(2)">REFRESH</button>
      <div class="trash-zone p2trash" id="trash2" onclick="openTr(2)"><span>P2 TRASH</span><span id="trCnt2"></span></div>
      <span class="d-info" id="d2i" style="display:none"></span>
      <button class="u-btn" id="oppDraw2" onclick="drawOpp(2)" style="display:none">P1 DECK&rarr;</button>
      <button class="u-btn" id="h2tog" onclick="togHand(2)">P2 HAND</button>
    </div>
  </div>

  <!-- フィールド -->
  <div id="field">
    <div id="p2sec" class="f-sec" style="display:none">
      <div class="lines" id="p2l"></div>
    </div>
    <div id="fdiv" class="ctrl-bar" style="display:none">
      <span class="ctrl-bar-label">CONTROL</span>
      <button class="ctrl-bar-btn" id="ctrl1" onclick="togCtrl(1)">P1 &#x2193;</button>
      <button class="ctrl-bar-btn p2on" id="ctrl2" onclick="togCtrl(2)">P2 &#x2191;</button>
    </div>
    <div id="p1sec" class="f-sec">
      <div class="lines" id="p1l"></div>
    </div>
  </div>

  <!-- ターンバー -->
  <div class="turn-bar" id="turnBar" style="display:none">
    <span class="turn-ph" id="turnPh">ACTION</span>
    <span class="turn-lbl" id="turnLbl">P1 のターン</span>
    <button class="turn-end" id="endTurnBtn" onclick="endTurn()">END TURN &#x2192;</button>
  </div>

  <!-- P1 下エリア -->
  <div class="dbar">
    <button class="d-btn" id="d1d">DECK:0</button>
    <button class="u-btn" onclick="doRefresh(1)">REFRESH</button>
    <div class="trash-zone" id="trash" onclick="openTr(1)"><span id="trLbl">P1 TRASH</span><span id="trCnt1"></span></div>
    <span class="d-info" id="d1i" style="display:none"></span>
    <button class="u-btn" id="h1tog" onclick="togHand(1)" style="display:none">HIDE</button>
    <button class="u-btn" id="oppDraw1" onclick="drawOpp(1)" style="display:none">P2 DECK&rarr;</button>
    <button class="u-btn" id="uBtn" onclick="doUndo()" disabled>UNDO</button>
    <button class="hbtn" id="shareBtn" style="display:none" onclick="shareURL()">SHARE</button>
  </div>
  <div class="hand-wrap" id="h1wrap">
    <div class="hand-count" id="h1count"></div>
    <div class="hand-edge left" data-scrollhand="h1" data-scrolldir="-1">&lsaquo;</div>
    <div class="hand-edge right" data-scrollhand="h1" data-scrolldir="1">&rsaquo;</div>
    <div class="hand" id="h1"></div>
    <div class="hand-nav">
      <button class="hand-arr" onclick="scrollH('h1',-1)">&larr;</button>
      <button class="hand-arr" onclick="scrollH('h1',1)">&rarr;</button>
    </div>
  </div>
</div>

</div><!-- /gameWrap -->

<!-- モーダル・オーバーレイ (solo-play.htmlと同じ) -->
<div class="mover" id="mover">
  <div class="modal" id="modal">
    <div class="m-acc" id="macc"></div>
    <div class="m-hdl"></div>
    <button class="m-x" id="mx">&times;</button>
    <div class="m-body" id="mbody"></div>
  </div>
</div>

<div class="ov" id="trOv">
  <div class="ov-box">
    <div class="ov-hdr">
      <span class="ov-ttl" id="trOvTtl">TRASH</span>
      <button class="m-x" onclick="closeTr()">&times;</button>
    </div>
    <div id="trList"></div>
    <div id="trE" style="text-align:center;color:var(--txdd);padding:14px;font-size:.7rem">捨て札なし</div>
  </div>
</div>

<div class="ls" id="lsOv">
  <div class="ls-box">
    <p id="lsMsg">ラインを選択</p>
    <div class="ls-btns" id="lsBtns"></div>
    <button class="ls-cancel" onclick="lsCancel()">キャンセル</button>
  </div>
</div>

<div class="cf" id="cfOv">
  <div class="cf-box">
    <p>新しいゲームを開始？</p>
    <div class="cf-btns">
      <button class="cf-y" id="cfY">はい</button>
      <button class="cf-n" id="cfN">いいえ</button>
    </div>
  </div>
</div>

<div id="tooltip"></div>
<div id="ghost" style="display:none"></div>
<div id="toast"></div>

<div class="win-ov" id="winOv">
  <div class="win-box">
    <div class="win-title" id="winTitle">COMPILE COMPLETE</div>
    <div class="win-msg" id="winMsg">P1 WIN!</div>
    <button class="win-btn" onclick="document.getElementById('winOv').classList.remove('on')">OK</button>
  </div>
</div>

<div class="ov" id="histMod">
  <div class="ov-box">
    <div class="ov-hdr">
      <span class="ov-ttl">HISTORY</span>
      <button class="m-x" onclick="closeHist()">&times;</button>
    </div>
    <div id="histList"></div>
  </div>
</div>

<div class="ov" id="helpMod">
  <div class="ov-box">
    <div class="ov-hdr">
      <span class="ov-ttl">HELP</span>
      <button class="m-x" onclick="closeHelp()">&times;</button>
    </div>
    <div class="help-sec">
      <div class="help-h">// カード操作</div>
      <div class="help-row">&#x30FB; カードをドラッグ &rarr; <b>LINE</b> / <b>WAIT</b> / <b>TRASH</b> / 手札 へ移動</div>
      <div class="help-row">&#x30FB; カードをタップ &rarr; 効果テキストを表示</div>
      <div class="help-row">&#x30FB; <b>&#x21BB; 反転</b> ボタンで表/裏を切り替え</div>
    </div>
    <div class="help-sec">
      <div class="help-h">// デッキ &amp; WAIT</div>
      <div class="help-row">&#x30FB; <b>DECK</b> をタップ &rarr; 1枚ドロー</div>
      <div class="help-row">&#x30FB; <b>DECK</b> をドラッグ &rarr; LINE/WAITに裏向きで置く</div>
      <div class="help-row">&#x30FB; WAIT エリアをタップ &rarr; 全カードをラインへ</div>
    </div>
    <div class="help-sec">
      <div class="help-h">// オンライン</div>
      <div class="help-row">&#x30FB; 両プレイヤーの操作はリアルタイムで同期されます</div>
      <div class="help-row">&#x30FB; 相手の手札は裏向き（枚数のみ確認可）</div>
      <div class="help-row">&#x30FB; カード効果で相手カードを操作することも可能です</div>
      <div class="help-row">&#x30FB; <b>LEAVE</b> &mdash; ルームを退出</div>
    </div>
  </div>
</div>

<script>
""" + data_block + "\n\n" + js + "\n\n" + firebase_js + """
</script>
</body>
</html>"""

out_path = 'C:/Projects/Compile/room-play.html'
open(out_path, 'w', encoding='utf-8').write(html)
print('Written:', out_path)
print('Total lines:', html.count('\n'))
print('Total size:', len(html), 'bytes')
