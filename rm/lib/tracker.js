/**
 * MindAR image tracking wrapper.
 * Manages the MindARThree lifecycle: init, start, stop, target switching.
 *
 * MindAR is loaded dynamically on first use (not at module import time)
 * to prevent side-effect failures from killing the entire module tree.
 */
import * as THREE from 'three';
import { EventEmitter } from './event-emitter.js';

// Lazy-loaded MindAR constructor
let MindARThree = null;

async function ensureMindAR() {
  if (MindARThree) return;

  // MindAR bundles its own TF.js which tries to re-register every kernel
  // against the standalone TF.js we already loaded for pose detection.
  // The ~300 "already registered" warnings are harmless but noisy — mute them.
  const origWarn = console.warn;
  console.warn = (...args) => {
    if (typeof args[0] === 'string' && (
      args[0].includes('is already registered') ||
      args[0].includes('already been set') ||
      args[0].includes('was already registered')
    )) return;
    origWarn.apply(console, args);
  };

  try {
    const mod = await import('mindar-image-three');
    MindARThree = mod.MindARThree;
  } finally {
    // Always restore, even if the import throws
    console.warn = origWarn;
  }

  if (!MindARThree) throw new Error('MindARThree not found in mindar-image-three module');
}

export class MindARTracker extends EventEmitter {
  /**
   * @param {HTMLElement} container   – DOM element for AR canvas
   * @param {object}      opts
   * @param {number}      opts.overlayScale    – scale multiplier (e.g. 1.55)
   * @param {number}      opts.refImageAspect  – reference image width/height
   * @param {number}      opts.filterMinCF     – MindAR filter (default 0.001)
   * @param {number}      opts.filterBeta      – MindAR filter (default 1000)
   * @param {number}      opts.missTolerance   – frames before "lost" (default 5)
   * @param {number}      opts.warmupTolerance – frames before "found" (default 5)
   */
  constructor(container, opts = {}) {
    super();
    this.container = container;
    this.opts = {
      overlayScale:    opts.overlayScale    ?? 1.55,
      refImageAspect:  opts.refImageAspect  ?? 1,
      filterMinCF:     opts.filterMinCF     ?? 0.001,
      filterBeta:      opts.filterBeta      ?? 1000,
      missTolerance:   opts.missTolerance   ?? 5,
      warmupTolerance: opts.warmupTolerance ?? 5,
      uiScanning:      opts.uiScanning      ?? 'yes',
      uiLoading:       opts.uiLoading       ?? 'yes',
    };

    // MindAR gets its own sub-container to isolate it from our overlay
    // canvases. This prevents MindAR's ResizeObserver from firing before
    // its controller is ready (which causes getProjectionMatrix crashes).
    this._mindContainer = document.createElement('div');
    Object.assign(this._mindContainer.style, {
      position: 'absolute', top: '0', left: '0',
      width: '100%', height: '100%', zIndex: '1',
    });
    this._mindContainer.setAttribute('data-magic-mat', 'mindar');
    this.container.appendChild(this._mindContainer);

    // Public — other modules read these
    this.mindThree   = null;
    this.anchor      = null;
    this.camera      = null;   // THREE.Camera
    this.renderer    = null;   // THREE.WebGLRenderer
    this.scene       = null;   // THREE.Scene
    this.video       = null;   // HTMLVideoElement (created by MindAR)
    this.overlayGroup = null;  // THREE.Group for mat overlay

    this.running = false;
    this._renderCallback = null;  // set by caller
  }

