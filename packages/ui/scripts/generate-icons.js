#!/usr/bin/env node

/**
 * Rasterize `public/logo.svg` into PWA icon PNGs (required for Chrome installability).
 *
 * Optional: pass a different source PNG/SVG:
 *   node scripts/generate-icons.js ./my-1024.png
 */

import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

/** App primary (see packages/ui/src/theme.css) — pad around non-square logos */
const padRgb = { r: 99, g: 102, b: 241 };

const defaultSource = join(__dirname, '../public/logo.svg');

async function generateIcons(sourcePath) {
  if (!existsSync(sourcePath)) {
    console.error(`❌ Source not found: ${sourcePath}`);
    process.exit(1);
  }

  const outputDir = join(__dirname, '../public/icons');
  await mkdir(outputDir, { recursive: true });

  console.log(`Generating PWA icons from ${sourcePath}…`);

  for (const size of sizes) {
    const outputPath = join(outputDir, `icon-${size}x${size}.png`);

    await sharp(sourcePath)
      .resize(size, size, {
        fit: 'contain',
        background: { ...padRgb, alpha: 1 },
      })
      .png()
      .toFile(outputPath);

    console.log(`✓ ${size}x${size}`);
  }

  console.log(`\nDone → ${outputDir}`);
}

const sourcePath = process.argv[2] ?? defaultSource;

generateIcons(sourcePath).catch((err) => {
  console.error(err);
  process.exit(1);
});
