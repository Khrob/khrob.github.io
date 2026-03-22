// ═══════════════════════════════════════════════════════════════════════════
// DNN Core — Data News Network show runner
// v0.8.0 — Fixed transport, brighter map, compact cards, female voice.
// ═══════════════════════════════════════════════════════════════════════════

import { tts } from './tts-engine.js';
import { presenter } from './presenter.js';
import { LeadWeather } from './segments/lead-weather.js';

const DNN_VERSION = '0.8.0';

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const SEGMENTS = [LeadWeather];

function getEditionString() {
  const now = new Date();
  const opts = { day: 'numeric', month: 'short', year: 'numeric' };
  return `Week of ${now.toLocaleDateString('en-GB', opts)} · Issue 001`;
}

// ─── Studio map ──────────────────────────────────────────────────────────
let studioMap = null;
let countriesGeoJSON = null;
let highlightLayer = null;

function initStudioMap() {
  const el = document.getElementById('studio-map');
  if (!el || studioMap) return;
  studioMap = L.map(el, {
    center: [20, 15], zoom: 3,
    zoomControl: false, attributionControl: false,
    dragging: false, scrollWheelZoom: false,
    doubleClickZoom: false, touchZoom: false, keyboard: false
  });
  L.tileLayer(TILE_URL, { subdomains: 'abcd' }).addTo(studioMap);
  console.log('[DNN] Studio map initialised');
}

async function loadCountryBoundaries() {
  try {
    const resp = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
    const topo = await resp.json();
    countriesGeoJSON = topojson.feature(topo, topo.objects.countries);
    console.log(`[DNN] Loaded ${countriesGeoJSON.features.length} country boundaries`);
  } catch (err) {
    console.warn('[DNN] Could not load country boundaries:', err);
  }
}

const NAME_TO_ID = {
  'Palestine': '275', 'Israel': '376', 'Sudan': '729',
  'Ukraine': '804', 'Myanmar': '104', 'Congo': '180',
  'Mexico': '484', 'Somalia': '706', 'Ethiopia': '231',
  'Mali': '466', 'Burkina Faso': '854', 'Yemen': '887',
  'Nigeria': '566', 'Iraq': '368', 'Syria': '760',
  'Haiti': '332', 'Colombia': '170', 'Mozambique': '508',
  'Pakistan': '586', 'Cameroon': '120', 'Lebanon': '422',
  'Libya': '434'
};

function doHighlight(names) {
  if (!studioMap || !countriesGeoJSON) {
    console.log('[DNN] Highlight skipped — map or data not ready');
    return;
  }
  if (highlightLayer) { studioMap.removeLayer(highlightLayer); highlightLayer = null; }
  if (!names || names.length === 0) return;

  const targetIds = new Set();
  for (const name of names) {
    const id = NAME_TO_ID[name];
    if (id) targetIds.add(id);
    else console.warn(`[DNN] No ID for country: ${name}`);
  }

  const matching = {
    type: 'FeatureCollection',
    features: countriesGeoJSON.features.filter(f => targetIds.has(String(f.id)))
  };

  console.log(`[DNN] Highlighting ${matching.features.length} countries for: ${names.join(', ')}`);
  if (matching.features.length === 0) return;

  highlightLayer = L.geoJSON(matching, {
    className: 'country-highlight',
    style: { fillColor: '#e04030', fillOpacity: 0.45, color: '#f05040', weight: 2, opacity: 0.9 }
  }).addTo(studioMap);
}

// ─── UI helpers ──────────────────────────────────────────────────────────

