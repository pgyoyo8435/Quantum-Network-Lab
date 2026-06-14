"use strict";

// ════════════════════════════════════════════════════════
//  QNL NAMESPACE  — separates Physics | UI | Charts
// ════════════════════════════════════════════════════════
const QNL = {
  physics: {
    _registry: {},
    register(id, runFn) { this._registry[id] = { run: runFn }; },
    runAll(silent=true) {
      Object.values(this._registry).forEach(p => { try { p.run(silent); } catch(e){} });
    }
  },
  charts: {
    _store: {},
    save(id, fn, args) { this._store[id] = {fn, args}; },
    redraw(id) {
      const entry = this._store[id];
      if (entry) { try { entry.fn(...entry.args); } catch(e){} }
    },
    redrawAll() {
      Object.keys(this._store).forEach(id => this.redraw(id));
    }
  },
  ui: {
    formatValue(el) {
      const out  = document.getElementById(el.id + '-out') || document.querySelector(`output[for="${el.id}"]`);
      const unit = el.dataset.unit || '';
      if (!out) return;
      const v = parseFloat(el.value);
      const decimals = parseFloat(el.step) < 1 ? 1 : 0;
      out.textContent = decimals ? v.toFixed(decimals) + unit : v + unit;
    },
    injectSteppers() {
      document.querySelectorAll('.control input[type="range"]').forEach(el => {
        if(el.dataset.stepperInjected) return;
        const row = document.createElement('div');
        row.className = 'stepper-row';
        el.parentNode.insertBefore(row, el);
        const btnDec = document.createElement('button');
        btnDec.type = 'button'; btnDec.className = 'step-btn'; btnDec.textContent = '−';
        const btnInc = document.createElement('button');
        btnInc.type = 'button'; btnInc.className = 'step-btn'; btnInc.textContent = '+';
        row.appendChild(btnDec); row.appendChild(el); row.appendChild(btnInc);
        el.dataset.stepperInjected = "true";

        const step = () => parseFloat(el.step) || 1;
        const nudge = (dir) => {
          if (el.disabled) return;
          const next = parseFloat(el.value) + dir * step();
          el.value = Math.max(+el.min, Math.min(+el.max, next));
          el.dispatchEvent(new Event('input', {bubbles: true}));
        };
        let holdTimer;
        const startHold = (dir) => { nudge(dir); holdTimer = setTimeout(() => { holdTimer = setInterval(() => nudge(dir), 80); }, 400); };
        const stopHold = () => { clearTimeout(holdTimer); clearInterval(holdTimer); };
        btnDec.addEventListener('pointerdown', () => startHold(-1));
        btnInc.addEventListener('pointerdown', () => startHold(+1));
        ['pointerup','pointerleave','pointercancel'].forEach(ev => {
          btnDec.addEventListener(ev, stopHold); btnInc.addEventListener(ev, stopHold);
        });
      });
      // Try to attach hover states if ui.js exposed it globally
      if (typeof attachHoverStates === 'function') attachHoverStates();
    }
  }
};

QNL.ui.injectSteppers();

document.querySelectorAll('input[type="range"]').forEach(el => {
  function upd() {
    QNL.ui.formatValue(el);
    el.closest('.control')?.classList.add('is-touched');
  }
  el.addEventListener('input', upd);
  upd();
});
document.querySelectorAll('select, input[type="number"]').forEach(el => {
  el.addEventListener('change', () => el.classList.add('is-touched'));
});
document.getElementById('btn-reset-all')?.addEventListener('click', () => {
  document.querySelectorAll('.is-touched').forEach(e => e.classList.remove('is-touched'));
  document.querySelectorAll('input').forEach(el => {
    if (el.type === 'range' || el.type === 'number') el.value = el.defaultValue;
    if (el.type === 'range') QNL.ui.formatValue(el);
  });
  document.querySelectorAll('select').forEach(el => {
    el.value = el.querySelector('option[selected]')?.value || el.options[0]?.value;
  });
  reports.length = 0;
  renderReports();
  if (typeof resetCompletion === 'function') resetCompletion();
  QNL.physics.runAll(true);
  drawBB84Histogram([]);
  drawScanChart([]);
  drawBurstChart([]);
  drawPowerScan([]);
  if (typeof showToast === 'function') showToast('Lab reset to defaults.');
});

// ── UTILS ──
const $ = id => document.getElementById(id);
const h2 = QNLCore.binaryEntropy.bind(QNLCore);
function fmtRate(x) { if (x >= 1e6) return (x/1e6).toFixed(2)+' Mbps'; if (x >= 1e3) return (x/1e3).toFixed(1)+' kbps'; return x.toFixed(0)+' bps'; }
function fmtHz(x) { if (x >= 1e6) return (x/1e6).toFixed(2)+' MHz'; if (x >= 1e3) return (x/1e3).toFixed(1)+' kHz'; return x.toFixed(1)+' Hz'; }
function colourClass(v, good, warn) { return v >= good ? 'good' : v >= warn ? 'warn-text' : 'bad'; }
function setMetric(id, val, cls) {
  const el = $(id); if (!el) return;
  el.textContent = val; el.className = 'metric-value' + (cls ? ' ' + cls : '');
  const card = el.closest('.metric');
  if (card) { card.classList.add('updated'); setTimeout(() => card.classList.remove('updated'), 700); }
}
function appendLog(logId, lines) {
  const el = $(logId); if (!el) return;
  el.innerHTML = lines.map(l => `<span class="log-line">${l}</span>`).join('');
  el.scrollTop = el.scrollHeight;
}
function logLine(type, text) {
  const colors = { ok:'#5dd98a', info:'#5ba3ff', warn:'#ffbe44', err:'#ff5f70', dim:'#4e6278' };
  return `<span style="color:${colors[type]||colors.dim}">${text}</span>`;
}

// Session reports
const reports = [];
function addReport(label, summary) {
  reports.unshift({ label, summary, ts: new Date().toLocaleTimeString() });
  renderReports(); 
  if (typeof markDone === 'function') markDone(label.split('-')[0]);
}
function renderReports() {
  const el = $('report-list'); if (!el) return;
  if (!reports.length) { el.innerHTML = '<p style="color:var(--dim);font-size:13px">No runs yet. Execute a simulation to see session history.</p>'; return; }
  el.innerHTML = reports.slice(0, 20).map(r => `<div class="report-item"><strong>${r.label}</strong><span>${r.ts} — ${r.summary}</span></div>`).join('');
}

// Canvas Helpers
function canvasSetup(id) {
  const cv = $(id); if (!cv) return null;
  const dpr = window.devicePixelRatio || 1;
  cv.width  = (cv.offsetWidth  || 600) * dpr; cv.height = (cv.offsetHeight || 220) * dpr;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const W = cv.offsetWidth || 600, H = cv.offsetHeight || 220;
  ctx.clearRect(0, 0, W, H);
  return { ctx, W, H };
}
function drawGrid(ctx, W, H, pad={l:44,r:16,t:16,b:36}) {
  ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = .5;
  for (let x = pad.l; x <= W-pad.r; x += (W-pad.l-pad.r)/5) { ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, H-pad.b); ctx.stroke(); }
  for (let y = pad.t; y <= H-pad.b; y += (H-pad.t-pad.b)/4) { ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W-pad.r, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = .8;
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, H-pad.b); ctx.lineTo(W-pad.r, H-pad.b); ctx.stroke();
}
const seededRNG = QNLCore.seededRNG;

