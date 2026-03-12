/**
 * Mat replacement compositor.
 * Replaces the mat's visual appearance with custom content,
 * then punches out body silhouettes so people stay visible on top.
 *
 * Uses canvas 2D compositing (destination-out) for the mask.
 */

// MoveNet COCO-17 keypoint indices used for silhouette
const MIN_SCORE = 0.3;

// Limb pairs: [startIdx, endIdx, thicknessFraction]
// thicknessFraction is relative to video height
const LIMB_PAIRS = [
  [5,  7,  0.045], [7,  9,  0.035],   // left arm
  [6,  8,  0.045], [8,  10, 0.035],   // right arm
  [11, 13, 0.055], [13, 15, 0.04],    // left leg
  [12, 14, 0.055], [14, 16, 0.04],    // right leg
];

export class MatCompositor {
  /**
   * @param {HTMLCanvasElement} compCanvas – visible compositing canvas (z-index 5)
   */
  constructor(compCanvas) {
    this.canvas = compCanvas;
    this.ctx    = compCanvas.getContext('2d');

    // Offscreen canvas for building the body silhouette mask
    this.maskCanvas = document.createElement('canvas');
    this.maskCtx    = this.maskCanvas.getContext('2d');
  }

  /**
   * Resize internal canvases to match video dimensions.
   * Call when video size changes.
   */
  resize(w, h) {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width  = w;
      this.canvas.height = h;
      this.maskCanvas.width  = w;
      this.maskCanvas.height = h;
    }
  }

  /**
   * Render one frame of mat replacement compositing.
   *
   * @param {Array<{x,y}>}   corners         – [TL,TR,BR,BL] in video pixel coords
   * @param {Array}           poses           – MoveNet pose results
   * @param {Function}        contentRenderer – (ctx, width, height) => void
   */
  render(corners, poses, contentRenderer) {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;

    if (!corners) { ctx.clearRect(0, 0, w, h); return; }

    // 1. Draw custom content clipped to mat quadrilateral
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();
    ctx.clip();

    if (contentRenderer) {
      contentRenderer(ctx, w, h);
    } else {
      // Default: solid dark overlay
      ctx.fillStyle = 'rgba(0,0,40,0.8)';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();

    // 2. Build body silhouette mask
    this.maskCtx.clearRect(0, 0, w, h);
    if (poses) {
      for (const pose of poses) {
        this._drawBodySilhouette(this.maskCtx, pose.keypoints, h);
      }
    }

    // 3. Punch out body shapes → video shows through where people are
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(this.maskCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // ── Body silhouette from MoveNet skeleton keypoints ──────────────────

  _drawBodySilhouette(ctx, kps, vh) {
    ctx.fillStyle   = 'white';
    ctx.strokeStyle = 'white';
    ctx.lineCap     = 'round';

    // Torso polygon (shoulders → hips)
    const torso = [5, 6, 12, 11].map(i => kps[i]);
    if (torso.every(kp => kp.score > MIN_SCORE)) {
      ctx.beginPath();
      ctx.moveTo(torso[0].x, torso[0].y);
      for (let i = 1; i < torso.length; i++) ctx.lineTo(torso[i].x, torso[i].y);
      ctx.closePath();
      ctx.fill();
    }

    // Limbs as thick lines
    for (const [i, j, thickness] of LIMB_PAIRS) {
      const a = kps[i], b = kps[j];
      if (a.score > MIN_SCORE && b.score > MIN_SCORE) {
        ctx.lineWidth = vh * thickness;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // Head circle (sized from ear-to-ear or fallback)
    const nose = kps[0], lEar = kps[3], rEar = kps[4];
    if (nose.score > MIN_SCORE) {
      let headR = vh * 0.05;
      if (lEar.score > MIN_SCORE && rEar.score > MIN_SCORE) {
        headR = Math.hypot(lEar.x - rEar.x, lEar.y - rEar.y) * 0.8;
      }
      ctx.beginPath();
      ctx.arc(nose.x, nose.y, headR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Neck connector (head → shoulder midpoint)
    const lSh = kps[5], rSh = kps[6];
    if (nose.score > MIN_SCORE && lSh.score > MIN_SCORE && rSh.score > MIN_SCORE) {
      const neckX = (lSh.x + rSh.x) / 2;
      const neckY = (lSh.y + rSh.y) / 2;
      ctx.lineWidth = vh * 0.05;
      ctx.beginPath();
      ctx.moveTo(nose.x, nose.y);
      ctx.lineTo(neckX, neckY);
      ctx.stroke();
    }
  }
}

/**
 * Default "GAME AREA" content renderer.
 * Animated gradient + grid + label. Use as example / placeholder.
 */
export function defaultContentRenderer(ctx, w, h) {
  const t = Date.now() / 1000;
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0,   `hsl(${(t * 40)       % 360}, 70%, 35%)`);
  grad.addColorStop(0.5, `hsl(${(t * 40 + 120) % 360}, 70%, 25%)`);
  grad.addColorStop(1,   `hsl(${(t * 40 + 240) % 360}, 70%, 35%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  const gs = 50;
  for (let x = 0; x < w; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  // Label
  ctx.font = 'bold 48px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GAME AREA', w / 2, h / 2);
}