const ui = {
  showLowerThird(label, text) {
    document.getElementById('lt-label').textContent = label;
    document.getElementById('lt-text').textContent = text;
    document.getElementById('lower-third').classList.add('up');
  },
  updateChyron(label, text) {
    const lt = document.getElementById('lower-third');
    lt.classList.remove('up');
    setTimeout(() => {
      document.getElementById('lt-label').textContent = label;
      document.getElementById('lt-text').textContent = text;
      lt.classList.add('up');
    }, 350);
  },
  addStatCard(region, name, num, label, color) {
    const col = document.getElementById('info-col');
    for (const existing of col.querySelectorAll('.stat-card')) {
      existing.classList.add('compact');
    }
    while (col.children.length >= 5) col.removeChild(col.firstChild);
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `
      <div class="sc-region">${region}</div>
      <div class="sc-name">${name}</div>
      <div class="sc-num" style="color:${color}">${num.toLocaleString()}</div>
      <div class="sc-lbl">${label}</div>
    `;
    col.appendChild(card);
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('show')));
  },
  clearCards() {
    document.getElementById('info-col').innerHTML = '';
  },
  flyTo(lat, lng, zoom = 5) {
    if (studioMap) studioMap.flyTo([lat, lng], zoom, { duration: 2.5 });
  },
  flyWide() {
    if (studioMap) studioMap.flyTo([20, 15], 3, { duration: 2.5 });
  },
  highlightCountries(names) { doHighlight(names); },
  clearHighlight() { doHighlight(null); }
};

// ─── State ───────────────────────────────────────────────────────────────
let currentSegmentIdx = 0;
let scriptIdx = 0;
let currentScript = [];
let paused = false;
let pauseResolve = null;

// Cancellation: each _speakNext chain gets a generation ID.
// If a transport action bumps the generation, the old chain stops.
let speakGeneration = 0;
let pendingTimeout = null;

// ─── DNN Public API ──────────────────────────────────────────────────────