  /**
   * Start tracking with a precompiled .mind target URL.
   *
   * @param {string} targetUrl – URL to .mind file (or blob URL)
   */
  async start(targetUrl) {
    if (this.running) await this.stop();

    // Lazy-load MindAR on first use
    await ensureMindAR();

    // Clear MindAR's sub-container for a fresh start
    this._mindContainer.innerHTML = '';

    this.mindThree = new MindARThree({
      container:      this._mindContainer,
      imageTargetSrc: targetUrl,
      filterMinCF:     this.opts.filterMinCF,
      filterBeta:      this.opts.filterBeta,
      missTolerance:   this.opts.missTolerance,
      warmupTolerance: this.opts.warmupTolerance,
      uiScanning:      this.opts.uiScanning  ?? 'yes',
      uiLoading:       this.opts.uiLoading   ?? 'yes',
    });

    const { renderer, scene, camera } = this.mindThree;
    this.renderer = renderer;
    this.scene    = scene;
    this.camera   = camera;

    this.anchor = this.mindThree.addAnchor(0);

    // Build overlay group (green mat outline + corner dots)
    this._buildOverlay();

    // Wire anchor events
    this.anchor.onTargetFound = () => this.emit('targetFound');
    this.anchor.onTargetLost  = () => this.emit('targetLost');

    try {
      await this.mindThree.start();
    } catch (err) {
      throw new Error(
        err?.message || 'MindAR failed to start — check camera permissions and HTTPS'
      );
    }
    this.running = true;

    // Grab the video element MindAR created (inside sub-container)
    this.video = this._mindContainer.querySelector('video');

    // Start render loop
    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
      if (this._renderCallback) this._renderCallback();
    });

    this.emit('started');
  }

  /**
   * Stop tracking and clean up.
   */
  async stop() {
    if (!this.running) return;
    this.running = false;

    if (this.mindThree) {
      this.renderer?.setAnimationLoop(null);
      try { await this.mindThree.stop(); } catch { /* ignore */ }
    }

    // Clear MindAR's sub-container (video, internal canvases)
    this._mindContainer.innerHTML = '';

    this.mindThree   = null;
    this.anchor      = null;
    this.camera      = null;
    this.renderer    = null;
    this.scene       = null;
    this.video       = null;
    this.overlayGroup = null;

    this.emit('stopped');
  }

  /**
   * Switch to a different precompiled target.
   * Stops current tracking, reinits with new target.
   *
   * @param {string} targetUrl  – URL to new .mind file
   * @param {object} newOpts    – optional config overrides (overlayScale, refImageAspect, etc.)
   */
  async switchTarget(targetUrl, newOpts = {}) {
    Object.assign(this.opts, newOpts);
    await this.start(targetUrl);
  }

  /**
   * Get the anchor's world matrix (or locked matrix if provided).
   * Returns null if anchor not visible.
   *
   * @param {THREE.Matrix4|null} lockedMatrix – use this instead if set
   * @returns {THREE.Matrix4|null}
   */
  getAnchorMatrix(lockedMatrix = null) {
    if (lockedMatrix) return lockedMatrix;
    if (!this.anchor?.group?.visible) return null;
    return this.anchor.group.matrixWorld;
  }

  /**
   * Set the per-frame render callback.
   * Called inside MindAR's animation loop, after Three.js render.
   */
  onRender(callback) {
    this._renderCallback = callback;
  }

  /**
   * Show/hide the Three.js overlay group (green mat rectangle).
   */
  setOverlayVisible(visible) {
    if (this.overlayGroup) this.overlayGroup.visible = visible;
  }

  // ── Internal: build Three.js overlay geometry ──────────────────────────

  _buildOverlay() {
    const { refImageAspect, overlayScale } = this.opts;
    const baseW = refImageAspect;
    const baseH = 1;
    const hw = baseW / 2, hh = baseH / 2;

    this.overlayGroup = new THREE.Group();
    this.anchor.group.add(this.overlayGroup);
    this.overlayGroup.scale.setScalar(overlayScale);

    // Translucent green plane
    const planeGeo = new THREE.PlaneGeometry(baseW, baseH);
    this.overlayGroup.add(new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({
      color: 0x00ff88, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
    })));

    // Edge wireframe
    this.overlayGroup.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(planeGeo),
      new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 2 }),
    ));

    // Corner dots (red, green, blue, yellow)
    const corners = [
      [-hw,  hh, 0],
      [ hw,  hh, 0],
      [ hw, -hh, 0],
      [-hw, -hh, 0],
    ];
    [0xff4444, 0x44ff44, 0x4444ff, 0xffff44].forEach((col, i) => {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 8),
        new THREE.MeshBasicMaterial({ color: col }),
      );
      dot.position.set(...corners[i]);
      this.overlayGroup.add(dot);
    });
  }
}
