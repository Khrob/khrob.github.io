// ═══════════════════════════════════════════════════════════════════════════
// DNN Presenter — SVG character with mouth sync and eye blink
// Reusable across segments. Inject into any container.
// ═══════════════════════════════════════════════════════════════════════════

const PRESENTER_SVG = `
<svg id="presenter-svg" viewBox="0 0 300 450" xmlns="http://www.w3.org/2000/svg">

  <!-- DESK -->
  <rect x="-20" y="375" width="340" height="80" fill="#0a1220"/>
  <rect x="-20" y="368" width="340" height="10" rx="1" fill="#121e30"/>
  <rect x="-20" y="368" width="340" height="2" fill="#1e3050" opacity="0.6"/>
  <rect x="0" y="370" width="280" height="1" fill="rgba(255,255,255,0.04)"/>

  <!-- SHOULDERS / JACKET -->
  <path d="M 30 300 L 10 450 L 290 450 L 270 300 Q 218 290 188 310 L 150 348 L 112 310 Q 82 290 30 300" fill="#14233a"/>
  <path d="M 30 300 Q 82 290 112 310 L 112 316 Q 82 296 34 306 Z" fill="#1a2e48" opacity="0.6"/>
  <path d="M 270 300 Q 218 290 188 310 L 188 316 Q 218 296 266 306 Z" fill="#1a2e48" opacity="0.6"/>

  <!-- Lapels -->
  <path d="M 112 310 L 96 336 L 150 348 L 128 307 Z" fill="#1c304a"/>
  <path d="M 188 310 L 204 336 L 150 348 L 172 307 Z" fill="#1c304a"/>

  <!-- Shirt -->
  <polygon points="128,307 150,348 172,307 163,302 150,305 137,302" fill="#eee8dc"/>

  <!-- Tie -->
  <polygon points="145,303 155,303 158,346 150,353 142,346" fill="#c0392b"/>
  <polygon points="143,301 157,301 153,308 147,308" fill="#a02820"/>

  <!-- Shoulder masses -->
  <ellipse cx="60" cy="305" rx="45" ry="22" fill="#14233a"/>
  <ellipse cx="240" cy="305" rx="45" ry="22" fill="#14233a"/>

  <!-- NECK -->
  <rect x="130" y="258" width="40" height="38" rx="5" fill="#cdb898"/>

  <!-- EARS -->
  <ellipse cx="74" cy="185" rx="12" ry="17" fill="#cdb898"/>
  <ellipse cx="226" cy="185" rx="12" ry="17" fill="#cdb898"/>
  <ellipse cx="74" cy="185" rx="8" ry="11" fill="#b89870" opacity="0.55"/>
  <ellipse cx="226" cy="185" rx="8" ry="11" fill="#b89870" opacity="0.55"/>

  <!-- HEAD -->
  <ellipse cx="150" cy="178" rx="76" ry="86" fill="#d8c0a0"/>

  <!-- HAIR -->
  <ellipse cx="150" cy="108" rx="76" ry="46" fill="#16182e"/>
  <rect x="74" y="108" width="152" height="50" fill="#16182e"/>
  <ellipse cx="74" cy="148" rx="16" ry="34" fill="#16182e"/>
  <ellipse cx="226" cy="148" rx="16" ry="34" fill="#16182e"/>
  <path d="M 100 88 Q 150 78 200 88" stroke="rgba(255,255,255,0.06)" stroke-width="8" fill="none" stroke-linecap="round"/>

  <!-- EYEBROWS -->
  <path d="M 104 158 Q 118 150 133 154" stroke="#16182e" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <path d="M 167 154 Q 182 150 196 158" stroke="#16182e" stroke-width="3.5" fill="none" stroke-linecap="round"/>

  <!-- LEFT EYE -->
  <g id="eye-l">
    <ellipse cx="118" cy="175" rx="13" ry="14" fill="#16182e"/>
    <ellipse cx="118" cy="175" rx="9" ry="10" fill="#2a4070"/>
    <ellipse cx="118" cy="175" rx="6" ry="7" fill="#0a0a18"/>
    <circle cx="122" cy="171" r="4" fill="white"/>
    <circle cx="120" cy="170" r="1.8" fill="white" opacity="0.6"/>
  </g>

  <!-- RIGHT EYE -->
  <g id="eye-r">
    <ellipse cx="182" cy="175" rx="13" ry="14" fill="#16182e"/>
    <ellipse cx="182" cy="175" rx="9" ry="10" fill="#2a4070"/>
    <ellipse cx="182" cy="175" rx="6" ry="7" fill="#0a0a18"/>
    <circle cx="186" cy="171" r="4" fill="white"/>
    <circle cx="184" cy="170" r="1.8" fill="white" opacity="0.6"/>
  </g>

  <!-- NOSE -->
  <path d="M 147 196 Q 143 210 146 215 Q 150 218 154 215 Q 157 210 153 196"
        fill="none" stroke="#a88060" stroke-width="1.5" stroke-linecap="round" opacity="0.65"/>

  <!-- MOUTH CLOSED (neutral, not smiling) -->
  <path id="mouth-c" d="M 134 235 L 166 235"
        stroke="#9a6845" stroke-width="2.2" fill="none" stroke-linecap="round"/>

  <!-- MOUTH OPEN (hidden) -->
  <g id="mouth-o" display="none">
    <ellipse cx="150" cy="235" rx="16" ry="11" fill="#1a0808"/>
    <rect x="137" y="229" width="26" height="5" rx="2.5" fill="#ede0d0"/>
  </g>

</svg>`;


