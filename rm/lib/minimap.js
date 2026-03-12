/**
 * Top-down minimap renderer.
 * Shows mat outline, camera position, and detected body positions.
 * Pure rendering — no internal state beyond canvas reference.
 */

export class Minimap {
  /**
   * @param {HTMLCanvasElement} canvas  – minimap canvas element
   * @param {object}            opts
   * @param {number}            opts.size   – canvas size in px (default 200)
   * @param {number}            opts.range  – world-space range shown (default 3.0)
   */
  constructor(canvas, { size = 200, range = 3.0 } = {}) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.size   = size;
    this.range  = range;

    canvas.width  = size;
    canvas.height = size;
  }

  /**
   * Draw one frame of the minimap.
   *
   * @param {object}  matConfig             – { refImageAspect, overlayScale }
   * @param {{x,y,z}|null} cameraLocal      – camera position in anchor-local coords
   * @param {Array<{x,y,color,label}>} bodies – ground positions from pose detector
   */
  draw(matConfig, cameraLocal, bodies) {
    const S     = this.size;
    const ctx   = this.ctx;
    const cx    = S / 2;
    const cy    = S / 2;
    const scale = S / (this.range * 2);

    // Background
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, S, S);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const g = (i / 6) * S;
      ctx.beginPath();
      ctx.moveTo(g, 0); ctx.lineTo(g, S);
      ctx.moveTo(0, g); ctx.lineTo(S, g);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, S);
    ctx.moveTo(0, cy); ctx.lineTo(S, cy);
    ctx.stroke();

    // Mat rectangle
    if (matConfig) {
      const matW = matConfig.refImageAspect * matConfig.overlayScale * scale;
      const matH = 1.0 * matConfig.overlayScale * scale;
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - matW / 2, cy - matH / 2, matW, matH);
      ctx.fillStyle = 'rgba(0,255,136,0.15)';
      ctx.fillRect(cx - matW / 2, cy - matH / 2, matW, matH);
      ctx.font = '9px monospace';
      ctx.fillStyle = '#0f8';
      ctx.textAlign = 'center';
      ctx.fillText('MAT', cx, cy + 3);
    }

    // Camera triangle
    if (cameraLocal) {
      const cmx = cx + cameraLocal.x * scale;
      const cmy = cy - cameraLocal.y * scale;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(cmx, cmy - 6);
      ctx.lineTo(cmx - 4, cmy + 4);
      ctx.lineTo(cmx + 4, cmy + 4);
      ctx.closePath();
      ctx.fill();
      ctx.font = '8px monospace';
      ctx.fillStyle = '#aaa';
      ctx.textAlign = 'center';
      ctx.fillText('CAM', cmx, cmy + 14);
    }

    // Body dots
    if (bodies) {
      for (const body of bodies) {
        const bx = cx + body.x * scale;
        const by = cy - body.y * scale;
        ctx.beginPath();
        ctx.arc(bx, by, 6, 0, Math.PI * 2);
        ctx.fillStyle = body.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(body.label, bx, by - 10);
      }
    }

    // Label
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'left';
    ctx.fillText('TOP-DOWN', 6, 14);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.size, this.size);
  }
}
