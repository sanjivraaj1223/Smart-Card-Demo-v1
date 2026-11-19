/* ============================================================
   GUHANIX SMARTCARD V1  ·  app.js
   Clean module pattern — one object per concern.
   No global state mutations except through State.set().
   ============================================================ */
'use strict';

/* ── State ─────────────────────────────────────────────── */
const State = (() => {
  const s = {
    screen:   's-home',
    locked:   false,
    pin:      '1234',
    battery:  78,
    tfAmount: '0',
    nfcAmount:'0',
    tfStep:   0,
    tfRef:    '',
    nfcBusy:  false,
    bioCtx:   null,
    bioTimer: null,
    qrStream: null,
    lockBuf:  '',
    secBuf:   '',
  };
  return {
    get:   k     => s[k],
    set:   (k,v) => { s[k]=v; },
    all:   ()    => ({...s}),
  };
})();

/* ── Utils ──────────────────────────────────────────────── */
const U = {
  pad: n => String(n).padStart(2,'0'),
  time(){ const d=new Date(); return `${this.pad(d.getHours())}:${this.pad(d.getMinutes())}`; },
  date(){
    const d=new Date();
    const mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${mo[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  },
  inr: n  => Number(n).toLocaleString('en-IN'),
  ref: () => 'TXN-' + Math.random().toString(36).substring(2,8).toUpperCase(),
  q:   sel => document.querySelector(sel),
  qa:  sel => [...document.querySelectorAll(sel)],
  shake(el){
    el.classList.remove('shake'); void el.offsetWidth;
    el.classList.add('shake');
    el.addEventListener('animationend',()=>el.classList.remove('shake'),{once:true});
  },
};

/* ── Clock ──────────────────────────────────────────────── */
const Clock = {
  init(){
    this.tick();
    setInterval(()=>this.tick(), 10_000);
  },
  tick(){
    const t = U.time();
    U.qa('[data-clock]').forEach(el=>el.textContent=t);
  },
};

/* ── Status Bar Injector ────────────────────────────────── */
/* Single template — injected into every .screen at init */
const SBar = {
  html(){
    return `
    <header class="sbar" role="banner">
      <div class="sbar-brand">
        <svg class="sbar-logo" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5z"
                stroke="url(#sbg)" stroke-width="1.6"
                stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="url(#sbg)" stroke-width="1.3"
                stroke-linecap="round" stroke-linejoin="round"/>
          <defs>
            <linearGradient id="sbg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stop-color="#D4AF37"/>
              <stop offset="100%" stop-color="#8A6A20"/>
            </linearGradient>
          </defs>
        </svg>
        <span class="sbar-name">Guhanix</span>
      </div>
      <div class="sbar-right">
        <div class="nfc-ind"></div>
        <span class="sbar-time" data-clock>00:00</span>
        <div class="bat">
          <div class="bat-body"><div class="bat-fill"></div></div>
          <div class="bat-tip"></div>
          <span class="bat-pct">78%</span>
        </div>
      </div>
    </header>`;
  },
  inject(){
    U.qa('.screen').forEach(scr => {
      scr.insertAdjacentHTML('afterbegin', this.html());
    });
  },
};

/* ── Router ─────────────────────────────────────────────── */
const Router = {
  ORDER: ['s-home','s-wallet','s-transfer','s-history','s-nfc','s-security','s-settings'],

  go(id) {
    if (State.get('locked') && id !== '_bypass') { LockScreen.show(); return; }
    const cur = State.get('screen');
    if (id === cur) return;
    const prev = document.getElementById(cur);
    const next = document.getElementById(id);
    if (!next) return;
    prev.classList.remove('on'); prev.classList.add('out');
    setTimeout(() => prev.classList.remove('out'), 440);
    next.classList.add('on');
    State.set('screen', id);
    Idle.reset();
  },

  swipeNext() {
    const i = this.ORDER.indexOf(State.get('screen'));
    if (i < this.ORDER.length - 1) this.go(this.ORDER[i+1]);
  },
  swipePrev() {
    const i = this.ORDER.indexOf(State.get('screen'));
    if (i > 0) this.go(this.ORDER[i-1]);
  },

  initSwipe() {
    let sx=0, sy=0;
    const card = document.getElementById('C');
    card.addEventListener('touchstart', e=>{sx=e.touches[0].clientX; sy=e.touches[0].clientY;},{passive:true});
    card.addEventListener('touchend', e=>{
      const dx=e.changedTouches[0].clientX-sx, dy=e.changedTouches[0].clientY-sy;
      if (Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)*1.4) {
        dx<0 ? this.swipeNext() : this.swipePrev();
      }
    },{passive:true});
  },
};

/* ── Idle Timer ─────────────────────────────────────────── */
const Idle = {
  timer: null, TIMEOUT: 60_000,
  reset() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const su = document.getElementById('s-startup');
      if (su.classList.contains('hiding') || su.style.display==='none') {
        State.set('locked', true);
        Security.syncUI();
        LockScreen.show();
      }
    }, this.TIMEOUT);
  },
};