// ════════════════════════════════════════════════════════
//  BB84 SIMULATION
// ════════════════════════════════════════════════════════
function runBB84(showToastMsg = true) {
  if (typeof setStatus === 'function') setStatus('running bb84…');
  const rng    = seededRNG(+($('bb84-seed')?.value || 42));
  const nPulse = +($('bb84-pulses')?.value  || 256);
  const dist   = +($('bb84-distance')?.value || 20);
  const detEff = +($('bb84-detector')?.value || 70) / 100;
  const optErr = +($('bb84-error')?.value   || 2)  / 100;
  const darkP  = +($('bb84-dark')?.value    || 0.1)/ 100;
  const evePct = +($('bb84-eve')?.value     || 0)  / 100;
  const sampleF= +($('bb84-sample')?.value  || 20) / 100;
  const alpha  = 0.20; 

  const T      = Math.pow(10, -alpha*dist/10);
  const pClick = T*detEff + darkP - T*detEff*darkP;

  let detected=0, sifted=0, siftedBits=[], siftedBitsB=[], rows=[];

  for (let i=0; i<nPulse; i++) {
    const aBit   = rng() < .5 ? 0 : 1;
    const aBasis = rng() < .5 ? 0 : 1; 
    const bBasis = rng() < .5 ? 0 : 1;

    if (rng() > pClick) { rows.push({i, aBit, aBasis, bBasis, bBit:null, event:'lost'}); continue; }
    detected++;

    let transmitted = aBit;
    if (rng() < evePct) {
      const eBasis = rng() < .5 ? 0 : 1;
      const eMeas  = (eBasis === aBasis) ? aBit : (rng() < .5 ? 0 : 1);
      transmitted  = (eBasis === aBasis) ? eMeas : (rng() < .5 ? 0 : 1);
    }

    let bBit = transmitted;
    if (rng() < optErr) bBit ^= 1;
    if (rng() < darkP / (pClick || .001)) bBit = rng() < .5 ? 0 : 1;

    if (aBasis === bBasis) {
      sifted++; siftedBits.push(aBit); siftedBitsB.push(bBit);
      rows.push({i, aBit, aBasis, bBasis, bBit, event:'keep', siftedIndex:sifted-1});
    } else {
      rows.push({i, aBit, aBasis, bBasis, bBit, event:'discard'});
    }
  }

  const nSample = sifted > 0 ? Math.max(1, Math.round(sifted * sampleF)) : 0;
  const sampleIdx = new Set();
  while (sampleIdx.size < Math.min(nSample, sifted)) sampleIdx.add(Math.floor(rng()*sifted));
  let sampleErrors = 0;
  sampleIdx.forEach(idx => { if (siftedBits[idx] !== siftedBitsB[idx]) sampleErrors++; });
  const qber = nSample > 0 ? sampleErrors / nSample : 0;
  const secretFrac = Math.max(0, 1 - 2*h2(qber));
  const remaining  = Math.max(0, sifted - nSample);
  const finalKey   = Math.round(remaining * secretFrac);
  const abort      = qber > .11;

  setMetric('bb84-m-detected', detected, colourClass(detected/nPulse, .4, .15));
  setMetric('bb84-m-sifted',   sifted,   colourClass(sifted/nPulse, .3, .1));
  setMetric('bb84-m-qber',     (qber*100).toFixed(2)+'%', abort?'bad': qber>.05?'warn-text':'good');
  setMetric('bb84-m-final',    abort ? 'ABORT' : finalKey, abort?'bad': finalKey>0?'good':'warn-text');

  renderStages([
    {label:'Pulse prep', sub: nPulse+' qubits', ok:true},
    {label:'Transmission', sub: (pClick*100).toFixed(1)+'% P(click)', ok: pClick>.05},
    {label:'Sifting', sub: sifted+' bits kept', ok: sifted>10},
    {label:'QBER check', sub: (qber*100).toFixed(2)+'%', ok: !abort, abort},
    {label: abort ? 'KEY ABORTED' : 'Key accepted', sub: abort ? 'QBER > 11%' : finalKey+' secret bits', ok: !abort, abort}
  ]);

  const tbody = $('bb84-table'); if (tbody) {
    const shown = rows.filter(r => r.event !== 'lost').slice(0, 96);
    tbody.innerHTML = shown.map(r => {
      const isSample = r.event==='keep' && sampleIdx.has(r.siftedIndex);
      const isErr = r.event==='keep' && r.aBit !== r.bBit;
      const cls = r.event==='keep'?(isErr?'error':'keep'):'';
      return `<tr class="${cls}${isSample?' sample':''}">
        <td>${r.i}</td>
        <td><span class="chip">${r.aBit}</span></td>
        <td><span class="chip ${r.aBasis?'x':'z'}">${r.aBasis?'X':'Z'}</span></td>
        <td><span class="chip ${r.bBasis?'x':'z'}">${r.bBasis?'X':'Z'}</span></td>
        <td>${r.bBit!==null?`<span class="chip">${r.bBit}</span>`:'—'}</td>
        <td style="color:${r.event==='keep'?(isErr?'var(--red)':'var(--green)'):'var(--dim)'}">${r.event==='keep'?(isErr?'✗ error':'✓ keep'):'discard'}</td>
      </tr>`;
    }).join('');
  }

  const lines = [
    logLine('info', `► ${nPulse} pulses · fiber: ${dist} km · α=0.20 dB/km → T=${(T*100).toFixed(2)}%`),
    logLine('info', `► P(click) = ${(pClick*100).toFixed(2)}% · detected: ${detected} pulses`),
    evePct>0 ? logLine('warn', `► Eve: ${(evePct*100).toFixed(0)}% intercept-resend active`) : logLine('dim', '► Eve: not present'),
    logLine('info', `► Sifting: ${sifted} bits from ${detected} detected (basis match ≈ 50%)`),
    logLine(qber<.05?'ok':qber<.11?'warn':'err', `► QBER = ${(qber*100).toFixed(2)}% (sample ${nSample} bits · ${sampleErrors} errors)`),
    abort
      ? logLine('err', `► ABORT — QBER > 11%. Key discarded. Eavesdropping or severe channel noise.`)
      : logLine('ok',  `► Secret fraction = ${(secretFrac*100).toFixed(1)}% → final key: ${finalKey} bits`),
    !abort && finalKey < 10 ? logLine('warn', `► Warning: very short key — increase pulses or reduce distance.`) : ''
  ].filter(Boolean);
  appendLog('bb84-log', lines);

  if (showToastMsg) addReport('bb84-run', `${nPulse} pulses, ${dist}km, QBER=${(qber*100).toFixed(2)}%, key=${abort?'ABORT':finalKey+'b'}`);
  if (typeof setStatus === 'function') setStatus('ready');
  if (showToastMsg && typeof showToast === 'function') showToast('BB84 run complete.');
  drawBB84Histogram([]);
}

function renderStages(stages) {
  const el = $('bb84-stages'); if (!el) return;
  el.innerHTML = stages.map(s => `
    <div class="stage ${s.abort?'abort':s.ok?'done':''}">
      <strong style="color:${s.abort?'var(--red)':s.ok?'var(--cyan)':'var(--dim)'}">${s.label}</strong>
      <span>${s.sub}</span>
    </div>`).join('');
}

function runBB84MonteCarlo() {
  if (typeof setStatus === 'function') setStatus('monte carlo…');
  const N = 300;
  const qbers = [];
  const base = {
    pulses:   +($('bb84-pulses')?.value  || 256),
    dist:     +($('bb84-distance')?.value || 20),
    detEff:   +($('bb84-detector')?.value || 70)/100,
    optErr:   +($('bb84-error')?.value   || 2)/100,
    darkP:    +($('bb84-dark')?.value    || 0.1)/100,
    evePct:   +($('bb84-eve')?.value     || 0)/100,
    sampleF:  +($('bb84-sample')?.value  || 20)/100,
  };
  const alpha = 0.20;
  const T = Math.pow(10, -alpha*base.dist/10);
  const pClick = T*base.detEff + base.darkP;

  for (let run=0; run<N; run++) {
    const rng = seededRNG(run * 7919 + 1);
    let sifted=0, siftedBits=[], siftedBitsB=[];
    for (let i=0; i<base.pulses; i++) {
      const aBit=rng()<.5?0:1, aBasis=rng()<.5?0:1, bBasis=rng()<.5?0:1;
      if (rng() > pClick) continue;
      let t=aBit;
      if (rng()<base.evePct) { const eb=rng()<.5?0:1; t=(eb===aBasis)?aBit:(rng()<.5?0:1); }
      let bBit=t; if(rng()<base.optErr) bBit^=1;
      if(aBasis===bBasis){sifted++;siftedBits.push(aBit);siftedBitsB.push(bBit);}
    }
    const ns=Math.max(1,Math.round(sifted*base.sampleF));
    let errs=0;
    for(let k=0;k<ns&&k<sifted;k++) if(siftedBits[k]!==siftedBitsB[k]) errs++;
    qbers.push(ns>0?errs/ns:0);
  }
  drawBB84Histogram(qbers);
  if (typeof setStatus === 'function') setStatus('ready');
  if (typeof showToast === 'function') showToast('Monte Carlo done — '+N+' runs.');
}

