export type CachedFrame = {
  jpeg: Buffer;
  capturedAt: number;
};

/**
 * Last full JPEG per camera. Live fetches write through; atlas and thumbnails
 * only peek.
 */
export class CameraPreviewCache {
  private readonly frames = new Map<number, CachedFrame>();

  remember(cameraId: number, jpeg: Buffer, capturedAt = Date.now()): void {
    this.frames.set(cameraId, { jpeg, capturedAt });
  }

  peek(cameraId: number): CachedFrame | undefined {
    return this.frames.get(cameraId);
  }

  forget(cameraId: number): void {
    this.frames.delete(cameraId);
  }
}
