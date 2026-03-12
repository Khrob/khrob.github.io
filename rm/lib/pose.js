/**
 * MoveNet MultiPose wrapper.
 * Handles model loading and pose estimation.
 * Does NOT own the animation loop — caller drives detection per frame.
 *
 * Requires: tf and poseDetection globals (loaded via <script> tags)
 */

// MoveNet COCO-17 skeleton connections
export const SKELETON = [
  [0, 1], [0, 2], [1, 3], [2, 4],           // head
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],  // arms
  [5, 11], [6, 12], [11, 12],                // torso
  [11, 13], [13, 15], [12, 14], [14, 16],    // legs
];

export const PERSON_COLORS = [
  '#ff4444', '#44ff44', '#4488ff', '#ffff44', '#ff44ff', '#44ffff',
];

const MIN_SCORE = 0.3;

export class PoseDetector {
  constructor({ maxPoses = 6, minScore = MIN_SCORE } = {}) {
    this.maxPoses = maxPoses;
    this.minScore = minScore;
    this.detector = null;
    this.ready    = false;
  }

  /**
   * Load the MoveNet MultiPose Lightning model.
   * Call once after TF.js scripts are loaded.
   */
  async init() {
    /* global tf, poseDetection */
    await tf.setBackend('webgl');
    await tf.ready();

    this.detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
        enableSmoothing: true,
        enableTracking: true,
        trackerType: poseDetection.TrackerType.BoundingBox,
      },
    );

    this.ready = true;
    console.log('[PoseDetector] MoveNet MultiPose Lightning loaded');
  }

  /**
   * Run pose estimation on the current video frame.
   * Returns the raw poses array from MoveNet.
   *
   * @param {HTMLVideoElement} video
   * @returns {Array} poses with .keypoints[17]
   */
  async detect(video) {
    if (!this.ready || !this.detector) return [];
    if (video.readyState < 2) return [];

    try {
      return await this.detector.estimatePoses(video, {
        maxPoses: this.maxPoses,
        flipHorizontal: false,
      });
    } catch {
      return [];
    }
  }

  /**
   * From detected poses, compute ground-plane positions using a projection function.
   * Returns array of {x, y, color, label} for each person whose feet/hips are visible.
   *
   * @param {Array}    poses      – MoveNet results
   * @param {Function} projectFn  – (pixelX, pixelY) => {x,y} | null
   * @returns {Array<{x,y,color,label}>}
   */
  computeGroundPositions(poses, projectFn) {
    const positions = [];
    for (let i = 0; i < poses.length; i++) {
      const kps   = poses[i].keypoints;
      const color = PERSON_COLORS[i % PERSON_COLORS.length];
      const label = `P${i + 1}`;

      let footX, footY;
      const lA = kps[15], rA = kps[16], lH = kps[11], rH = kps[12];

      if (lA.score > this.minScore && rA.score > this.minScore) {
        footX = (lA.x + rA.x) / 2;
        footY = (lA.y + rA.y) / 2;
      } else if (lH.score > this.minScore && rH.score > this.minScore) {
        footX = (lH.x + rH.x) / 2;
        footY = (lH.y + rH.y) / 2;
      } else {
        continue;
      }

      const ground = projectFn(footX, footY);
      if (ground) positions.push({ x: ground.x, y: ground.y, color, label });
    }
    return positions;
  }

  /**
   * Draw skeleton overlays onto a canvas.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array}  poses
   * @param {number} vw – video width
   * @param {number} vh – video height
   */
  drawPoses(ctx, poses, vw, vh) {
    ctx.clearRect(0, 0, vw, vh);

    poses.forEach((pose, pi) => {
      const color = PERSON_COLORS[pi % PERSON_COLORS.length];
      const kps   = pose.keypoints;

      // Bones
      ctx.strokeStyle = color;
      ctx.lineWidth   = 3;
      ctx.globalAlpha = 0.8;
      for (const [i, j] of SKELETON) {
        const a = kps[i], b = kps[j];
        if (a.score > this.minScore && b.score > this.minScore) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // Joints
      ctx.globalAlpha = 1;
      for (const kp of kps) {
        if (kp.score > this.minScore) {
          ctx.beginPath();
          ctx.arc(kp.x, kp.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(kp.x, kp.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
        }
      }

      // Label above head
      const nose = kps[0];
      if (nose.score > this.minScore) {
        ctx.font      = 'bold 14px monospace';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText(`P${pi + 1}`, nose.x, nose.y - 15);
      }
    });
    ctx.globalAlpha = 1;
  }

  dispose() {
    if (this.detector) {
      this.detector.dispose?.();
      this.detector = null;
    }
    this.ready = false;
  }
}