function drawBB84Histogram(qbers) {
  QNL.charts.save('bb84-chart', drawBB84Histogram, [qbers]);
  const c = canvasSetup('bb84-chart'); if (!c) return;
  const {ctx,W,H} = c;
  const pad={l:44,r:20,t:22,b:40};
  drawGrid(ctx, W, H, pad);
  if (!qbers.length) {
    ctx.fillStyle='rgba(255,255,255,.15)'; ctx.font='13px '+getComputedStyle(document.body).fontFamily;
    ctx.textAlign='center'; ctx.fillText('Press "Monte Carlo" to generate QBER distribution (300 runs)', W/2, H/2);
    return;
  }
  const bins=30, vals=new Array(bins).fill(0);
  const mx=Math.max(...qbers,0.15);
  qbers.forEach(q=>{ const b=Math.min(bins-1,Math.floor(q/mx*bins)); vals[b]++; });
  const maxV=Math.max(...vals,1);
  const bw=(W-pad.l-pad.r)/bins;
  const abort=.11;
  const ax=pad.l+(abort/mx)*(W-pad.l-pad.r);
  
  ctx.fillStyle='rgba(255,95,112,.07)';
  ctx.fillRect(ax, pad.t, W-pad.r-ax, H-pad.t-pad.b);
  ctx.strokeStyle='rgba(255,95,112,.4)'; ctx.lineWidth=1; ctx.setLineDash([4,3]);
  ctx.beginPath(); ctx.moveTo(ax,pad.t); ctx.lineTo(ax,H-pad.b); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle='rgba(255,95,112,.6)'; ctx.font='10px monospace'; ctx.textAlign='left';
  ctx.fillText('abort > 11%', ax+4, pad.t+12);

  vals.forEach((v,i)=>{
    const x=pad.l+i*bw, bh=(v/maxV)*(H-pad.t-pad.b);
    const q=i/bins*mx;
    const col=q>.11?'rgba(255,95,112,.75)':q>.05?'rgba(255,190,68,.75)':'rgba(54,223,200,.7)';
    ctx.fillStyle=col;
    ctx.fillRect(x+1, H-pad.b-bh, bw-2, bh);
  });
  ctx.fillStyle='rgba(255,255,255,.4)'; ctx.font='10px monospace'; ctx.textAlign='center';
  [0,.05,.1,.15].forEach(q=>{
    if(q>mx) return;
    const x=pad.l+(q/mx)*(W-pad.l-pad.r);
    ctx.fillText((q*100).toFixed(0)+'%', x, H-pad.b+14);
  });
  ctx.fillText('QBER', W/2, H-4);
  ctx.save(); ctx.translate(12, H/2); ctx.rotate(-Math.PI/2);
  ctx.textAlign='center'; ctx.fillText('count', 0, 0); ctx.restore();
  
  const mean=qbers.reduce((a,b)=>a+b,0)/qbers.length;
  const mx2=pad.l+(mean/mx)*(W-pad.l-pad.r);
  ctx.strokeStyle='rgba(91,163,255,.7)'; ctx.lineWidth=1.5; ctx.setLineDash([5,3]);
  ctx.beginPath(); ctx.moveTo(mx2,pad.t); ctx.lineTo(mx2,H-pad.b); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle='rgba(91,163,255,.8)'; ctx.textAlign='center';
  ctx.fillText('mean '+(mean*100).toFixed(1)+'%', mx2, pad.t+10);
}

// ════════════════════════════════════════════════════════
//  ENTANGLEMENT / TIME-BIN SIMULATION
// ════════════════════════════════════════════════════════
function runEntanglement(showMsg=true) {
  if (typeof setStatus === 'function') setStatus('running entanglement…');
  const rPairs  = +($('ent-rate')?.value   || 500) * 1e3;
  const span    = +($('ent-span')?.value   || 30);
  const visIntr = +($('ent-vis')?.value    || 94) / 100;
  const phaseN  = +($('ent-phase')?.value  || 8);
  const dark    = +($('ent-dark')?.value   || 300);
  const window_ = +($('ent-window')?.value || 100) * 1e-12;
  const band    = $('ent-band')?.value || '1310';
  const alpha   = band==='1310'?0.35: band==='1550'?0.20: 3.0;
  const halfDist = span/2;
  const T_arm   = Math.pow(10,-alpha*halfDist/10) * 0.78; 
  const C_sig   = rPairs * T_arm * T_arm;
  const singles = rPairs * T_arm * 2;
  const C_acc   = singles * singles * window_;
  const C_total = C_sig + C_acc;
  const phaseRad = phaseN * Math.PI/180;
  const V_phase  = Math.exp(-phaseRad*phaseRad/2);
  const V_multi  = Math.max(0.5, 1 - rPairs/2e8);
  const V_noise  = C_sig>0 ? C_sig/(C_sig + 2*C_acc + dark*window_*1e9) : 0.1;
  const V_eff    = visIntr * V_phase * V_multi * V_noise;
  const S        = 2*Math.SQRT2 * V_eff;
  const qber_    = Math.max(0, (1-V_eff)/2);
  const Rkey     = 0.5 * C_sig * Math.max(0, 1-2*h2(qber_));

  setMetric('ent-m-coinc', fmtHz(C_sig),   colourClass(C_sig, 1000, 100));
  setMetric('ent-m-vis',   (V_eff*100).toFixed(1)+'%', colourClass(V_eff,.85,.70));
  setMetric('ent-m-s',     S.toFixed(3),    S>2.4?'good':S>2?'warn-text':'bad');
  setMetric('ent-m-key',   fmtRate(Rkey),  colourClass(Rkey,1000,100));

  const lines=[
    logLine('info', `► Pairs: ${(rPairs/1e3).toFixed(0)} kpairs/s · span: ${span} km · α=${alpha} dB/km`),
    logLine('info', `► T_arm=${(T_arm*100).toFixed(2)}% · C_signal=${fmtHz(C_sig)} · C_acc=${C_acc.toFixed(1)} Hz`),
    logLine('info', `► V_phase=${(V_phase*100).toFixed(1)}% (σφ=${phaseN}°) · V_multi=${(V_multi*100).toFixed(1)}%`),
    logLine(V_eff>.85?'ok':V_eff>.7?'warn':'err', `► Franson visibility: ${(V_eff*100).toFixed(2)}%`),
    logLine(S>2?'ok':'err', `► CHSH S = ${S.toFixed(4)} (limit 2.000, Tsirelson 2.828) → Bell ${S>2?'VIOLATED ✓':'not violated ✗'}`),
    logLine('info', `► QBER ≈ ${(qber_*100).toFixed(2)}% → BBM92 key rate: ${fmtRate(Rkey)}`)
  ];
  appendLog('ent-log', lines);
  drawFransonPlot(V_eff);
  drawScanChart([]);
  if (showMsg) addReport('entangle-run', `span=${span}km · V=${(V_eff*100).toFixed(1)}% · S=${S.toFixed(2)} · key=${fmtRate(Rkey)}`);
  if (typeof setStatus === 'function') setStatus('ready');
  if(showMsg && typeof showToast === 'function') showToast('Entanglement simulation done.');
}

