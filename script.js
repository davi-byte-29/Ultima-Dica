const $=s=>document.querySelector(s);
const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const show=id=>document.querySelectorAll('.scr').forEach(e=>e.classList.toggle('on',e.id===id));
const shuf=a=>{for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const norm=t=>t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\b(o|a|os|as|de|do|da)\b/g,' ').replace(/\s+/g,' ').trim();
const MAX=16;
const CATS=['Todas','Pessoas','Lugares','Coisas'];
const grupo=c=>({Pessoa:'Pessoas',Personagem:'Pessoas',Lugar:'Lugares',Coisa:'Coisas',Animal:'Coisas'}[c.c]||'Outras');
const TEMAS=['Todos','Geral','Marvel','Brasil','Esportes','Animais'];
const PEER_OPTS={debug:0,config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'},{urls:'stun:global.stun.twilio.com:3478'},{urls:['turn:openrelay.metered.ca:80','turn:openrelay.metered.ca:443','turn:openrelay.metered.ca:443?transport=tcp'],username:'openrelayproject',credential:'openrelayproject'}]}};
let mode,isHost=false,S=null,deck=[],cur=null,peer=null,conns={},myId='',hostConn=null,code='',lastKey='',dicasKey='',syncIv=null,tt=null;

const novo=()=>({phase:'lobby',players:[],round:0,rounds:5,tema:'Todos',categoria:'Todas',total:20,shown:0,clues:[],cat:'',turn:0,msg:'',ans:'',won:null,pts:0});

/* ---------- Motor do jogo (roda no host ou no modo local) ---------- */
function pub(){
  render();
  if(mode==='online'&&isHost)Object.values(conns).forEach(c=>c.open&&c.send({t:'state',s:S}));
}
function addP(id,name){
  if(S.players.length>=MAX)return false;
  name=(name||'Jogador').trim().slice(0,14)||'Jogador';
  let n=name,i=2;
  while(S.players.some(p=>p.name===n))n=name+' '+i++;
  S.players.push({id,name:n,score:0});
  return true;
}
function removeP(id){
  const i=S.players.findIndex(p=>p.id===id);
  if(i<0)return;
  S.players.splice(i,1);
  if(S.phase==='play'||S.phase==='reveal'){
    if(S.players.length<2){S.phase='end';return pub()}
    if(i<S.turn)S.turn--;
    S.turn%=S.players.length;
  }
  pub();
}
function startGame(){
  if(S.players.length<2)return;
  deck=[];
  const pool=CARTAS.filter(c=>(S.tema==='Todos'||c.t===S.tema)&&(S.categoria==='Todas'||grupo(c)===S.categoria));
  if(!pool.length){S.msg='Não há cartas para essa combinação de tema e categoria.';return pub()}
  S.msg='';
  while(deck.length<S.rounds)deck=deck.concat(shuf(pool.slice()));
  S.players.forEach(p=>p.score=0);
  S.round=0;
  nextRound();
}
function nextRound(){
  S.round++;
  if(S.round>S.rounds){S.phase='end';return pub()}
  cur=deck[S.round-1];
  S.phase='play';S.cat=cur.t==='Geral'?cur.c:cur.t+': '+cur.c;S.total=cur.d.length;S.shown=0;S.ans='';S.won=null;S.msg='';S.pts=0;
  S.turn=(S.round-1)%S.players.length;
  clue();
}
function clue(){
  S.shown++;
  if(S.shown>S.total){
    S.shown=S.total;S.phase='reveal';S.ans=cur.a[0];S.won=null;S.clues=cur.d.slice();
    S.msg='Ninguém acertou.';
    return pub();
  }
  S.clues=cur.d.slice(0,S.shown);
  pub();
  armar();
}
function armar(){
  clearTimeout(tt);
  if(mode!=='online'||!isHost||S.phase!=='play')return;
  const r=S.round,sh=S.shown;
  tt=setTimeout(()=>{
    if(S&&S.phase==='play'&&S.round===r&&S.shown===sh){S.msg=S.players[S.turn].name+' demorou e perdeu a vez.';adv()}
  },60000);
}
function adv(){S.turn=(S.turn+1)%S.players.length;clue()}
function act(a,pid){
  if(!S)return;
  const p=S.players[S.turn];
  switch(a.t){
    case 'guess':{
      const g=String(a.text||'').slice(0,60);
      if(S.phase!=='play'||!p||p.id!==pid||!norm(g))return;
      if(cur.a.some(x=>norm(x)===norm(g))){
        S.pts=S.total+1-S.shown;p.score+=S.pts;
        S.phase='reveal';S.ans=cur.a[0];S.won=p.name;
        S.msg=p.name+' acertou na dica '+S.shown+' e ganhou '+S.pts+' pontos!';
        return pub();
      }
      S.msg=p.name+' errou: "'+g+'"';
      return adv();
    }
    case 'pass':
      if(S.phase!=='play'||!p||p.id!==pid)return;
      S.msg=p.name+' passou.';
      return adv();
    case 'next':
      if(S.phase==='reveal'&&pid===myId)nextRound();
      return;
    case 'start':
      if(S.phase==='lobby'&&pid===myId)startGame();
      return;
    case 'rounds':
      if(S.phase==='lobby'&&pid===myId){S.rounds=Math.min(10,Math.max(1,+a.n||5));pub()}
      return;
    case 'tema':
      if(S.phase==='lobby'&&pid===myId&&TEMAS.includes(a.v)){S.tema=a.v;S.msg='';pub()}
      return;
    case 'categoria':
      if(S.phase==='lobby'&&pid===myId&&CATS.includes(a.v)){S.categoria=a.v;S.msg='';pub()}
      return;
    case 'again':
      if(S.phase==='end'&&pid===myId){S.phase='lobby';S.msg='';pub()}
  }
}
/* Envia uma ação: local e host executam direto; convidados mandam ao host. */
function send(a){
  if(mode==='local')return act(a,a.t==='guess'||a.t==='pass'?S.players[S.turn].id:myId);
  if(isHost)return act(a,myId);
  if(hostConn&&hostConn.open)hostConn.send(a);
}

/* ---------- Interface ---------- */
const meuTurno=()=>S.phase==='play'&&(mode==='local'||S.players[S.turn].id===myId);
function render(){
  if(!S)return;
  const ph=S.phase;
  document.body.classList.toggle('marvel',ph==='lobby'?S.tema==='Marvel':ph==='end'?false:S.cat.startsWith('Marvel'));
  if(ph==='lobby')renderLobby();
  else if(ph==='end')renderEnd();
  else renderGame();
}
function renderLobby(){
  show('lobby');
  const local=mode==='local';
  $('#lobTit').textContent=local?'Jogadores':'Sala de espera';
  $('#codBox').style.display=local?'none':'block';
  $('#codBox').textContent=code;
  $('#bLink').style.display=local?'none':'block';
  $('#addBox').style.display=local?'flex':'none';
  $('#rodBox').style.display=local||isHost?'flex':'none';
  $('#rod').value=S.rounds;
  $('#tema').value=S.tema;$('#categoria').value=S.categoria;$('#categoria').disabled=!(local||isHost);$('#tema').disabled=!(local||isHost);
  $('#lista').innerHTML=S.players.map((p,i)=>
    '<li><span>'+esc(p.name)+(!local&&p.id===myId?' (você)':'')+(!local&&i===0?' · anfitrião':'')+'</span>'+
    (local?'<button data-rm="'+i+'" aria-label="Remover '+esc(p.name)+'">Remover</button>':'')+'</li>').join('');
  const n=S.players.length,pode=local||isHost;
  $('#bStart').style.display=pode?'block':'none';
  $('#bStart').disabled=n<2;
  $('#lobInfo').textContent=n<2?'Mínimo de 2 jogadores ('+n+'/'+MAX+').':n+'/'+MAX+' jogadores.'+(pode?'':' Aguardando o anfitrião começar.');
  if(!local&&isHost)$('#lobInfo').textContent+=' Compartilhe o código da sala.';
  if(S.msg)$('#lobInfo').textContent=S.msg;
}
function renderGame(){
  show('game');
  const rev=S.phase==='reveal',p=S.players[S.turn],pode=meuTurno();
  $('#hud').innerHTML='<span>Rodada '+S.round+'/'+S.rounds+'</span><span>'+esc(S.cat)+'</span><span>Dica '+S.shown+'/'+S.total+'</span>';
  $('#vez').textContent=rev?'Resposta: '+S.ans:(pode&&mode==='online'?'Sua vez!':'Vez de '+p.name)+' · vale '+(S.total+1-S.shown)+' pontos';
  const dk=S.round+'|'+S.clues.length+'|'+S.clues[0];
  if(dk!==dicasKey){dicasKey=dk;$('#dicas').innerHTML=S.clues.map((c,i)=>'<li data-n="'+(i+1)+'">'+esc(c)+'</li>').join('')}
  $('#msg').textContent=S.msg;
  $('#acao').classList.toggle('off',!pode);
  const key=S.round+'-'+S.shown+'-'+S.phase;
  if(key!==lastKey){lastKey=key;$('#palpite').value='';if(pode&&mode==='online'&&matchMedia('(pointer:fine)').matches)$('#palpite').focus()}
  $('#rev').classList.toggle('on',rev);
  if(rev){
    $('#revTxt').textContent=(S.won?S.won+' acertou! +'+S.pts+' pontos. ':'Ninguém pontuou. ')+'A resposta era: '+S.ans;
    const pode2=mode==='local'||isHost;
    $('#bProx').style.display=pode2?'block':'none';
    $('#bProx').textContent=S.round>=S.rounds?'Ver resultado':'Próxima rodada';
  }
  $('#placar').innerHTML=S.players.map((q,i)=>'<li'+(i===S.turn&&!rev?' class="on"':'')+'><span>'+esc(q.name)+'</span><b>'+q.score+'</b></li>').join('');
}
function renderEnd(){
  show('end');
  const r=S.players.slice().sort((a,b)=>b.score-a.score);
  const top=r.filter(p=>p.score===r[0].score);
  $('#venc').textContent=top.length>1?'Empate: '+top.map(p=>p.name).join(' e '):r[0].name+' venceu!';
  $('#rank').innerHTML=r.map(p=>'<li><span>'+esc(p.name)+'</span><b>'+p.score+'</b></li>').join('');
  $('#bNovo').style.display=mode==='local'||isHost?'block':'none';
}

/* ---------- Rede (PeerJS): host = sala ---------- */
function fecharRede(){
  clearInterval(syncIv);clearTimeout(tt);
  Object.values(conns).forEach(c=>c.close());conns={};
  if(peer){peer.destroy();peer=null}
  hostConn=null;isHost=false;
}
function nomeJogador(){return ($('#nome2').value.trim()||$('#nome').value.trim()||'Jogador')}
function ligarRede(p){let n=0;p.on('open',()=>n=0);p.on('disconnected',()=>{if(peer!==p||p.destroyed)return;setTimeout(()=>{if(peer===p&&!p.destroyed&&p.disconnected)p.reconnect()},Math.min(2000*++n,15000))})}
function criarSala(){
  fecharRede();mode='online';isHost=true;
  code=Array.from({length:5},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random()*32|0]).join('');
  $('#onMsg').textContent='Criando sala...';
  peer=new Peer('ultimadica-'+code,PEER_OPTS);ligarRede(peer);
  peer.on('error',e=>{
    if(e.type==='unavailable-id')return criarSala();
    $('#onMsg').textContent='Erro de conexão ('+e.type+'). Tente novamente.';
  });
  peer.on('open',id=>{
    myId=id;S=novo();addP(id,nomeJogador());pub();
  });
  peer.on('connection',c=>{
    c.on('data',d=>{
      if(d.t==='join'){
        if(S.phase!=='lobby'){c.send({t:'err',m:'O jogo já começou.'});return setTimeout(()=>c.close(),300)}
        if(!addP(c.peer,d.name)){c.send({t:'err',m:'Sala cheia (16 jogadores).'});return setTimeout(()=>c.close(),300)}
        conns[c.peer]=c;pub();
      }else if(d.t==='sync')c.send({t:'state',s:S});
      else act(d,c.peer);
    });
    c.on('close',()=>{delete conns[c.peer];removeP(c.peer)});
  });
}
function entrarSala(){
  const c=$('#cod').value.trim().toUpperCase();
  if(c.length<5){$('#onMsg').textContent='Digite o código de 5 caracteres.';return}
  fecharRede();mode='online';code=c;
  $('#onMsg').textContent='Conectando...';
  peer=new Peer(PEER_OPTS);ligarRede(peer);
  peer.on('error',e=>{$('#onMsg').textContent=e.type==='peer-unavailable'?'Sala não encontrada. Confira o código.':'Erro de conexão ('+e.type+').'});
  peer.on('open',id=>{
    myId=id;
    hostConn=peer.connect('ultimadica-'+c,{reliable:true});
    const t=setTimeout(()=>{if(hostConn&&!hostConn.open)$('#onMsg').textContent='Não foi possível conectar. Verifique o código e a internet dos dois aparelhos.'},15000);
    hostConn.on('open',()=>{clearTimeout(t);hostConn.send({t:'join',name:nomeJogador()});clearInterval(syncIv);syncIv=setInterval(()=>{if(hostConn&&hostConn.open)hostConn.send({t:'sync'})},10000)});
    hostConn.on('data',d=>{
      if(d.t==='state'){S=d.s;render()}
      else if(d.t==='err'){alert(d.m);sairParaMenu()}
    });
    hostConn.on('close',()=>{if(S){alert('A conexão com a sala foi encerrada.');sairParaMenu()}});
  });
}
function sairParaMenu(){fecharRede();S=null;mode=null;$('#onMsg').textContent='';show('menu')}

