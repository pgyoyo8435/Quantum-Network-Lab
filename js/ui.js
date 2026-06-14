"use strict";

// ── CUSTOM CURSOR LOGIC ──
const dot = document.getElementById('cursor-dot');
const ring = document.getElementById('cursor-ring');
let mouseX = window.innerWidth / 2, mouseY = window.innerHeight / 2;
let ringX = mouseX, ringY = mouseY;

window.addEventListener('mousemove', (e) => {
  mouseX = e.clientX; mouseY = e.clientY;
  if(dot) dot.style.transform = `translate(calc(-50% + ${mouseX}px), calc(-50% + ${mouseY}px))`;
});

function animateRing() {
  ringX += (mouseX - ringX) * 0.15;
  ringY += (mouseY - ringY) * 0.15;
  if(ring) ring.style.transform = `translate(calc(-50% + ${ringX}px), calc(-50% + ${ringY}px))`;
  requestAnimationFrame(animateRing);
}
animateRing();

function attachHoverStates() {
  document.querySelectorAll('button, a, input, select, .concept-cell, summary').forEach(el => {
    if (!el.dataset.hoverAttached) {
      el.addEventListener('mouseenter', () => document.body.classList.add('hovering'));
      el.addEventListener('mouseleave', () => document.body.classList.remove('hovering'));
      el.dataset.hoverAttached = "true";
    }
  });
}
attachHoverStates();

// ── MAGNETIC BUTTONS ──
document.querySelectorAll('.magnetic').forEach(btn => {
  btn.addEventListener('mousemove', (e) => {
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = `translate(0px, 0px)`;
  });
});

// ── SCROLL REVEAL OBSERVER ──
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('active');
      observer.unobserve(entry.target); 
    }
  });
}, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ── REACTIVE HERO CANVAS ──
(function() {
  const cv = document.getElementById('hero-canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  let W, H, nodes, edges, animFrame;

  function resize() {
    W = cv.width = cv.offsetWidth; H = cv.height = cv.offsetHeight;
    init();
  }

  function init() {
    const N = Math.min(60, Math.floor(W * H / 15000));
    nodes = Array.from({length: N}, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - .5) * .4, vy: (Math.random() - .5) * .4,
      r: 1.5 + Math.random() * 2.5, pulse: Math.random() * Math.PI * 2,
      hue: Math.random() < .5 ? 'cyan' : (Math.random() < .5 ? 'blue' : 'violet')
    }));
  }

  const COLORS = { cyan: 'rgba(54,223,200,', blue: 'rgba(91,163,255,', violet: 'rgba(168,134,255,' };

  function frame() {
    ctx.clearRect(0, 0, W, H);
    edges = [];

    nodes.forEach((n, i) => {
      const dxMouse = n.x - mouseX;
      const dyMouse = n.y - mouseY;
      const distMouse = Math.sqrt(dxMouse*dxMouse + dyMouse*dyMouse);
      if (distMouse < 200) {
        n.x += (dxMouse / distMouse) * 1.5;
        n.y += (dyMouse / distMouse) * 1.5;
      }

      n.x += n.vx; n.y += n.vy;
      if (n.x < -20) n.x = W + 20; if (n.x > W+20) n.x = -20;
      if (n.y < -20) n.y = H + 20; if (n.y > H+20) n.y = -20;
      n.pulse += .02;

      for (let j = i+1; j < nodes.length; j++) {
        const dx = nodes[j].x - n.x, dy = nodes[j].y - n.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 150) edges.push({a: n, b: nodes[j], d: dist});
      }
    });

    edges.forEach(e => {
      const alpha = (1 - e.d/150) * .25;
      ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y);
      ctx.strokeStyle = COLORS[e.a.hue] + alpha + ')'; ctx.lineWidth = 1; ctx.stroke();
    });

    nodes.forEach(n => {
      const glow = .5 + .5 * Math.sin(n.pulse);
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r * (1 + .4*glow), 0, Math.PI*2);
      ctx.fillStyle = COLORS[n.hue] + (0.6 + 0.4*glow) + ')';
      ctx.shadowBlur = 10; ctx.shadowColor = COLORS[n.hue] + '1)';
      ctx.fill(); ctx.shadowBlur = 0;
    });

    const orbA = document.getElementById('orb-a');
    const orbB = document.getElementById('orb-b');
    if(orbA) orbA.style.transform = `translate(${mouseX * -0.02}px, ${mouseY * -0.02}px)`;
    if(orbB) orbB.style.transform = `translate(${mouseX * 0.03}px, ${mouseY * 0.03}px)`;

    animFrame = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize(); frame();
})();

// ── NAVIGATION & UI LOGIC ──
function switchView(id) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.querySelectorAll('.reveal').forEach(r => { r.classList.remove('active'); observer.observe(r); });
  });
  document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + id)?.classList.add('active');
  document.querySelector(`[data-view="${id}"]`)?.classList.add('active');
  window.scrollTo({top: document.getElementById('lab-app').offsetTop - 10, behavior: 'smooth'});
}

function enterLab(view) {
  document.getElementById('lab-app').scrollIntoView({behavior: 'smooth'});
  if (view && view !== 'manual') {
    setTimeout(() => switchView(view), 400);
  } else if (view === 'manual') {
    setTimeout(() => switchView('manual'), 400);
  }
}

document.querySelectorAll('[data-enter]').forEach(element => {
  element.addEventListener('click', () => enterLab(element.dataset.enter));
});

document.querySelectorAll('.nav-button[data-view]').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

function showToast(msg, dur=3000) {
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), dur);
}

const statusEl = document.getElementById('run-status');
function setStatus(s) { if(statusEl) statusEl.textContent = s; }

function filterGlossary(q) {
  const lq = q.toLowerCase().trim();
  document.querySelectorAll('.gcard').forEach(card => {
    const terms = (card.dataset.terms || '') + ' ' + card.textContent;
    card.classList.toggle('hidden', lq.length > 1 && !terms.toLowerCase().includes(lq));
  });
}

document.getElementById('glossary-input')?.addEventListener('input', event => {
  filterGlossary(event.currentTarget.value);
});

const completedLabs = new Set();
function markDone(labId) {
  if (completedLabs.has(labId)) return;
  completedLabs.add(labId);
  const el = document.getElementById('done-' + labId);
  if (el) el.style.display = 'inline';
}

function resetCompletion() {
  completedLabs.clear();
  document.querySelectorAll('.nav-done').forEach(element => {
    element.style.display = 'none';
  });
}

document.getElementById('manual-open-all')?.addEventListener('click', () => {
  document.querySelectorAll('#view-manual details.accordion').forEach(d => d.open=true);
});
document.getElementById('notes-open-all')?.addEventListener('click', () => {
  document.querySelectorAll('#view-notes details.accordion').forEach(d => d.open=true);
});