export const DNN = {

  async init() {
    console.log(`[DNN] v${DNN_VERSION} initialising…`);
    document.getElementById('edition-tag').textContent = getEditionString();
    loadCountryBoundaries();

    await tts.init((progress) => {
      const fill = document.getElementById('loading-fill');
      const label = document.getElementById('loading-label');
      if (fill) fill.style.width = progress.percent + '%';
      if (label) label.textContent = progress.label;
    });

    const btn = document.getElementById('btn-begin');
    const status = document.getElementById('intro-status');
    if (btn) btn.style.display = '';
    if (status) status.style.display = 'none';
    console.log(`[DNN] v${DNN_VERSION} ready`);
  },

  start() {
    console.log('[DNN] Starting broadcast');

    // CRITICAL: "unlock" speech synthesis on mobile by speaking a silent
    // utterance directly inside the user tap handler. Mobile browsers
    // block speechSynthesis.speak() if not called from a user gesture.
    const unlock = new SpeechSynthesisUtterance('');
    unlock.volume = 0;
    window.speechSynthesis.speak(unlock);

    document.getElementById('dnn-intro').classList.remove('active');
    document.getElementById('broadcast-phase').classList.add('active');
    initStudioMap();
    presenter.mount(document.getElementById('presenter-col'));
    this._loadSegment(0);
  },

  // ─── Transport ─────────────────────────────────────────────────────────

  _cancelChain(reason) {
    speakGeneration++;
    console.log(`[DNN] Cancel chain (gen=${speakGeneration}): ${reason}`);
    tts.stop();
    presenter.stopMouth();
    if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null; }
    paused = false;
    document.getElementById('btn-play').textContent = '⏸';
    if (pauseResolve) { pauseResolve(); pauseResolve = null; }
  },

  togglePause() {
    paused = !paused;
    const btn = document.getElementById('btn-play');
    console.log(`[DNN] ${paused ? 'Paused' : 'Resumed'} at line ${scriptIdx}`);
    if (paused) {
      btn.textContent = '▶';
      btn.setAttribute('aria-label', 'Play');
      tts.stop();
      presenter.stopMouth();
    } else {
      btn.textContent = '⏸';
      btn.setAttribute('aria-label', 'Pause');
      if (pauseResolve) { pauseResolve(); pauseResolve = null; }
    }
  },

  back() {
    const target = Math.max(0, scriptIdx - 2);
    console.log(`[DNN] Back: scriptIdx ${scriptIdx} → ${target}`);
    this._cancelChain('back');
    scriptIdx = target;
    this._speakNext();
  },

  forward() {
    console.log(`[DNN] Forward: scriptIdx ${scriptIdx} → ${scriptIdx} (skip current)`);
    this._cancelChain('forward');
    this._speakNext();
  },

  // ─── Segment loading ──────────────────────────────────────────────────

  _loadSegment(idx) {
    if (idx >= SEGMENTS.length) {
      this._transitionToExplore();
      return;
    }
    const seg = SEGMENTS[idx];
    currentSegmentIdx = idx;
    scriptIdx = 0;
    console.log(`[DNN] Loading segment: ${seg.name}`);
    document.getElementById('segment-badge').textContent = seg.name;
    if (seg.voice) tts.setVoice(seg.voice);
    this._buildTicker(seg);
    currentScript = seg.getScript(ui);
    // Shorter delay — speech is already unlocked from the tap
    pendingTimeout = setTimeout(() => this._speakNext(), 600);
  },

  async _speakNext() {
    const myGen = speakGeneration;

    if (scriptIdx >= currentScript.length) {
      console.log('[DNN] Script complete');
      presenter.stopMouth();
      ui.clearHighlight();
      const nextIdx = currentSegmentIdx + 1;
      if (nextIdx < SEGMENTS.length) {
        pendingTimeout = setTimeout(() => this._loadSegment(nextIdx), 2000);
      } else {
        pendingTimeout = setTimeout(() => this._transitionToExplore(), 1800);
      }
      return;
    }

    // If paused, wait for resume
    if (paused) {
      console.log(`[DNN] Paused, waiting… (gen=${myGen})`);
      await new Promise(resolve => { pauseResolve = resolve; });
      if (myGen !== speakGeneration) {
        console.log(`[DNN] Stale chain (gen=${myGen}, current=${speakGeneration}), aborting`);
        return;
      }
    }

    // Check if this chain is still valid
    if (myGen !== speakGeneration) {
      console.log(`[DNN] Stale chain (gen=${myGen}, current=${speakGeneration}), aborting`);
      return;
    }

    const idx = scriptIdx++;
    const line = currentScript[idx];
    console.log(`[DNN] Playing line ${idx}/${currentScript.length - 1}: "${line.text.slice(0, 50)}…" (gen=${myGen})`);

    if (line.onStart) line.onStart();

    await tts.speak(line.text, {
      onStart: () => presenter.startMouth(),
      onEnd: () => presenter.stopMouth(),
      onError: () => presenter.stopMouth()
    });

    // Check again after speech finishes
    if (myGen !== speakGeneration) {
      console.log(`[DNN] Chain cancelled during speech (gen=${myGen}), aborting`);
      return;
    }

    pendingTimeout = setTimeout(() => this._speakNext(), 500);
  },

  _buildTicker(segment) {
    const items = segment.getTickerItems();
    const html = items.map(t => `<span class="ticker-item">${t}</span>`).join('');
    document.getElementById('ticker-track').innerHTML = html + html;
  },

  _transitionToExplore() {
    console.log('[DNN] Transitioning to explore phase');
    presenter.stopBlinking();
    presenter.stopMouth();
    ui.clearHighlight();

    const bp = document.getElementById('broadcast-phase');
    bp.style.opacity = '0';

    setTimeout(() => {
      bp.classList.remove('active');
      document.getElementById('explore-phase').classList.add('active');
      const seg = SEGMENTS[currentSegmentIdx];
      const container = document.getElementById('explore-container');
      container.innerHTML = seg.buildExploreHTML();

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const mapEl = document.getElementById('map');
          if (mapEl) {
            const topbar = container.querySelector('.map-topbar');
            const footer = container.querySelector('.map-footer');
            const used = (topbar?.offsetHeight || 0) + (footer?.offsetHeight || 0);
            mapEl.style.height = `calc(100vh - ${used}px)`;
          }
          if (seg.initMap) seg.initMap();
        });
      });
    }, 900);
  }
};
