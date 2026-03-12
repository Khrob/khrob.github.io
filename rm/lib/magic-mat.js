/**
 * MagicMat — main orchestrator.
 *
 * Wires together MindAR tracking, MoveNet pose detection, mat compositing,
 * and minimap rendering into a single public API.
 *
 * Usage:
 *   import { MagicMat } from './lib/magic-mat.js';
 *
 *   const mat = new MagicMat(document.getElementById('container'), {
 *     manifestUrl: 'targets/targets.json',
 *   });
 *   await mat.init();
 *   await mat.loadTarget('test-book');
 *   mat.start();
 */
import { EventEmitter } from './event-emitter.js';
import { MindARTracker } from './tracker.js';
import { PoseDetector } from './pose.js';
import { MatCompositor, defaultContentRenderer } from './compositor.js';
import { Minimap } from './minimap.js';
import { getMatCorners2D, projectToGroundPlane, decomposeAnchor, getCameraLocalPosition } from './geometry.js';

export { defaultContentRenderer } from './compositor.js';
export { SKELETON, PERSON_COLORS } from './pose.js';

export class MagicMat extends EventEmitter {
  /**
   * @param {HTMLElement} container – DOM element that will hold the AR view.
   *   MagicMat creates its overlay canvases inside this container.
   * @param {object} opts
   * @param {string} opts.manifestUrl    – URL to targets.json (optional if using loadTargetDirect)
   * @param {object} opts.manifest       – inline manifest object (alternative to manifestUrl)
   * @param {boolean} opts.enablePose    – start with pose detection on (default true)
   * @param {boolean} opts.enableMinimap – start with minimap on (default true)
   * @param {boolean} opts.enableReplace – start with mat replacement on (default false)
   * @param {number}  opts.maxPoses      – max bodies to detect (default 6)
   * @param {number}  opts.minimapSize   – minimap canvas size in px (default 200)
   * @param {number}  opts.minimapRange  – world-space range shown (default 3.0)
   */
  constructor(container, opts = {}) {
    super();
    this.container = container;

    // Options
    this._manifestUrl = opts.manifestUrl ?? null;
    this._maxPoses    = opts.maxPoses    ?? 6;

    // Feature flags
    this._trackingEnabled = opts.enableTracking ?? true;
    this._poseEnabled     = opts.enablePose     ?? true;
    this._minimapEnabled  = opts.enableMinimap  ?? true;
    this._replaceEnabled  = opts.enableReplace  ?? false;

    // MindAR UI options
    this._uiScanning = opts.uiScanning ?? 'yes';
    this._uiLoading  = opts.uiLoading  ?? 'yes';

    // State
    this.manifest      = opts.manifest ?? null;
    this.currentTarget = null;   // name string
    this.targetConfig  = null;   // config for current target
    this.isLocked      = false;
    this.lockedMatrix  = null;
    this.lastPoses     = [];
    this.lastGroundPositions = [];

    // Modules (created in init)
    this.tracker    = null;
    this.pose       = null;
    this.compositor = null;
    this.minimap    = null;

    // Canvases (created in _createCanvases)
    this._compCanvas = null;
    this._poseCanvas = null;
    this._poseCtx    = null;
    this._minimapCanvas = null;

    // Content renderer callback
    this._contentRenderer = defaultContentRenderer;

    // Pose loop control
    this._poseRunning = false;

    // FPS tracking
    this._frameTimes = [];       // timestamps of recent pose frames
    this._fps = 0;               // rolling average FPS
    this._fpsWindow = 30;        // number of frames to average over

    // Create overlay canvases
    this._createCanvases(opts);
  }

  // ── Read-only getters for feature state ─────────────────────────────
  get trackingEnabled() { return this._trackingEnabled; }
  get poseEnabled()     { return this._poseEnabled; }
  get minimapEnabled()  { return this._minimapEnabled; }
  get replaceEnabled()  { return this._replaceEnabled; }

  /** Rolling average FPS of the pose detection loop. */
  get fps() { return this._fps; }