function runEntanglementScan() {
  const rPairs  = +($('ent-rate')?.value   || 500)*1e3;
  const visIntr = +($('ent-vis')?.value    || 94)/100;
  const phaseN  = +($('ent-phase')?.value  || 8);
  const dark    = +($('ent-dark')?.value   || 300);
  const window_ = +($('ent-window')?.value || 100)*1e-12;
  const band    = $('ent-band')?.value || '1310';
  const alpha   = band==='1310'?0.35: band==='1550'?0.20: 3.0;
  const phaseRad= phaseN*Math.PI/180;
  const pts=50; const data=[];
  for(let k=0;k<pts;k++){
    const span=2+k*(160/pts);
    const T=Math.pow(10,-alpha*(span/2)/10)*0.78;
    const cs=rPairs*T*T;
    const sg=rPairs*T*2;
    const ca=sg*sg*window_;
    const Vp=Math.exp(-phaseRad*phaseRad/2);
    const Vm=Math.max(.5,1-rPairs/2e8);
    const Vn=cs>0?cs/(cs+2*ca+dark*window_*1e9):0.1;
    const V=visIntr*Vp*Vm*Vn;
    const q=Math.max(0,(1-V)/2);
    const R=0.5*cs*Math.max(0,1-2*h2(q));
    data.push({span,R});
  }
  drawScanChart(data);
  if (typeof showToast === 'function') showToast('Distance scan complete.');
}

function drawFransonPlot(V) {
  QNL.charts.save('ent-franson', drawFransonPlot, [V]);
  const c = canvasSetup('ent-franson'); if(!c) return;
  const {ctx,W,H} = c;
  const pad={l:50,r:18,t:24,b:40};
  drawGrid(ctx,W,H,pad);
  const steps=300;
  ctx.beginPath();
  for(let i=0;i<=steps;i++){
    const phi=(i/steps)*4*Math.PI-2*Math.PI;
    const x=pad.l+(i/steps)*(W-pad.l-pad.r);
    const norm=0.5*(1+V*Math.cos(phi));
    const y=(H-pad.b)-(H-pad.t-pad.b)*norm;
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  }
  ctx.strokeStyle='#5ba3ff'; ctx.lineWidth=2; ctx.stroke();
  ctx.lineTo(W-pad.r,H-pad.b); ctx.lineTo(pad.l,H-pad.b); ctx.closePath();
  ctx.fillStyle='rgba(91,163,255,.07)'; ctx.fill();
  const mid=(H-pad.b)-(H-pad.t-pad.b)*0.5;
  ctx.strokeStyle='rgba(54,223,200,.3)'; ctx.lineWidth=1; ctx.setLineDash([5,4]);
  ctx.beginPath(); ctx.moveTo(pad.l,mid); ctx.lineTo(W-pad.r,mid); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle='rgba(255,255,255,.4)'; ctx.font='10px monospace'; ctx.textAlign='center';
  ['-2π','-π','0','π','2π'].forEach((lbl,idx)=>{
    const x=pad.l+(idx/4)*(W-pad.l-pad.r);
    ctx.fillText(lbl, x, H-pad.b+14);
  });
  ctx.fillText('Phase φ', W/2, H-4);
  ctx.save(); ctx.translate(14,H/2); ctx.rotate(-Math.PI/2); ctx.fillText('Coincidences (norm.)',0,0); ctx.restore();
  ctx.fillStyle='rgba(54,223,200,.85)'; ctx.font='bold 12px monospace'; ctx.textAlign='right';
  ctx.fillText(`V = ${(V*100).toFixed(1)}%`, W-pad.r-6, pad.t+18);
  const Sv=2*Math.SQRT2*V;
  ctx.fillStyle=Sv>2?'rgba(93,217,138,.8)':'rgba(255,95,112,.8)'; ctx.font='11px monospace';
  ctx.fillText(`S = ${Sv.toFixed(3)} ${Sv>2?'✓':'✗'}`, W-pad.r-6, pad.t+34);
}

function drawScanChart(data) {
  QNL.charts.save('ent-scan-chart', drawScanChart, [data]);
  const c = canvasSetup('ent-scan-chart'); if(!c) return;
  const {ctx,W,H} = c;
  const pad={l:58,r:18,t:20,b:40};
  drawGrid(ctx,W,H,pad);
  if(!data.length){
    ctx.fillStyle='rgba(255,255,255,.15)'; ctx.font='12px monospace'; ctx.textAlign='center';
    ctx.fillText('Press "Scan distance" to plot key rate vs span', W/2, H/2); return;
  }
  const maxR=Math.max(...data.map(d=>d.R),1);
  const maxS=data[data.length-1].span;
  const gr=ctx.createLinearGradient(pad.l,0,W-pad.r,0);
  gr.addColorStop(0,'rgba(93,217,138,.9)'); gr.addColorStop(.6,'rgba(255,190,68,.8)'); gr.addColorStop(1,'rgba(255,95,112,.6)');
  ctx.beginPath(); ctx.strokeStyle=gr; ctx.lineWidth=2.2;
  data.forEach((d,i)=>{
    const x=pad.l+(d.span/maxS)*(W-pad.l-pad.r);
    const y=(H-pad.b)-(H-pad.t-pad.b)*(d.R/maxR);
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  });
  ctx.stroke();
  ctx.lineTo(W-pad.r,H-pad.b); ctx.lineTo(pad.l,H-pad.b); ctx.closePath();
  ctx.fillStyle='rgba(54,223,200,.05)'; ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.4)'; ctx.font='10px monospace'; ctx.textAlign='center';
  [0,40,80,120,160].forEach(km=>{
    if(km>maxS) return;
    const x=pad.l+(km/maxS)*(W-pad.l-pad.r);
    ctx.fillText(km+'km', x, H-pad.b+14);
  });
  ctx.fillText('Fiber span', W/2, H-4);
  ctx.save(); ctx.translate(14,H/2); ctx.rotate(-Math.PI/2); ctx.textAlign='center'; ctx.fillText('Key rate (bps)',0,0); ctx.restore();
}

// ════════════════════════════════════════════════════════
//  ROUTING SIMULATION
// ════════════════════════════════════════════════════════
let routingGraph = {nodes:[], edges:[]};

function updateRoutingControlState() {
  const topology = $('rt-topology')?.value || 'diamond';
  const nodesInput = $('rt-nodes');
  if (!nodesInput) return;
  const isFixedDiamond = topology === 'diamond';
  nodesInput.disabled = isFixedDiamond;
  nodesInput.closest('.control')?.classList.toggle('is-disabled', isFixedDiamond);
  nodesInput.closest('.stepper-row')?.querySelectorAll('.step-btn').forEach(button => {
    button.disabled = isFixedDiamond;
  });
  if (isFixedDiamond) {
    const output = $('rt-nodes-out');
    if (output) output.textContent = '6 fixed';
  } else {
    QNL.ui.formatValue(nodesInput);
  }
}

