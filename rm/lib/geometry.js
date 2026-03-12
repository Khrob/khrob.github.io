/**
 * Mat geometry utilities — pure functions for 3D↔2D projection.
 * All functions take Three.js objects as parameters (no internal state).
 *
 * Requires: THREE (passed via import or global)
 */
import * as THREE from 'three';

// ── Reusable Three.js objects (avoids per-frame allocation) ──────────
const _raycaster = new THREE.Raycaster();
const _ndc       = new THREE.Vector2();
const _normal    = new THREE.Vector3();
const _point     = new THREE.Vector3();
const _plane     = new THREE.Plane();
const _hit       = new THREE.Vector3();
const _inv       = new THREE.Matrix4();
const _quat      = new THREE.Quaternion();
const _tmpScale  = new THREE.Vector3();

/**
 * Project the mat's 3D corners to 2D pixel coordinates in video space.
 *
 * @param {THREE.Matrix4} anchorMatrix  – anchor.group.matrixWorld (or locked copy)
 * @param {THREE.Camera}  camera        – MindAR's Three.js camera
 * @param {number}        refAspect     – reference image width/height ratio
 * @param {number}        overlayScale  – empirical scale factor (e.g. 1.55)
 * @param {number}        videoW        – video element width in px
 * @param {number}        videoH        – video element height in px
 * @returns {Array<{x:number, y:number}>|null} [TL, TR, BR, BL] or null
 */
export function getMatCorners2D(anchorMatrix, camera, refAspect, overlayScale, videoW, videoH) {
  if (!anchorMatrix || !camera) return null;

  const hw = refAspect / 2;
  const hh = 0.5;

  const localCorners = [
    new THREE.Vector3(-hw,  hh, 0),  // TL
    new THREE.Vector3( hw,  hh, 0),  // TR
    new THREE.Vector3( hw, -hh, 0),  // BR
    new THREE.Vector3(-hw, -hh, 0),  // BL
  ];

  return localCorners.map(v => {
    v.multiplyScalar(overlayScale);
    v.applyMatrix4(anchorMatrix);
    v.project(camera);
    return {
      x: (v.x + 1) / 2 * videoW,
      y: (1 - (v.y + 1) / 2) * videoH,
    };
  });
}

/**
 * Cast a 2D pixel coordinate through the camera onto the mat's ground plane,
 * returning the intersection in anchor-local coordinates.
 *
 * Used for placing detected bodies onto the mat's surface.
 *
 * @param {number}        pixelX       – x in video pixels
 * @param {number}        pixelY       – y in video pixels
 * @param {THREE.Matrix4} anchorMatrix – anchor.group.matrixWorld (or locked copy)
 * @param {THREE.Camera}  camera       – MindAR's Three.js camera
 * @param {number}        videoW       – video width in px
 * @param {number}        videoH       – video height in px
 * @returns {{x:number, y:number}|null}  anchor-local 2D coords, or null
 */
export function projectToGroundPlane(pixelX, pixelY, anchorMatrix, camera, videoW, videoH) {
  if (!anchorMatrix || !camera) return null;

  _ndc.set(
    (pixelX / videoW)  *  2 - 1,
    -(pixelY / videoH) *  2 + 1,
  );
  _raycaster.setFromCamera(_ndc, camera);

  // Build the mat's ground plane in world space
  _normal.set(0, 0, 1);
  anchorMatrix.decompose(_point, _quat, _tmpScale);
  _normal.applyQuaternion(_quat);
  _plane.setFromNormalAndCoplanarPoint(_normal, _point);

  const intersection = _raycaster.ray.intersectPlane(_plane, _hit);
  if (!intersection) return null;

  // Transform hit from world → anchor-local
  _inv.copy(anchorMatrix).invert();
  _hit.applyMatrix4(_inv);

  return { x: _hit.x, y: _hit.y };
}

/**
 * Decompose an anchor matrix into position + Euler angles.
 * Useful for status display / debugging.
 *
 * @param {THREE.Matrix4} matrix
 * @returns {{pos: THREE.Vector3, euler: THREE.Euler, distance: number}}
 */
export function decomposeAnchor(matrix) {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  matrix.decompose(pos, quat, new THREE.Vector3());
  const euler = new THREE.Euler().setFromQuaternion(quat, 'ZYX');
  return { pos, euler, distance: pos.length() };
}

/**
 * Get the camera position in anchor-local coordinates.
 * Used by the minimap to show where the camera is relative to the mat.
 *
 * @param {THREE.Camera}  camera
 * @param {THREE.Matrix4} anchorMatrix
 * @returns {{x:number, y:number, z:number}}
 */
export function getCameraLocalPosition(camera, anchorMatrix) {
  const camWorld = camera.position.clone();
  const inv = anchorMatrix.clone().invert();
  camWorld.applyMatrix4(inv);
  return { x: camWorld.x, y: camWorld.y, z: camWorld.z };
}