/* ── Startup ─────────────────────────────────────────────── */
const Startup = {
  init() {
    const el = document.getElementById('s-startup');
    el.addEventListener('click', () => this.dismiss());
    setTimeout(() => this.dismiss(), 3000);
  },
  dismiss() {
    const el = document.getElementById('s-startup');
    if (el.classList.contains('hiding')) return;
    el.classList.add('hiding');
    el.addEventListener('transitionend', () => { el.style.display='none'; }, {once:true});
  },
};

/* ── Lock Screen ─────────────────────────────────────────── */
const LockScreen = {
  buf: '',

  show() {
    this.buf = '';
    this._renderDots();
    document.getElementById('s-lock').classList.add('on');
    Idle.timer && clearTimeout(Idle.timer);
  },
  hide() {
    document.getElementById('s-lock').classList.remove('on');
    Idle.reset();
  },

  handleKey(k) {
    if      (k==='del') this.buf = this.buf.slice(0,-1);
    else if (k==='clr') this.buf = '';
    else if (this.buf.length<4) this.buf += k;
    this._renderDots();
    if (this.buf.length===4) {
      if (this.buf===State.get('pin')) {
        State.set('locked', false);
        Security.syncUI();
        setTimeout(() => this.hide(), 150);
      } else {
        this._renderDots(true);
        U.shake(U.q('#lock-dots'));
        setTimeout(()=>{ this.buf=''; this._renderDots(); }, 700);
      }
    }
  },

  _renderDots(err=false) {
    U.qa('#lock-dots .pin-dot').forEach((d,i)=>{
      d.classList.toggle('on',  !err && i<this.buf.length);
      d.classList.toggle('err', err);
    });
  },

  init() {
    U.qa('[data-lk]').forEach(k=>k.addEventListener('click',()=>this.handleKey(k.dataset.lk)));
  },
};

/* ── Biometric Modal ─────────────────────────────────────── */
const Bio = {
  show(ctx) {
    State.set('bioCtx', ctx);
    const pf = U.q('#bio-pf');
    const st = U.q('#bio-st');
    pf.style.width='0%'; pf.style.background='';
    st.textContent='Place finger on sensor';
    document.getElementById('bio-modal').classList.add('on');
    let p=0;
    const t = setInterval(()=>{
      p += 3.5;
      pf.style.width = Math.min(p,100)+'%';
      if (p>45 && p<80) st.textContent='Scanning…';
      if (p>=100) {
        clearInterval(t);
        st.textContent='✓ Verified';
        pf.style.background='linear-gradient(90deg,rgba(61,184,122,.7),rgba(80,200,140,.8))';
        setTimeout(()=>{
          document.getElementById('bio-modal').classList.remove('on');
          const c = State.get('bioCtx');
          if (c==='lock')  { State.set('locked',false); Security.syncUI(); LockScreen.hide(); }
          else if (c==='nfc') NFC.pay();
          State.set('bioCtx', null);
        }, 650);
      }
    }, 60);
    State.set('bioTimer', t);
  },
  close() {
    clearInterval(State.get('bioTimer'));
    const pf = U.q('#bio-pf');
    pf.style.width='0%'; pf.style.background='';
    document.getElementById('bio-modal').classList.remove('on');
    State.set('bioCtx', null);
  },
};

/* ── QR Scanner ─────────────────────────────────────────── */
const QR = {
  async open() {
    const st = U.q('#qr-st');
    document.getElementById('qr-modal').classList.add('on');
    st.textContent = 'Starting camera…';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      State.set('qrStream', stream);
      const v = U.q('#qr-video');
      v.srcObject = stream; v.play();
      st.textContent = 'Scanning for QR code…';
    } catch {
      st.textContent = 'Camera unavailable — use Simulate Scan';
    }
  },
  close() {
    const s = State.get('qrStream');
    if (s) { s.getTracks().forEach(t=>t.stop()); State.set('qrStream',null); }
    U.q('#qr-video').srcObject = null;
    document.getElementById('qr-modal').classList.remove('on');
  },
  simulate() {
    U.q('#qr-st').textContent = '✓ QR Detected: pay@guhanix-4821';
    setTimeout(()=>{
      this.close();
      U.q('#tf-name').value = 'Guhanix Merchant';
      U.q('#tf-acc').value  = 'pay@guhanix-4821';
      Router.go('s-transfer');
    }, 1200);
  },
};

