import * as THREE from 'three';
import { createClipRecorder } from './clip-recorder.js';
import { notifyResize } from '@lumaform/orb/internal';

export const captureMethods = {
  ensureClipRecorder() {
    if (!this.clipRecorder) {
      this.clipRecorder = createClipRecorder({
        canvas: this.renderer.domElement,
        fps: 60,
        getEngineName: () => this.activeEngineType,
      });
    }
    return this.clipRecorder;
  },

  get isRecordingClip() {
    return !!this.clipRecorder?.isRecording;
  },

  startClip() {
    return this.ensureClipRecorder().start();
  },

  stopClip() {
    return this.clipRecorder ? this.clipRecorder.stop() : Promise.resolve(null);
  },

  // Fixed-size renders use DPR 1 by default, which makes a 240x150 thumbnail
  // exactly that size. Snapshots opt back into the live DPR below.
  renderToDataURL({
    width,
    height,
    transparent = false,
    mimeType = 'image/png',
    quality,
    pixelRatio = 1,
  } = {}) {
    const rendererSize = this.renderer.getSize(new THREE.Vector2());
    const rendererPixelRatio = this.renderer.getPixelRatio();
    const composerWidth = this.composer._width;
    const composerHeight = this.composer._height;
    const composerPixelRatio = this.composer._pixelRatio;
    const cameraAspect = this.camera.aspect;
    // Refitting for the snapshot's shape moves the camera, so the live view's
    // position and framing are put back afterwards rather than refitted again.
    const cameraPosition = this.camera.position.clone();
    const framedDistance = this.framedDistance;
    const targetWidth = Math.max(1, Math.round(width ?? rendererSize.x));
    const targetHeight = Math.max(1, Math.round(height ?? rendererSize.y));
    const prevClearColor = new THREE.Color();
    this.renderer.getClearColor(prevClearColor);
    const prevClearAlpha = this.renderer.getClearAlpha();
    const prevBg = this.scene.background;
    let dataUrl;

    if (this.isRecordingClip) {
      // captureStream() watches the live canvas. Resizing or rendering a
      // thumbnail into it would put that frame into the recording, so scale the
      // already-painted frame through a temporary 2D canvas instead.
      if (transparent) {
        // The painted frame already has the background composited into it;
        // there is no alpha left to recover by scaling it.
        throw new Error('Transparent captures are unavailable while recording a clip.');
      }

      const maxWidth = this.renderer.domElement.width;
      const maxHeight = this.renderer.domElement.height;
      let outWidth = Math.max(1, Math.round(targetWidth * pixelRatio));
      let outHeight = Math.max(1, Math.round(targetHeight * pixelRatio));

      // Clamp rather than refuse. Three sizes the canvas with Math.floor while
      // this rounds, so an exact 1:1 capture can land one pixel past the canvas
      // and would otherwise throw for roughly 40% of window widths at the
      // default 1.2 device pixel ratio. Scaling both axes by the same factor
      // also keeps a genuinely upscaled request (2x, 3x) producing a correctly
      // proportioned image at the resolution actually available.
      if (outWidth > maxWidth || outHeight > maxHeight) {
        const scale = Math.min(maxWidth / outWidth, maxHeight / outHeight);
        outWidth = Math.max(1, Math.floor(outWidth * scale));
        outHeight = Math.max(1, Math.floor(outHeight * scale));
      }

      const output = document.createElement('canvas');
      output.width = outWidth;
      output.height = outHeight;
      output.getContext('2d')?.drawImage(this.renderer.domElement, 0, 0, outWidth, outHeight);
      return output.toDataURL(mimeType, quality);
    }

    try {
      if (transparent) {
        this.renderer.setClearColor(0x000000, 0);
        this.scene.background = null;
      }

      this.renderer.setPixelRatio(pixelRatio);
      this.composer.setPixelRatio(pixelRatio);
      this.renderer.setSize(targetWidth, targetHeight, false);
      this.composer.setSize(targetWidth, targetHeight);
      this.camera.aspect = targetWidth / targetHeight;
      this.camera.updateProjectionMatrix();
      // A portrait snapshot is framed by its width, as the live view would be.
      this.refitCamera();
      notifyResize(this.activeEngine, targetWidth, targetHeight);

      this.composer.render();
      dataUrl = this.renderer.domElement.toDataURL(mimeType, quality);
    } finally {
      // Canvas encoding can fail (for example after a cross-origin texture).
      // Restoration still has to happen or the live studio remains thumbnail-sized.
      this.renderer.setClearColor(prevClearColor, prevClearAlpha);
      this.scene.background = prevBg;
      this.renderer.setPixelRatio(rendererPixelRatio);
      this.composer.setPixelRatio(composerPixelRatio);
      this.renderer.setSize(rendererSize.x, rendererSize.y, false);
      this.composer.setSize(composerWidth, composerHeight);
      this.camera.aspect = cameraAspect;
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(cameraPosition);
      this.framedDistance = framedDistance;
      this.controls?.update();
      notifyResize(this.activeEngine, rendererSize.x, rendererSize.y);
    }

    return dataUrl;
  },

  captureThumbnail() {
    return this.renderToDataURL({
      width: 240,
      height: 150,
      mimeType: 'image/jpeg',
      quality: 0.72,
    });
  },

  // Why a snapshot would be refused right now, or null if it would succeed.
  // Exposed so callers can tell the user — a button that silently does nothing
  // is worse than one that explains itself.
  snapshotBlockedReason({ transparent = false, multiplier = 1 } = {}) {
    if (!this.isRecordingClip) return null;
    if (transparent) {
      return 'Stop clip recording before taking a transparent snapshot — the recorded frame has no alpha.';
    }
    if (multiplier > 1) {
      return 'Stop clip recording before taking an upscaled snapshot — while recording, captures are limited to the on-screen resolution.';
    }
    return null;
  },

  captureSnapshot({ transparent = false, multiplier = 1 } = {}) {
    const blocked = this.snapshotBlockedReason({ transparent, multiplier });
    if (blocked) {
      console.warn(blocked);
      return null;
    }
    const dataUrl = this.renderToDataURL({
      width: window.innerWidth * multiplier,
      height: window.innerHeight * multiplier,
      transparent,
      pixelRatio: this.renderer.getPixelRatio(),
    });

    const link = document.createElement('a');
    link.download = `orb-${this.activeEngineType}-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();

    return dataUrl;
  },
};