/* ---------- Eventos ---------- */
$('#bOnline').onclick=()=>{$('#onMsg').textContent='';show('online')};
$('#bLocal').onclick=()=>{
  fecharRede();mode='local';isHost=true;myId='host';S=novo();
  addP('L0',nomeJogador()==='Jogador'?'Jogador 1':nomeJogador());
  pub();
};
$('#bCriar').onclick=criarSala;
$('#bEntrar').onclick=entrarSala;
$('#cod').onkeydown=e=>{if(e.key==='Enter')entrarSala()};
document.querySelectorAll('[data-back]').forEach(b=>b.onclick=sairParaMenu);
$('#bSair').onclick=sairParaMenu;
$('#bMenu').onclick=sairParaMenu;
function addLocal(){
  const v=$('#novo').value.trim();
  if(!v)return;
  if(!addP('L'+Date.now(),v))alert('Máximo de 16 jogadores.');
  $('#novo').value='';pub();
}
$('#bAdd').onclick=addLocal;
$('#novo').onkeydown=e=>{if(e.key==='Enter')addLocal()};
$('#lista').onclick=e=>{
  const i=e.target.dataset.rm;
  if(i!==undefined&&mode==='local'){S.players.splice(+i,1);pub()}
};
$('#rod').onchange=e=>send({t:'rounds',n:+e.target.value});
$('#bStart').onclick=()=>send({t:'start'});
$('#bPalpite').onclick=()=>{const v=$('#palpite').value.trim();if(v)send({t:'guess',text:v})};
$('#palpite').onkeydown=e=>{if(e.key==='Enter')$('#bPalpite').click()};
$('#bPassar').onclick=()=>send({t:'pass'});
$('#bProx').onclick=()=>send({t:'next'});
$('#bNovo').onclick=()=>send({t:'again'});