function buildRoutingGraph() {
  const topo   = $('rt-topology')?.value || 'diamond';
  const nNodes = +($('rt-nodes')?.value || 7);
  const linkLen= +($('rt-length')?.value || 12);
  const fidBase= +($('rt-fidelity')?.value || 88)/100;
  const bsmP   = +($('rt-bsm')?.value || 50)/100;
  const alpha  = 0.20;
  const nodes=[], edges=[];
  const W=$('rt-canvas')?.offsetWidth||600, H=300;
  const rng = seededRNG(QNLCore.stringSeed(`${topo}:${nNodes}:${linkLen}:${fidBase}:${bsmP}`));

  if(topo==='line') {
    for(let i=0;i<nNodes;i++) nodes.push({id:i, x:40+i*(W-80)/(nNodes-1), y:H/2, label:i===0?'Alice':i===nNodes-1?'Bob':'R'+i, type:i===0||i===nNodes-1?'end':'repeater'});
    for(let i=0;i<nNodes-1;i++) edges.push({a:i,b:i+1,len:linkLen+rng()*4-2});
  } else if(topo==='diamond') {
    const cx=W/2, cy=H/2;
    nodes.push({id:0,x:60,y:cy,label:'Alice',type:'end'});
    nodes.push({id:1,x:cx-80,y:cy-90,label:'R1',type:'repeater'});
    nodes.push({id:2,x:cx-80,y:cy+90,label:'R2',type:'repeater'});
    nodes.push({id:3,x:cx+80,y:cy-70,label:'R3',type:'repeater'});
    nodes.push({id:4,x:cx+80,y:cy+70,label:'R4',type:'repeater'});
    nodes.push({id:5,x:W-60,y:cy,label:'Bob',type:'end'});
    [[0,1],[0,2],[1,3],[2,4],[1,2],[3,4],[3,5],[4,5]].forEach(([a,b])=> edges.push({a,b,len:linkLen+(rng()-.5)*6}));
  } else if(topo==='ring') {
    const n=Math.min(nNodes,8);
    for(let i=0;i<n;i++){
      const a=(i/n)*2*Math.PI-Math.PI/2;
      nodes.push({id:i,x:W/2+(W/2-60)*Math.cos(a),y:H/2+(H/2-30)*Math.sin(a),label:i===0?'Alice':i===n-1?'Bob':'R'+i,type:i===0||i===n-1?'end':'repeater'});
    }
    for(let i=0;i<n;i++) edges.push({a:i,b:(i+1)%n,len:linkLen+(rng()-.5)*5});
  } else { 
    const n=Math.min(nNodes,8);
    for(let i=0;i<n;i++) nodes.push({id:i,x:60+(rng()*.8+.1)*(W-120),y:40+(rng()*.8)*(H-80),label:i===0?'Alice':i===n-1?'Bob':'R'+i,type:i===0||i===n-1?'end':'repeater'});
    // A backbone guarantees connectivity; shorter cross-links add route choices.
    for(let i=0;i<n-1;i++) edges.push({a:i,b:i+1,len:linkLen+(rng()-.5)*5});
    for(let i=0;i<n;i++) for(let j=i+1;j<n;j++){
      const dx=nodes[i].x-nodes[j].x, dy=nodes[i].y-nodes[j].y;
      const exists = edges.some(e => (e.a===i&&e.b===j)||(e.a===j&&e.b===i));
      if(!exists && Math.sqrt(dx*dx+dy*dy)<(W/3)) edges.push({a:i,b:j,len:linkLen+(rng()-.5)*8});
    }
  }
  edges.forEach(e=>{
    const T=Math.pow(10,-alpha*e.len/10);
    e.pLink=T*T*bsmP; e.fLink=fidBase*(0.9+rng()*.1);
    e.cost=-Math.log(Math.max(1e-6, e.pLink*e.fLink));
  });
  routingGraph={nodes,edges};
  updateRoutingControlState();
  drawRoutingCanvas([],null);
}

function dijkstra(nodes, edges, src, dst) {
  const dist=new Array(nodes.length).fill(Infinity);
  const prev=new Array(nodes.length).fill(null);
  const visited=new Set();
  dist[src]=0;
  while(true){
    let u=-1;
    nodes.forEach((_,i)=>{ if(!visited.has(i)&&(u<0||dist[i]<dist[u])) u=i; });
    if(u<0||u===dst||dist[u]===Infinity) break;
    visited.add(u);
    edges.filter(e=>e.a===u||e.b===u).forEach(e=>{
      const v=e.a===u?e.b:e.a;
      if(dist[u]+e.cost<dist[v]){dist[v]=dist[u]+e.cost;prev[v]=u;}
    });
  }
  const path=[]; let cur=dst;
  while(cur!==null){path.unshift(cur);cur=prev[cur];}
  return path[0]===src?path:[];
}

function runRouting(showMsg=true) {
  if (typeof setStatus === 'function') setStatus('routing…');
  buildRoutingGraph();
  const {nodes,edges}=routingGraph;
  if(!nodes.length){if (typeof setStatus === 'function') setStatus('ready');return;}
  const src=0, dst=nodes.length-1;
  const path=dijkstra(nodes,edges,src,dst);
  if(!path.length||path.length<2){
    appendLog('rt-log',[logLine('err','► No route found. Try a different topology.')]); 
    if (typeof setStatus === 'function') setStatus('ready'); 
    return;
  }
  const memT  = +($('rt-memory')?.value || 50);
  const purify= +($('rt-purify')?.value || 1);
  const bsmP  = +($('rt-bsm')?.value || 50)/100;
  let F=1, pRoute=1;
  const lines=[];
  lines.push(logLine('info',`► Route found: ${path.map(i=>nodes[i].label).join(' → ')} (${path.length-1} hops)`));
  for(let k=0;k<path.length-1;k++){
    const e=edges.find(e=>(e.a===path[k]&&e.b===path[k+1])||(e.b===path[k]&&e.a===path[k+1]));
    if(!e) continue;
    pRoute*=e.pLink; F=F*e.fLink+(1-F)*(1-e.fLink)/3;
    lines.push(logLine('ok',`  Link ${nodes[path[k]].label}→${nodes[path[k+1]].label}: F=${(e.fLink*100).toFixed(1)}% · P=${(e.pLink*100).toFixed(2)}%`));
  }
  for(let k=1;k<path.length-1;k++){
    const delay=e=>(e?.len||12)/200e3*1e3; 
    const decoF=Math.exp(-(delay(edges.find(e=>e.a===path[k]||e.b===path[k]))||2)/memT);
    F=F*decoF; pRoute*=bsmP;
    const Fswap=F*F+(1-F)*(1-F)/3; F=Fswap;
    lines.push(logLine(F>.6?'ok':'warn',`  Swap @ ${nodes[path[k]].label}: decoherence×${decoF.toFixed(3)} → F=${(F*100).toFixed(2)}%`));
  }
  for(let r=0;r<purify&&F<.99;r++){
    const F2=F, gain=(F2*F2)/(F2*F2+(1-F2)*(1-F2)); F=gain; pRoute*=0.5;
    lines.push(logLine('ok',`  Purification round ${r+1}: F ${(F2*100).toFixed(2)} → ${(F*100).toFixed(2)}%`));
  }
  const rAttempt=1e3; 
  const throughput=(pRoute*rAttempt).toFixed(1);
  lines.push(logLine(F>.8?'ok':F>.6?'warn':'err',`► End-to-end F=${(F*100).toFixed(2)}% · P_success=${(pRoute*100).toFixed(3)}% · throughput=${throughput} ebits/s`));
  appendLog('rt-log', lines);

  setMetric('rt-m-route',  path.length-1+' hops', '');
  setMetric('rt-m-fid',    (F*100).toFixed(2)+'%', colourClass(F,.8,.6));
  setMetric('rt-m-prob',   (pRoute*100).toFixed(3)+'%', colourClass(pRoute,.01,.001));
  setMetric('rt-m-rate',   throughput+' eb/s', colourClass(+throughput,10,1));

  const lbl=$('rt-route-label');
  if(lbl) lbl.textContent='Route: '+path.map(i=>nodes[i].label).join(' → ')+' | Swaps at: '+path.slice(1,-1).map(i=>nodes[i].label).join(', ');
  drawRoutingCanvas(path, F);
  if (showMsg) addReport('routing-run', `${path.length-1} hops · F=${(F*100).toFixed(2)}% · ${throughput} eb/s`);
  if (typeof setStatus === 'function') setStatus('ready');
  if(showMsg && typeof showToast === 'function') showToast('Routing complete.');
  drawBurstChart([]);
}