  // ══════════════════════════════════════════════════════════════════════════
  // ── Public API ─────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize: load manifest + pose model.
   * Call once before loadTarget().
   */
  async init() {
    // Load manifest
    if (!this.manifest && this._manifestUrl) {
      const resp = await fetch(this._manifestUrl);
      if (!resp.ok) throw new Error(`Failed to load manifest: ${resp.status}`);
      this.manifest = await resp.json();
    }

    // Init pose detector
    this.pose = new PoseDetector({ maxPoses: this._maxPoses });
    try {
      await this.pose.init();
      this.emit('poseReady');
    } catch (e) {
      console.warn('[MagicMat] Pose detection failed to init:', e);
      this.emit('poseError', e);
    }

    this.emit('ready');
  }

  /**
   * Load and start tracking a precompiled target by name (from manifest).
   *
   * @param {string} name – target name as defined in targets.json
   */
  async loadTarget(name) {
    if (!this.manifest?.targets?.[name]) {
      throw new Error(`Target "${name}" not found in manifest`);
    }

    const cfg = this.manifest.targets[name];
    this.currentTarget = name;
    this.targetConfig  = cfg;

    // Reset lock state
    this.isLocked     = false;
    this.lockedMatrix = null;
    this.lastPoses    = [];
    this.lastGroundPositions = [];

    // Resolve .mind URL relative to manifest
    const mindUrl = new URL(cfg.mind, new URL(this._manifestUrl, location.href)).href;

    // Create or reconfigure tracker
    const trackerOpts = {
      overlayScale:   cfg.overlayScale   ?? 1.55,
      refImageAspect: cfg.refImageAspect ?? 1,
      uiScanning:     this._uiScanning,
      uiLoading:      this._uiLoading,
    };

    if (!this.tracker) {
      this.tracker = new MindARTracker(this.container, trackerOpts);
      this._wireTrackerEvents();
    } else {
      Object.assign(this.tracker.opts, trackerOpts);
    }

    await this.tracker.start(mindUrl);
    this.emit('targetLoaded', name);
  }

  /**
   * Load a target directly from a .mind URL (without manifest).
   *
   * @param {string} mindUrl      – URL to .mind file
   * @param {object} config       – { refImageAspect, overlayScale, ... }
   */
  async loadTargetDirect(mindUrl, config = {}) {
    this.currentTarget = config.name ?? mindUrl;
    this.targetConfig  = config;
    this.isLocked      = false;
    this.lockedMatrix  = null;

    const trackerOpts = {
      overlayScale:   config.overlayScale   ?? 1.55,
      refImageAspect: config.refImageAspect ?? 1,
      uiScanning:     this._uiScanning,
      uiLoading:      this._uiLoading,
    };

    if (!this.tracker) {
      this.tracker = new MindARTracker(this.container, trackerOpts);
      this._wireTrackerEvents();
    } else {
      Object.assign(this.tracker.opts, trackerOpts);
    }

    await this.tracker.start(mindUrl);
    this.emit('targetLoaded', this.currentTarget);
  }

  /**
   * Start the pose detection loop.
   * (Tracking is already running after loadTarget.)
   */
  start() {
    if (this._poseEnabled && this.pose?.ready && !this._poseRunning) {
      this._poseRunning = true;
      this._frameTimes = [];
      this._fps = 0;
      this._runPoseLoop();
    }
  }

  /**
   * Stop everything — tracking + pose.
   */
  async stop() {
    this._poseRunning = false;
    if (this.tracker) await this.tracker.stop();
    this._clearCanvases();
  }

  /**
   * Clean up all resources.
   */
  async dispose() {
    await this.stop();
    this.pose?.dispose();
    this.removeAllListeners();
  }

  // ── Feature toggles ───────────────────────────────────────────────────

  enableTracking(on) {
    this._trackingEnabled = on;
    // Hide/show the Three.js overlay
    this.tracker?.setOverlayVisible(on && !this._replaceEnabled);
    if (!on) {
      // Clear lock when tracking disabled
      this.isLocked = false;
      this.lockedMatrix = null;
      this.lastGroundPositions = [];
    }
    this.emit('featureToggled', 'tracking', on);
  }

