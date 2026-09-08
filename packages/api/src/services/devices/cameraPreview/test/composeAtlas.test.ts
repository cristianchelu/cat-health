import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';

import {
  CAMERA_PREVIEW_CELL_PX,
  composeAtlas,
  renderPreviewCell,
} from '../composeAtlas.ts';

async function solidJpeg(options: {
  width: number;
  height: number;
  r: number;
  g: number;
  b: number;
}): Promise<Buffer> {
  return sharp({
    create: {
      width: options.width,
      height: options.height,
      channels: 3,
      background: { r: options.r, g: options.g, b: options.b },
    },
  })
    .jpeg()
    .toBuffer();
}

async function sample(jpeg: Buffer, x: number, y: number) {
  const { data, info } = await sharp(jpeg)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const index = (y * info.width + x) * info.channels;
  return { r: data[index], g: data[index + 1], b: data[index + 2] };
}

describe('renderPreviewCell', () => {
  it('crops then rotates before the square resize, so a 90° swap cannot overflow the ROI', async () => {
    const jpeg = await solidJpeg({
      width: 200,
      height: 100,
      r: 20,
      g: 20,
      b: 200,
    });
    const cell = await renderPreviewCell({
      deviceId: 12,
      jpeg,
      capturedAt: 1,
      crop: { left: 0.5, top: 0.25, width: 0.4, height: 0.5 },
      rotate: -90,
    });
    const meta = await sharp(cell).metadata();
    assert.equal(meta.width, CAMERA_PREVIEW_CELL_PX);
    assert.equal(meta.height, CAMERA_PREVIEW_CELL_PX);
  });

  it('fills a square cell with cover, not letterboxing', async () => {
    const jpeg = await solidJpeg({
      width: 160,
      height: 80,
      r: 200,
      g: 10,
      b: 10,
    });
    const cell = await renderPreviewCell({
      deviceId: 1,
      jpeg,
      capturedAt: 1,
    });
    const meta = await sharp(cell).metadata();
    assert.equal(meta.width, CAMERA_PREVIEW_CELL_PX);
    assert.equal(meta.height, CAMERA_PREVIEW_CELL_PX);
    const pixel = await sample(cell, 40, 40);
    assert.ok(pixel.r > 150);
    assert.ok(pixel.g < 40);
  });
});

describe('composeAtlas', () => {
  it('places two devices sharing one frame into distinct ROI cells', async () => {
    const jpeg = await sharp({
      create: {
        width: 100,
        height: 50,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 50,
              height: 50,
              channels: 3,
              background: { r: 220, g: 20, b: 20 },
            },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
        {
          input: await sharp({
            create: {
              width: 50,
              height: 50,
              channels: 3,
              background: { r: 20, g: 20, b: 220 },
            },
          })
            .png()
            .toBuffer(),
          left: 50,
          top: 0,
        },
      ])
      .jpeg()
      .toBuffer();

    const atlas = await composeAtlas([
      {
        deviceId: 2,
        jpeg,
        capturedAt: 9,
        crop: { left: 0.5, top: 0, width: 0.5, height: 1 },
      },
      {
        deviceId: 1,
        jpeg,
        capturedAt: 9,
        crop: { left: 0, top: 0, width: 0.5, height: 1 },
      },
    ]);

    assert.ok(atlas);
    assert.equal(atlas.layout.devices.length, 2);
    assert.deepEqual(
      atlas.layout.devices.map((cell) => cell.id),
      [1, 2],
    );
    assert.notEqual(atlas.layout.devices[0]?.x, atlas.layout.devices[1]?.x);

    const left = atlas.layout.devices[0];
    const right = atlas.layout.devices[1];
    assert.ok(left);
    assert.ok(right);
    const leftPixel = await sample(
      atlas.jpeg,
      left.x + CAMERA_PREVIEW_CELL_PX / 2,
      left.y + CAMERA_PREVIEW_CELL_PX / 2,
    );
    const rightPixel = await sample(
      atlas.jpeg,
      right.x + CAMERA_PREVIEW_CELL_PX / 2,
      right.y + CAMERA_PREVIEW_CELL_PX / 2,
    );
    assert.ok(leftPixel.r > 150);
    assert.ok(rightPixel.b > 150);
  });

  it('omits a device whose frame cannot be decoded', async () => {
    const jpeg = await solidJpeg({
      width: 40,
      height: 40,
      r: 10,
      g: 200,
      b: 10,
    });
    const atlas = await composeAtlas([
      { deviceId: 1, jpeg, capturedAt: 1 },
      { deviceId: 2, jpeg: Buffer.from('not-a-jpeg'), capturedAt: 1 },
    ]);
    assert.ok(atlas);
    assert.deepEqual(
      atlas.layout.devices.map((cell) => cell.id),
      [1],
    );
  });

  it('returns undefined when every cell is missing', async () => {
    const atlas = await composeAtlas([]);
    assert.equal(atlas, undefined);
  });
});