function runBurst() {
  buildRoutingGraph();
  const {nodes,edges}=routingGraph;
  const src=0, dst=nodes.length-1;
  const path=dijkstra(nodes,edges,src,dst);
  if(path.length<2){if (typeof showToast === 'function') showToast('No route found.');return;}
  const fids=[];
  const memT=+($('rt-memory')?.value||50);
  const bsmP=+($('rt-bsm')?.value||50)/100;
  const purify=+($('rt-purify')?.value||1);
  const rng=seededRNG(12345);
  for(let attempt=0;attempt<200;attempt++){
    let F=1,ok=true;
    for(let k=0;k<path.length-1;k++){
      const e=edges.find(e=>(e.a===path[k]&&e.b===path[k+1])||(e.b===path[k]&&e.a===path[k+1]));
      if(!e||rng()>e.pLink){ok=false;break;}
      F=F*e.fLink*(0.93+rng()*.07)+(1-F)*(1-e.fLink)/3;
    }
    if(!ok){fids.push(0);continue;}
    for(let k=1;k<path.length-1;k++){
      if(rng()>bsmP){ok=false;break;}
      const decoF=Math.exp(-rng()*2/memT);
      F=F*decoF; F=F*F+(1-F)*(1-F)/3;
    }
    if(!ok){fids.push(0);continue;}
    for(let r=0;r<purify&&F<.99;r++) F=(F*F)/(F*F+(1-F)*(1-F));
    fids.push(ok?F:0);
  }
  drawBurstChart(fids); 
  if (typeof showToast === 'function') showToast('Burst of 200 attempts simulated.');
}

function drawRoutingCanvas(path, endF) {
  QNL.charts.save('rt-canvas', drawRoutingCanvas, [path, endF]);
  const cv=$('rt-canvas'); if(!cv) return;
  const dpr=window.devicePixelRatio||1;
  cv.width=(cv.offsetWidth||600)*dpr; cv.height=(cv.offsetHeight||300)*dpr;
  const ctx=cv.getContext('2d'); ctx.scale(dpr,dpr);
  const W=cv.offsetWidth||600, H=cv.offsetHeight||300;
  ctx.clearRect(0,0,W,H);
  const {nodes,edges}=routingGraph;
  if(!nodes.length) return;
  edges.forEach(e=>{
    const a=nodes[e.a],b=nodes[e.b];
    const onPath=path.length>1&&path.includes(e.a)&&path.includes(e.b)&&Math.abs(path.indexOf(e.a)-path.indexOf(e.b))===1;
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
    ctx.strokeStyle=onPath?'rgba(54,223,200,.75)':'rgba(255,255,255,.08)';
    ctx.lineWidth=onPath?2:0.8;
    if(onPath) ctx.setLineDash([8,4]); else ctx.setLineDash([]);
    ctx.stroke(); ctx.setLineDash([]);
    if(onPath){
      const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
      ctx.beginPath(); ctx.arc(mx,my,5,0,Math.PI*2); ctx.fillStyle='rgba(0,212,170,.85)'; ctx.fill();
      ctx.beginPath(); ctx.arc(mx,my,9,0,Math.PI*2); ctx.strokeStyle='rgba(0,212,170,.25)'; ctx.lineWidth=1; ctx.stroke();
    }
    ctx.fillStyle='rgba(255,255,255,.22)'; ctx.font='9px monospace'; ctx.textAlign='center';
    ctx.fillText(e.len.toFixed(1)+'km',(a.x+b.x)/2+8,(a.y+b.y)/2-6);
  });
  nodes.forEach(n=>{
    const onPath=path.includes(n.id);
    const r=n.type==='end'?18:13;
    ctx.beginPath(); ctx.arc(n.x,n.y,r,0,Math.PI*2);
    ctx.fillStyle=onPath?(n.type==='end'?'rgba(108,140,255,.22)':'rgba(54,223,200,.16)'):'rgba(255,255,255,.04)';
    ctx.strokeStyle=onPath?(n.type==='end'?'rgba(108,140,255,.9)':'rgba(54,223,200,.85)'):'rgba(255,255,255,.16)';
    ctx.lineWidth=onPath?2:.5; ctx.fill(); ctx.stroke();
    if(onPath){
      ctx.beginPath(); ctx.arc(n.x,n.y,r+6,0,Math.PI*2);
      ctx.strokeStyle=n.type==='end'?'rgba(108,140,255,.15)':'rgba(54,223,200,.12)';
      ctx.lineWidth=1; ctx.stroke();
    }
    ctx.fillStyle=onPath?'#fff':'rgba(255,255,255,.55)';
    ctx.font=(n.type==='end'?'bold ':'')+' 11px '+getComputedStyle(document.body).fontFamily;
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(n.label, n.x, n.y);
  });
  if(endF!==null&&path.length>1){
    ctx.fillStyle=endF>.8?'rgba(93,217,138,.85)':endF>.6?'rgba(255,190,68,.85)':'rgba(255,95,112,.85)';
    ctx.font='bold 12px monospace'; ctx.textAlign='left'; ctx.textBaseline='top';
    ctx.fillText('F = '+(endF*100).toFixed(2)+'%', 10, 10);
  }
}

function drawBurstChart(fids) {
  QNL.charts.save('rt-burst-chart', drawBurstChart, [fids]);
  const c=canvasSetup('rt-burst-chart'); if(!c) return;
  const {ctx,W,H}=c;
  const pad={l:44,r:16,t:20,b:38}; drawGrid(ctx,W,H,pad);
  if(!fids.length){
    ctx.fillStyle='rgba(255,255,255,.15)'; ctx.font='12px monospace'; ctx.textAlign='center';
    ctx.fillText('Press "Attempt burst" to simulate 200 routing attempts', W/2, H/2); return;
  }
  const success=fids.filter(f=>f>0);
  const bins=20; const vals=new Array(bins).fill(0);
  success.forEach(f=>{const b=Math.min(bins-1,Math.floor(f*bins)); vals[b]++;});
  const maxV=Math.max(...vals,1); const bw=(W-pad.l-pad.r)/bins;
  vals.forEach((v,i)=>{
    const fmid=(i+.5)/bins; const bh=(v/maxV)*(H-pad.t-pad.b);
    const col=fmid>.8?'rgba(93,217,138,.75)':fmid>.6?'rgba(255,190,68,.75)':'rgba(255,95,112,.7)';
    ctx.fillStyle=col; ctx.fillRect(pad.l+i*bw+1, H-pad.b-bh, bw-2, bh);
  });
  const failPct=(fids.length-success.length)/fids.length;
  ctx.fillStyle='rgba(255,95,112,.4)'; ctx.fillRect(pad.l-12, H-pad.b-(H-pad.t-pad.b)*failPct, 10, (H-pad.t-pad.b)*failPct);
  ctx.fillStyle='rgba(255,95,112,.6)'; ctx.font='9px monospace'; ctx.textAlign='center'; ctx.fillText('fail', pad.l-7, H-pad.b-4);
  ctx.fillStyle='rgba(255,255,255,.4)'; ctx.font='10px monospace'; ctx.textAlign='center';
  [0,.2,.4,.6,.8,1].forEach(f=>{ ctx.fillText((f*100).toFixed(0)+'%', pad.l+f*(W-pad.l-pad.r), H-pad.b+14); });
  ctx.fillText('End-to-end fidelity', W/2, H-4);
  const mean=success.length?success.reduce((a,b)=>a+b,0)/success.length:0;
  const mx=pad.l+mean*(W-pad.l-pad.r);
  ctx.strokeStyle='rgba(91,163,255,.7)'; ctx.lineWidth=1.5; ctx.setLineDash([5,3]);
  ctx.beginPath(); ctx.moveTo(mx,pad.t); ctx.lineTo(mx,H-pad.b); ctx.stroke(); ctx.setLineDash([]);
}