  enablePose(on) {
    this._poseEnabled = on;
    if (!on) {
      this._poseCtx?.clearRect(0, 0, this._poseCanvas.width, this._poseCanvas.height);
      this.lastPoses = [];
      this.lastGroundPositions = [];
    }
    if (on && !this._poseRunning && this.pose?.ready) {
      this._poseRunning = true;
      this._runPoseLoop();
    }
    this.emit('featureToggled', 'pose', on);
  }

  enableMinimap(on) {
    this._minimapEnabled = on;
    if (!on) this.minimap?.clear();
    this._minimapCanvas.style.display = on ? '' : 'none';
    this.emit('featureToggled', 'minimap', on);
  }

  enableReplacement(on) {
    this._replaceEnabled = on;
    if (!on) this.compositor?.clear();
    // Hide Three.js overlay when replacement is active
    this.tracker?.setOverlayVisible(!on);
    this.emit('featureToggled', 'replacement', on);
  }

  // ── Content renderer ──────────────────────────────────────────────────

  /**
   * Set a custom content renderer for mat replacement.
   * @param {Function} fn – (ctx, width, height) => void
   */
  setContentRenderer(fn) {
    this._contentRenderer = fn ?? defaultContentRenderer;
  }

  // ── Lock / Unlock ─────────────────────────────────────────────────────

  lockMat() {
    if (!this.tracker?.anchor?.group?.visible) return false;
    this.lockedMatrix = this.tracker.anchor.group.matrixWorld.clone();
    this.isLocked = true;
    this.emit('matLocked');
    return true;
  }

  unlockMat() {
    this.isLocked = false;
    this.lockedMatrix = null;
    this.emit('matUnlocked');
  }

  // ── Data queries ──────────────────────────────────────────────────────

  /** Get current mat corners in 2D pixel coords, or null */
  getMatCorners() {
    const matrix = this._getAnchorMatrix();
    if (!matrix || !this.tracker?.video || !this.targetConfig) return null;
    const v = this.tracker.video;
    return getMatCorners2D(
      matrix, this.tracker.camera,
      this.targetConfig.refImageAspect ?? this.tracker.opts.refImageAspect,
      this.targetConfig.overlayScale   ?? this.tracker.opts.overlayScale,
      v.videoWidth, v.videoHeight,
    );
  }

  /** Get last detected poses */
  getPoses() { return this.lastPoses; }

  /** Get last computed ground positions */
  getGroundPositions() { return this.lastGroundPositions; }

  /** Get mat pose decomposition (position, euler, distance) or null */
  getMatPose() {
    const matrix = this._getAnchorMatrix();
    return matrix ? decomposeAnchor(matrix) : null;
  }