/* ── Transfer ────────────────────────────────────────────── */
const Transfer = {
  _step: 0, _amt: '0', _ref: '',

  init() {
    U.q('#tf-npad').addEventListener('click', e=>{
      const k=e.target.dataset.k; if(!k)return; this._amtKey(k);
    });
    U.q('#tf-next0').onclick = ()=>this._next(0);
    U.q('#tf-next1').onclick = ()=>this._next(1);
    U.q('#tf-next2').onclick = ()=>this._next(2);
    U.q('#tf-back1').onclick = ()=>this._back(1);
    U.q('#tf-back2').onclick = ()=>this._back(2);
    U.q('#tf-new').onclick   = ()=>this._reset();
  },

  _amtKey(k) {
    if      (k==='del') this._amt = this._amt.slice(0,-1) || '0';
    else if (k==='.')   { if (!this._amt.includes('.')) this._amt+='.'; }
    else {
      if (this._amt==='0') this._amt=k;
      else if (this._amt.includes('.') && this._amt.split('.')[1].length>=2) return;
      else this._amt += k;
    }
    U.q('#tf-amt-num').textContent = this._amt;
  },

  _next(step) {
    if (step===0) {
      const n = U.q('#tf-name').value.trim();
      if (!n) { U.shake(U.q('#tf-name')); return; }
      this._amt='0'; U.q('#tf-amt-num').textContent='0';
      this._goto(1);
    } else if (step===1) {
      const a = parseFloat(this._amt);
      if (!a||a<=0) { U.shake(U.q('#tf-amt-num')); return; }
      this._ref = U.ref();
      const fmt = '₹'+U.inr(this._amt);
      U.q('#rv-to').textContent   = U.q('#tf-name').value;
      U.q('#rv-acc').textContent  = U.q('#tf-acc').value||'—';
      U.q('#rv-amt').textContent  = fmt;
      U.q('#rv-tot').textContent  = fmt;
      U.q('#rv-ref').textContent  = this._ref;
      this._goto(2);
    } else if (step===2) {
      U.q('#sv-to').textContent  = `Sent to ${U.q('#tf-name').value}`;
      U.q('#sv-amt').textContent = '₹'+U.inr(this._amt);
      U.q('#sv-ref').textContent = this._ref;
      this._goto(3);
    }
  },

  _back(step)  { this._goto(step-1); },
  _reset() {
    ['#tf-name','#tf-acc','#tf-ifsc'].forEach(s=>U.q(s).value='');
    this._amt='0'; U.q('#tf-amt-num').textContent='0';
    this._goto(0);
  },

  _goto(n) {
    this._step = n;
    for (let i=0;i<=3;i++) {
      const el = document.getElementById('tf'+i);
      if (el) el.style.display = (i===n)?'flex':'none';
    }
    ['ts0','ts1','ts2','ts3'].forEach((id,i)=>{
      const seg=document.getElementById(id); if(!seg)return;
      seg.classList.toggle('on',   i===n);
      seg.classList.toggle('done', i<n);
      seg.classList.remove('big','sm');
      seg.classList.add(i===0?'big':'sm');
    });
  },
};