// ════════════════════════════════════════════════════════
//  COEXISTENCE SIMULATION
// ════════════════════════════════════════════════════════
function runCoexist(showMsg=true) {
  if (typeof setStatus === 'function') setStatus('coexistence…');
  const qwl     = +($('cx-qwl')?.value     || 1310);
  const length  = +($('cx-length')?.value  || 25);
  const power   = +($('cx-power')?.value   || 0);
  const wdm     = +($('cx-wdm')?.value     || 8);
  const filter  = +($('cx-filter')?.value  || 25);
  const iso     = +($('cx-isolation')?.value|| 105);
  const detEff  = +($('cx-detector')?.value|| 75)/100;

  const alphaQ  = qwl===1310?0.35: qwl===1550?0.20: 3.0;
  const alphaC  = 0.20;
  const pMw     = Math.pow(10,power/10);
  const totalMw = pMw*wdm;

  const TQ    = Math.pow(10,-alphaQ*length/10);
  const signal= TQ*detEff*1e6; 

  const raman_coeff = qwl===1310 ? 2e-8 : qwl===1550 ? 8e-7 : 5e-9;
  const filterFactor= Math.min(1, 25/filter);
  const TC    = Math.pow(10,-alphaC*length/10);
  const raman = totalMw * length * raman_coeff * filterFactor * TC * 1e9;
  const leakage = totalMw*1e6 * Math.pow(10,-iso/10);
  const darkCounts = 200 * detEff;

  const totalNoise = raman + leakage + darkCounts;
  const qber_optical = 0.01; 
  const qber_noise   = 0.5*totalNoise/(signal+totalNoise);
  const qber         = Math.min(.5, qber_optical + qber_noise);
  const rateSecret   = 0.5*signal*Math.max(0,1-2*h2(qber));

  setMetric('cx-m-signal', fmtHz(signal),      colourClass(signal,1e4,1e3));
  setMetric('cx-m-noise',  fmtHz(totalNoise),  totalNoise<signal/10?'good':totalNoise<signal?'warn-text':'bad');
  setMetric('cx-m-qber',   (qber*100).toFixed(2)+'%', qber<.05?'good':qber<.11?'warn-text':'bad');
  setMetric('cx-m-key',    fmtRate(rateSecret), colourClass(rateSecret,1000,10));

  const aEl=$('cx-assessment');
  if(aEl){
    let html='';
    if(qwl===1310) html='<strong style="color:var(--green)">✓ O-band (1310 nm)</strong> — Optimal for coexistence. ~240 nm separation from C-band classical traffic minimises Raman overlap.';
    else if(qwl===1550) html='<strong style="color:var(--amber)">⚠ C-band (1550 nm)</strong> — Same band as WDM traffic causes severe Raman contamination. Requires extreme isolation (>120 dB) or dedicated dark fiber.';
    else html='<strong style="color:var(--red)">✗ Visible (810 nm)</strong> — Not compatible with standard SMF-28 telecom fiber. Loss > 3 dB/km makes this impractical for metropolitan spans.';
    html+=`<br><br>Signal: <strong style="color:var(--text)">${fmtHz(signal)}</strong> · Raman: <strong style="color:${raman>signal*.1?'var(--amber)':'var(--green)'}">${fmtHz(raman)}</strong> · Leakage: ${fmtHz(leakage)} · Dark: ${fmtHz(darkCounts)}<br>`;
    html+=`QBER: <strong style="color:${qber>.11?'var(--red)':qber>.05?'var(--amber)':'var(--green)'}">${(qber*100).toFixed(2)}%</strong> → Secret key: <strong>${fmtRate(rateSecret)}</strong>`;
    if(rateSecret<1) html+='<br><strong style="color:var(--red)">Zero secret key rate</strong> — reduce classical power, increase isolation, or use O-band wavelength.';
    aEl.innerHTML=html;
  }

  drawSpectrum(qwl, wdm, raman, signal, length);
  if (showMsg) addReport('coexist-run', `${qwl}nm · ${length}km · ${wdm}×WDM · QBER=${(qber*100).toFixed(2)}% · key=${fmtRate(rateSecret)}`);
  if (typeof setStatus === 'function') setStatus('ready');
  if(showMsg && typeof showToast === 'function') showToast('Coexistence budget updated.');
}

function runPowerScan() {
  const qwl    = +($('cx-qwl')?.value    || 1310);
  const length = +($('cx-length')?.value || 25);
  const wdm    = +($('cx-wdm')?.value    || 8);
  const filter = +($('cx-filter')?.value || 25);
  const iso    = +($('cx-isolation')?.value|| 105);
  const detEff = +($('cx-detector')?.value|| 75)/100;
  const alphaQ = qwl===1310?0.35: qwl===1550?0.20: 3.0;
  const alphaC = 0.20;
  const TQ     = Math.pow(10,-alphaQ*length/10);
  const TC     = Math.pow(10,-alphaC*length/10);
  const signal = TQ*detEff*1e6;
  const raman_coeff=qwl===1310?2e-8: qwl===1550?8e-7: 5e-9;
  const filterF=Math.min(1,25/filter);
  const pts=50; const data=[];
  for(let k=0;k<pts;k++){
    const pwr=-20+k*(32/pts);
    const pMw=Math.pow(10,pwr/10)*wdm;
    const ram=pMw*length*raman_coeff*filterF*TC*1e9;
    const leak=pMw*1e6*Math.pow(10,-iso/10);
    const noise=ram+leak+200*detEff;
    const q=Math.min(.5,0.01+0.5*noise/(signal+noise));
    data.push({pwr, key:0.5*signal*Math.max(0,1-2*h2(q))});
  }
  drawPowerScan(data); 
  if (typeof showToast === 'function') showToast('Power scan complete.');
}

function drawSpectrum(qwl, wdm, raman, signal, len) {
  QNL.charts.save('cx-spectrum', drawSpectrum, [qwl, wdm, raman, signal, len]);
  const c=canvasSetup('cx-spectrum'); if(!c) return;
  const {ctx,W,H}=c;
  const pad={l:48,r:18,t:22,b:48}; drawGrid(ctx,W,H,pad);
  const wlMin=700, wlMax=1700;
  const wx=wl=>pad.l+(W-pad.l-pad.r)*(wl-wlMin)/(wlMax-wlMin);

  [{name:'O-band',s:1260,e:1360,col:'rgba(0,212,170,.06)'},
   {name:'C-band',s:1530,e:1565,col:'rgba(91,163,255,.08)'}].forEach(b=>{
    ctx.fillStyle=b.col; ctx.fillRect(wx(b.s),pad.t,wx(b.e)-wx(b.s),H-pad.t-pad.b);
    ctx.fillStyle='rgba(255,255,255,.3)'; ctx.font='9px monospace'; ctx.textAlign='center';
    ctx.fillText(b.name,(wx(b.s)+wx(b.e))/2,H-pad.b+22);
  });

  const ramNorm=Math.min(.65,raman/(signal||1));
  const ramGrad=ctx.createLinearGradient(pad.l,0,W-pad.r,0);
  ramGrad.addColorStop(0,'rgba(255,190,68,0)');
  ramGrad.addColorStop(.35,'rgba(255,190,68,'+ramNorm*.3+')');
  ramGrad.addColorStop(1,'rgba(255,190,68,0)');
  ctx.fillStyle=ramGrad; ctx.fillRect(pad.l, H-pad.b-ramNorm*(H-pad.t-pad.b)*.6, W-pad.l-pad.r, ramNorm*(H-pad.t-pad.b)*.6);

  for(let i=0;i<Math.min(wdm,48);i++){
    const wl=1530+i*(35/Math.max(wdm,1));
    const x=wx(wl), peakH=(H-pad.t-pad.b)*0.75;
    ctx.fillStyle='rgba(91,163,255,.75)'; ctx.fillRect(x-2,H-pad.b-peakH,4,peakH);
  }

  const qx=wx(qwl), qH=(H-pad.t-pad.b)*0.82;
  const qCol=qwl===1310?'rgba(54,223,200,.9)':qwl===1550?'rgba(255,95,112,.9)':'rgba(255,190,68,.9)';
  ctx.fillStyle=qCol; ctx.fillRect(qx-3,H-pad.b-qH,6,qH);
  ctx.fillStyle=qCol; ctx.font='bold 10px monospace'; ctx.textAlign='center'; ctx.fillText(qwl+'nm', qx, H-pad.b-qH-8);

  ctx.fillStyle='rgba(255,255,255,.4)'; ctx.font='10px monospace'; ctx.textAlign='center';
  [800,1000,1200,1310,1400,1550,1600].forEach(wl=>{ ctx.fillText(wl, wx(wl), H-pad.b+13); });
  ctx.fillText('Wavelength (nm)', W/2, H-4);

  const leg=[{col:'rgba(91,163,255,.8)',lbl:'Classical WDM'},{col:qCol,lbl:'Quantum ch.'},{col:'rgba(255,190,68,.5)',lbl:'Raman floor'}];
  leg.forEach((l,i)=>{
    ctx.fillStyle=l.col; ctx.fillRect(W-145,pad.t+4+i*18,13,10);
    ctx.fillStyle='rgba(255,255,255,.5)'; ctx.textAlign='left'; ctx.font='10px monospace'; ctx.fillText(l.lbl, W-129, pad.t+13+i*18);
  });
}