/* ---------- Nome salvo, link de convite e copiar link ---------- */
const guardar=n=>{try{localStorage.setItem('ud_nome',n)}catch(e){}};
try{const n=localStorage.getItem('ud_nome');if(n)$('#nome').value=$('#nome2').value=n}catch(e){}
$('#nome').oninput=e=>{$('#nome2').value=e.target.value;guardar(e.target.value)};
$('#nome2').oninput=e=>{$('#nome').value=e.target.value;guardar(e.target.value)};
$('#cod').oninput=e=>{e.target.value=e.target.value.toUpperCase()};
$('#bLink').onclick=async()=>{
  const url=location.origin+location.pathname+'?sala='+code;
  try{await navigator.clipboard.writeText(url);$('#bLink').textContent='Link copiado!'}
  catch(e){prompt('Copie o link da sala:',url)}
  setTimeout(()=>$('#bLink').textContent='Copiar link da sala',2000);
};
const convite=new URLSearchParams(location.search).get('sala');
if(convite){$('#cod').value=convite.toUpperCase().slice(0,5);$('#onMsg').textContent='Convite recebido: digite seu nome e toque em Entrar.';show('online')}

document.addEventListener('visibilitychange',()=>{if(!document.hidden&&hostConn&&hostConn.open)hostConn.send({t:'sync'})});

$('#tema').innerHTML=TEMAS.map(t=>'<option>'+t+'</option>').join('');
$('#tema').onchange=e=>send({t:'tema',v:e.target.value});

$('#categoria').innerHTML=CATS.map(t=>'<option>'+t+'</option>').join('');
$('#categoria').onchange=e=>send({t:'categoria',v:e.target.value});
