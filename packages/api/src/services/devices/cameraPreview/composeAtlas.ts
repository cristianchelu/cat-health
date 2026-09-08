import sharp from 'sharp';

export const CAMERA_PREVIEW_CELL_PX = 80;

export type AtlasCellInput = {
  deviceId: number;
  jpeg: Buffer;
  capturedAt: number;
  crop?: { left: number; top: number; width: number; height: number };
  rotate?: number;
};

export type AtlasLayoutDevice = {
  id: number;
  x: number;
  y: number;
};

export type AtlasLayout = {
  generation: number;
  cell_size: number;
  columns: number;
  width: number;
  height: number;
  devices: AtlasLayoutDevice[];
};

export type AtlasResult = {
  jpeg: Buffer;
  layout: AtlasLayout;
};

export const EMPTY_ATLAS_LAYOUT: AtlasLayout = {
  generation: 0,
  cell_size: CAMERA_PREVIEW_CELL_PX,
  columns: 0,
  width: 0,
  height: 0,
  devices: [],
};

function layoutGeneration(cells: readonly AtlasCellInput[]): number {
  let hash = 2166136261;
  for (const cell of cells) {
    const part = `${cell.deviceId}:${cell.capturedAt}`;
    for (let i = 0; i < part.length; i++) {
      hash ^= part.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

function pixelCrop(
  crop: NonNullable<AtlasCellInput['crop']> | undefined,
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } | undefined {
  if (!crop) return undefined;
  const normalized =
    crop.left <= 1 && crop.top <= 1 && crop.width <= 1 && crop.height <= 1;
  const abs = normalized
    ? {
        left: Math.round(crop.left * width),
        top: Math.round(crop.top * height),
        width: Math.round(crop.width * width),
        height: Math.round(crop.height * height),
      }
    : {
        left: Math.round(crop.left),
        top: Math.round(crop.top),
        width: Math.round(crop.width),
        height: Math.round(crop.height),
      };

  const left = Math.min(Math.max(abs.left, 0), Math.max(width - 1, 0));
  const top = Math.min(Math.max(abs.top, 0), Math.max(height - 1, 0));
  const extractWidth = Math.min(Math.max(abs.width, 1), width - left);
  const extractHeight = Math.min(Math.max(abs.height, 1), height - top);
  if (extractWidth < 1 || extractHeight < 1) return undefined;
  return { left, top, width: extractWidth, height: extractHeight };
}

/** One watching device's ROI, square `cover` into a cell. */
export async function renderPreviewCell(
  input: AtlasCellInput,
  cellPx = CAMERA_PREVIEW_CELL_PX,
): Promise<Buffer> {
  const metadata = await sharp(input.jpeg).metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;
  if (sourceWidth < 1 || sourceHeight < 1) {
    throw new Error('Preview frame has no dimensions');
  }

  let pipeline = sharp(input.jpeg);
  const crop = pixelCrop(input.crop, sourceWidth, sourceHeight);
  if (crop) {
    pipeline = pipeline.extract(crop);
  }
  // Sharp runs rotate+resize before extract in one pipeline, which swaps
  // axes and then overflows a landscape ROI. Flatten crop before rotate.
  if (input.rotate) {
    pipeline = sharp(await pipeline.toBuffer()).rotate(input.rotate);
  }
  return pipeline
    .resize(cellPx, cellPx, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 70 })
    .toBuffer();
}

/**
 * Pack watching-device cells left-to-right, top-to-bottom, sorted by device
 * id so a membership change is the only thing that moves neighbours.
 */
export async function composeAtlas(
  inputs: readonly AtlasCellInput[],
  cellPx = CAMERA_PREVIEW_CELL_PX,
): Promise<AtlasResult | undefined> {
  const sorted = [...inputs].sort((a, b) => a.deviceId - b.deviceId);
  const rendered: { deviceId: number; jpeg: Buffer }[] = [];

  for (const input of sorted) {
    try {
      rendered.push({
        deviceId: input.deviceId,
        jpeg: await renderPreviewCell(input, cellPx),
      });
    } catch (error) {
      console.error(
        `[composeAtlas] skipped preview cell for device ${input.deviceId}:`,
        error,
      );
    }
  }

  if (rendered.length === 0) return undefined;

  const columns = Math.ceil(Math.sqrt(rendered.length));
  const rows = Math.ceil(rendered.length / columns);
  const width = columns * cellPx;
  const height = rows * cellPx;
  const devices: AtlasLayoutDevice[] = [];
  const composites: sharp.OverlayOptions[] = [];

  rendered.forEach((cell, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = col * cellPx;
    const y = row * cellPx;
    devices.push({ id: cell.deviceId, x, y });
    composites.push({ input: cell.jpeg, left: x, top: y });
  });

  const jpeg = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 70 })
    .toBuffer();

  return {
    jpeg,
    layout: {
      generation: layoutGeneration(sorted),
      cell_size: cellPx,
      columns,
      width,
      height,
      devices,
    },
  };
}