class Presenter {
  constructor() {
    this._mouthInterval = null;
    this._blinkTimeout = null;
    this._mounted = false;
  }

  /**
   * Mount the presenter SVG into a container element.
   */
  mount(container) {
    container.innerHTML = PRESENTER_SVG;
    this._mounted = true;
    this.startBlinking();
  }

  /**
   * Remove presenter from DOM.
   */
  unmount() {
    this.stopBlinking();
    this.stopMouth();
    this._mounted = false;
  }

  // ─── Mouth ─────────────────────────────────────────────────────────────

  setMouth(open) {
    const mc = document.getElementById('mouth-c');
    const mo = document.getElementById('mouth-o');
    if (!mc || !mo) return;
    mc.setAttribute('display', open ? 'none' : '');
    mo.setAttribute('display', open ? '' : 'none');
  }

  startMouth() {
    this.stopMouth();
    let isOpen = false;
    this._mouthInterval = setInterval(() => {
      isOpen = !isOpen;
      this.setMouth(isOpen);
    }, 170 + Math.random() * 120);
  }

  stopMouth() {
    if (this._mouthInterval) {
      clearInterval(this._mouthInterval);
      this._mouthInterval = null;
    }
    this.setMouth(false);
  }

  // ─── Blink ─────────────────────────────────────────────────────────────

  startBlinking() {
    const doBlink = () => {
      const eyeL = document.getElementById('eye-l');
      const eyeR = document.getElementById('eye-r');
      if (eyeL && eyeR) {
        eyeL.style.transform = 'scaleY(0.06)';
        eyeR.style.transform = 'scaleY(0.06)';
        setTimeout(() => {
          eyeL.style.transform = 'scaleY(1)';
          eyeR.style.transform = 'scaleY(1)';
        }, 110);
      }
      this._blinkTimeout = setTimeout(doBlink, 2800 + Math.random() * 3500);
    };
    this._blinkTimeout = setTimeout(doBlink, 1800);
  }

  stopBlinking() {
    if (this._blinkTimeout) {
      clearTimeout(this._blinkTimeout);
      this._blinkTimeout = null;
    }
  }
}

// Singleton
export const presenter = new Presenter();