/* ── NFC ─────────────────────────────────────────────────── */
const NFC = {
  _amt: '0',

  init() {
    U.q('#nfc-npad').addEventListener('click', e=>{
      const k=e.target.dataset.k; if(!k)return; this._key(k);
    });
    U.q('#nfc-tap-btn').onclick = ()=>this.pay();
    U.q('#nfc-bio-btn').onclick = ()=>Bio.show('nfc');
  },

  _key(k) {
    if      (k==='del') this._amt = this._amt.slice(0,-1) || '0';
    else if (k==='.')   { if (!this._amt.includes('.')) this._amt+='.'; }
    else {
      if (this._amt==='0') this._amt=k;
      else if (this._amt.includes('.') && this._amt.split('.')[1].length>=2) return;
      else this._amt += k;
    }
    U.q('#nfc-amt-num').textContent = this._amt;
  },

  pay() {
    if (State.get('nfcBusy')) return;
    const a = parseFloat(this._amt);
    if (!a||a<=0) { U.shake(U.q('#nfc-amt-num')); return; }
    State.set('nfcBusy', true);
    this._setState('processing');
    setTimeout(()=>{
      this._setState('success');
      setTimeout(()=>{
        this._amt='0'; U.q('#nfc-amt-num').textContent='0';
        this._setState('idle');
        State.set('nfcBusy', false);
      }, 2600);
    }, 1800);
  },

  _setState(s) {
    const title = U.q('#nfc-title');
    const sub   = U.q('#nfc-sub');
    const wrap  = document.getElementById('nfc-rings-wrap');
    const ctr   = U.q('#nfc-ctr');

    const ICO_NFC = `<svg style="width:clamp(20px,4vh,32px);height:clamp(20px,4vh,32px);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M1 6C1 6 5 1 12 1s11 5 11 5"/><path d="M5 10s2-3 7-3 7 3 7 3"/><path d="M9 14s1-1 3-1 3 1 3 1"/><circle cx="12" cy="18" r="1" fill="currentColor"/></svg>`;
    const ICO_OK  = `<svg style="width:clamp(20px,4vh,32px);height:clamp(20px,4vh,32px);" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    if (s==='idle') {
      wrap.classList.remove('paused'); ctr.innerHTML=ICO_NFC; ctr.style.color='';
      title.textContent='Ready to Pay'; title.style.color='';
      sub.textContent='Hold near NFC terminal';
    } else if (s==='processing') {
      title.textContent='Connecting…'; title.style.color='rgba(212,175,55,.6)';
      sub.textContent='Hold steady';
    } else if (s==='success') {
      wrap.classList.add('paused'); ctr.innerHTML=ICO_OK; ctr.style.color='var(--ok)';
      title.textContent='✓ Payment Approved'; title.style.color='var(--ok)';
      sub.textContent='₹'+U.inr(this._amt)+' paid via NFC';
    }
  },
};

/* ── Security ────────────────────────────────────────────── */
const Security = {
  _buf: '',

  init() {
    U.qa('[data-sk]').forEach(k=>k.addEventListener('click',()=>this._key(k.dataset.sk)));
    U.q('#sec-lock-btn').onclick = ()=>this._toggle();
  },

  _key(k) {
    if      (k==='del') this._buf = this._buf.slice(0,-1);
    else if (k==='clr') this._buf = '';
    else if (this._buf.length<4) this._buf += k;
    this._renderDots();
    const msg = U.q('#sec-msg');
    if (this._buf.length===4) {
      if (this._buf===State.get('pin')) {
        msg.style.color='var(--ok)'; msg.textContent='✓ PIN Verified';
      } else {
        msg.style.color='var(--err)'; msg.textContent='✗ Incorrect PIN';
        U.shake(U.q('#sec-dots'));
      }
      setTimeout(()=>{ this._buf=''; this._renderDots(); msg.textContent=''; }, 1500);
    } else { msg.textContent=''; }
  },

  _renderDots() {
    U.qa('#sec-dots .pin-dot').forEach((d,i)=>{
      d.classList.toggle('on', i<this._buf.length);
      d.classList.remove('err');
    });
  },

  _toggle() {
    if (!State.get('locked')) { State.set('locked',true); this.syncUI(); LockScreen.show(); }
    else LockScreen.show();
  },

  syncUI() {
    const locked = State.get('locked');
    U.q('#sec-icon').textContent   = locked ? '🔒' : '🔓';
    U.q('#sec-title').textContent  = locked ? 'Card Locked' : 'Card Unlocked';
    U.q('#sec-lock-btn').textContent = locked ? 'Unlock Card' : 'Lock Card';
  },
};

/* ── Settings ────────────────────────────────────────────── */
const Settings = {
  init() {
    const sl = U.q('#br-slider');
    const lbl= U.q('#br-val');
    if (!sl) return;
    sl.oninput = ()=>{
      lbl.textContent = sl.value+'%';
      document.getElementById('C').style.filter = `brightness(${sl.value/80*.65+.4})`;
    };
  },
};

/* ── Init ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', ()=>{

  /* 1. Inject status bar into every screen */
  SBar.inject();

  /* 2. Clock */
  Clock.init();

  /* 3. Set dynamic date on home */
  const dateEl = document.getElementById('hm-date');
  if (dateEl) dateEl.textContent = U.date();

  /* 4. Idle reset on any interaction */
  const card = document.getElementById('C');
  card.addEventListener('click',      ()=>Idle.reset());
  card.addEventListener('touchstart', ()=>Idle.reset(), {passive:true});

  /* 5. Init all modules */
  Startup.init();
  LockScreen.init();
  Router.initSwipe();
  Transfer.init();
  NFC.init();
  Security.init();
  Security.syncUI();
  Settings.init();
  Idle.reset();

  /* 6. Expose navigation globally for onclick attributes */
  window.goTo    = id  => Router.go(id);
  window.openQR  = ()  => QR.open();
  window.closeQR = ()  => QR.close();
  window.simQR   = ()  => QR.simulate();
  window.showBio = ctx => Bio.show(ctx);
  window.closeBio= ()  => Bio.close();
});