  /** Get list of available target names from manifest */
  getTargetNames() {
    return this.manifest ? Object.keys(this.manifest.targets) : [];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── Internal ───────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  _createCanvases(opts) {
    // Compositing canvas (z-index 5)
    this._compCanvas = document.createElement('canvas');
    this._compCanvas.setAttribute('data-magic-mat', 'comp');
    Object.assign(this._compCanvas.style, {
      position: 'absolute', top: '0', left: '0',
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '5',
    });
    this.container.appendChild(this._compCanvas);
    this.compositor = new MatCompositor(this._compCanvas);

    // Pose canvas (z-index 10)
    this._poseCanvas = document.createElement('canvas');
    this._poseCanvas.setAttribute('data-magic-mat', 'pose');
    Object.assign(this._poseCanvas.style, {
      position: 'absolute', top: '0', left: '0',
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '10',
    });
    this.container.appendChild(this._poseCanvas);
    this._poseCtx = this._poseCanvas.getContext('2d');

    // Minimap canvas (z-index 20)
    this._minimapCanvas = document.createElement('canvas');
    this._minimapCanvas.setAttribute('data-magic-mat', 'minimap');
    const mSize = opts.minimapSize ?? 200;
    Object.assign(this._minimapCanvas.style, {
      position: 'absolute', bottom: '10px', right: '10px',
      width: mSize + 'px', height: mSize + 'px',
      background: 'rgba(0,0,0,0.7)', border: '1px solid #444',
      borderRadius: '8px', zIndex: '20',
      pointerEvents: 'none',
    });
    this.container.appendChild(this._minimapCanvas);
    this.minimap = new Minimap(this._minimapCanvas, {
      size:  mSize,
      range: opts.minimapRange ?? 3.0,
    });

    if (!this._minimapEnabled) this._minimapCanvas.style.display = 'none';
  }

  _wireTrackerEvents() {
    this.tracker.on('targetFound', () => {
      if (this._trackingEnabled) this.emit('matFound');
    });
    this.tracker.on('targetLost', () => {
      if (this._trackingEnabled && !this.isLocked) this.emit('matLost');
    });

    // Hook into the render loop for minimap + overlay visibility
    this.tracker.onRender(() => {
      // Hide Three.js overlay when replacement is active or tracking is off
      this.tracker.setOverlayVisible(this._trackingEnabled && !this._replaceEnabled);

      // Update minimap
      if (this._minimapEnabled) {
        const matrix = this._getAnchorMatrix();
        const camLocal = matrix && this.tracker.camera
          ? getCameraLocalPosition(this.tracker.camera, matrix) : null;
        const cfg = this.targetConfig ?? this.tracker.opts;
        this.minimap.draw(
          { refImageAspect: cfg.refImageAspect, overlayScale: cfg.overlayScale },
          camLocal,
          this.lastGroundPositions,
        );
      }

      this.emit('frame');
    });
  }

  async _runPoseLoop() {
    if (!this._poseRunning || !this.tracker?.video) return;

    const video = this.tracker.video;
    if (this._poseEnabled && video.readyState >= 2) {
      // Detect poses
      const poses = await this.pose.detect(video);
      this.lastPoses = poses;

      const vw = video.videoWidth, vh = video.videoHeight;

      // Resize canvases if needed
      if (this._poseCanvas.width !== vw || this._poseCanvas.height !== vh) {
        this._poseCanvas.width  = vw;
        this._poseCanvas.height = vh;
      }
      this.compositor.resize(vw, vh);

      // Draw skeletons
      this.pose.drawPoses(this._poseCtx, poses, vw, vh);

      // Compute ground positions
      const matrix = this._getAnchorMatrix();
      if (matrix) {
        this.lastGroundPositions = this.pose.computeGroundPositions(
          poses,
          (px, py) => projectToGroundPlane(px, py, matrix, this.tracker.camera, vw, vh),
        );
      }

      // Mat replacement compositing
      if (this._replaceEnabled) {
        const corners = this.getMatCorners();
        this.compositor.render(corners, poses, this._contentRenderer);
      } else {
        this.compositor.clear();
      }

      // FPS tracking
      const now = performance.now();
      this._frameTimes.push(now);
      if (this._frameTimes.length > this._fpsWindow) this._frameTimes.shift();
      if (this._frameTimes.length >= 2) {
        const elapsed = now - this._frameTimes[0];
        this._fps = Math.round((this._frameTimes.length - 1) / (elapsed / 1000));
      }

      this.emit('poses', poses, this.lastGroundPositions);
      this.emit('fps', this._fps);
    }

    // Yield to event loop before scheduling next iteration.
    // TF.js inference is CPU-heavy and can starve click handlers;
    // the setTimeout(0) guarantees queued events get processed.
    await new Promise(r => setTimeout(r, 0));
    if (this._poseRunning) requestAnimationFrame(() => this._runPoseLoop());
  }

  _getAnchorMatrix() {
    if (!this._trackingEnabled) return null;
    if (this.isLocked && this.lockedMatrix) return this.lockedMatrix;
    return this.tracker?.getAnchorMatrix() ?? null;
  }

  _clearCanvases() {
    this._poseCtx?.clearRect(0, 0, this._poseCanvas.width, this._poseCanvas.height);
    this.compositor?.clear();
    this.minimap?.clear();
  }
}