function drawPowerScan(data) {
  QNL.charts.save('cx-scan-chart', drawPowerScan, [data]);
  const c=canvasSetup('cx-scan-chart'); if(!c) return;
  const {ctx,W,H}=c;
  const pad={l:60,r:18,t:20,b:40}; drawGrid(ctx,W,H,pad);
  if(!data.length){
    ctx.fillStyle='rgba(255,255,255,.15)'; ctx.font='12px monospace'; ctx.textAlign='center';
    ctx.fillText('Press "Scan power" to plot secret key rate vs classical launch power', W/2, H/2); return;
  }
  const maxR=Math.max(...data.map(d=>d.key),1);
  const minP=data[0].pwr, maxP=data[data.length-1].pwr;
  const toX=p=>pad.l+(p-minP)/(maxP-minP)*(W-pad.l-pad.r);
  const toY=r=>(H-pad.b)-(H-pad.t-pad.b)*(r/maxR);

  ctx.beginPath();
  data.forEach((d,i)=>{const x=toX(d.pwr),y=toY(d.key);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
  ctx.lineTo(toX(maxP),H-pad.b); ctx.lineTo(pad.l,H-pad.b); ctx.closePath();
  ctx.fillStyle='rgba(54,223,200,.06)'; ctx.fill();

  const gr=ctx.createLinearGradient(pad.l,0,W-pad.r,0);
  gr.addColorStop(0,'rgba(93,217,138,.9)'); gr.addColorStop(.7,'rgba(255,190,68,.8)'); gr.addColorStop(1,'rgba(255,95,112,.7)');
  ctx.beginPath(); ctx.strokeStyle=gr; ctx.lineWidth=2.2;
  data.forEach((d,i)=>{const x=toX(d.pwr),y=toY(d.key);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
  ctx.stroke();

  ctx.fillStyle='rgba(255,255,255,.4)'; ctx.font='10px monospace'; ctx.textAlign='center';
  [-20,-10,0,10].forEach(p=>{ if(p<minP||p>maxP) return; ctx.fillText(p+'dBm', toX(p), H-pad.b+14); });
  ctx.fillText('Classical power/channel', W/2, H-4);
  ctx.save(); ctx.translate(14,H/2); ctx.rotate(-Math.PI/2); ctx.textAlign='center'; ctx.fillText('Key rate (bps)',0,0); ctx.restore();
}

// ── INIT & EVENT BINDINGS ──
window.addEventListener('load', () => {
  $('bb84-run')?.addEventListener('click', () => runBB84(true));
  $('bb84-mc')?.addEventListener('click',  () => runBB84MonteCarlo());

  $('ent-run')?.addEventListener('click',  () => runEntanglement(true));
  $('ent-scan')?.addEventListener('click', () => runEntanglementScan());

  $('rt-run')?.addEventListener('click',      () => runRouting(true));
  $('rt-attempts')?.addEventListener('click', () => runBurst());
  ['rt-topology','rt-nodes','rt-length','rt-fidelity','rt-bsm'].forEach(id => {
    const element = $(id);
    element?.addEventListener(element.tagName === 'SELECT' ? 'change' : 'input', buildRoutingGraph);
  });

  $('cx-run')?.addEventListener('click',  () => runCoexist(true));
  $('cx-scan')?.addEventListener('click', () => runPowerScan());
  ['cx-qwl','cx-length','cx-power','cx-wdm','cx-filter','cx-isolation','cx-detector'].forEach(id=>{
    const el=$(id); if(el) el.addEventListener('input', ()=>runCoexist(false));
    if(el&&el.tagName==='SELECT') el.addEventListener('change', ()=>runCoexist(false));
  });

  $('btn-export-json')?.addEventListener('click', () => {
    const data = {
      exported: new Date().toISOString(),
      session_reports: reports,
      labs: {
        bb84: {
          pulses:   $('bb84-pulses')?.value, distance: $('bb84-distance')?.value, detector: $('bb84-detector')?.value,
          error:    $('bb84-error')?.value, dark:     $('bb84-dark')?.value, eve:      $('bb84-eve')?.value,
          sample:   $('bb84-sample')?.value, seed:     $('bb84-seed')?.value, qber:     $('bb84-m-qber')?.textContent,
          finalKey: $('bb84-m-final')?.textContent
        },
        entanglement: {
          rate:   $('ent-rate')?.value, span:   $('ent-span')?.value, vis:    $('ent-vis')?.value, phase:  $('ent-phase')?.value,
          dark:   $('ent-dark')?.value, window: $('ent-window')?.value, band:   $('ent-band')?.value, CHSH_S: $('ent-m-s')?.textContent,
          keyRate:$('ent-m-key')?.textContent
        },
        routing: {
          topology: $('rt-topology')?.value, nodes:    $('rt-nodes')?.value, length:   $('rt-length')?.value, fidelity: $('rt-fidelity')?.value,
          memory:   $('rt-memory')?.value, bsm:      $('rt-bsm')?.value, purify:   $('rt-purify')?.value, endFid:   $('rt-m-fid')?.textContent,
          throughput: $('rt-m-rate')?.textContent
        },
        coexistence: {
          qwl:      $('cx-qwl')?.value, length:   $('cx-length')?.value, power:    $('cx-power')?.value, wdm:      $('cx-wdm')?.value,
          filter:   $('cx-filter')?.value, isolation:$('cx-isolation')?.value, detector: $('cx-detector')?.value, qber:     $('cx-m-qber')?.textContent,
          keyRate:  $('cx-m-key')?.textContent
        }
      }
    };
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qnl-session-' + Date.now() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (typeof showToast === 'function') showToast('Session exported as JSON.');
  });

  // Startup sequence
  if (typeof renderReports === 'function') renderReports(); 
  buildRoutingGraph();
  setTimeout(() => {
    runBB84(false); runEntanglement(false); runCoexist(false);
    drawBB84Histogram([]); drawScanChart([]); drawBurstChart([]); drawPowerScan([]);
  }, 200);
});

// Register protocols
QNL.physics.register('bb84',     (s) => runBB84(s));
QNL.physics.register('entangle', (s) => runEntanglement(s));
QNL.physics.register('routing',  (s) => runRouting(s));
QNL.physics.register('coexist',  (s) => runCoexist(s));

// Debounced resize handler
(function() {
  let _resizeTimer;
  function onResize() {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      buildRoutingGraph(); 
      QNL.charts.redrawAll(); 
      runCoexist(false);
    }, 180); 
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => { setTimeout(onResize, 300); });
})();
