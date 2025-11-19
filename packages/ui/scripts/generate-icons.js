#!/usr/bin/env node

/**
 * PWA Icon Generator Script
 * 
 * This script generates PWA icons in multiple sizes from a source image.
 * 
 * Requirements:
 * - Install sharp: npm install -D sharp
 * - Provide a source icon (recommended: 1024x1024 PNG with transparency)
 * 
 * Usage:
 *   node scripts/generate-icons.js <source-image-path>
 * 
 * Example:
 *   node scripts/generate-icons.js ./source-icon.png
 */

import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons(sourcePath) {
    const outputDir = join(__dirname, '../public/icons');

    // Create icons directory if it doesn't exist
    await mkdir(outputDir, { recursive: true });

    console.log('Generating PWA icons...');

    for (const size of sizes) {
        const outputPath = join(outputDir, `icon-${size}x${size}.png`);

        await sharp(sourcePath)
            .resize(size, size, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .png()
            .toFile(outputPath);

        console.log(`✓ Generated ${size}x${size} icon`);
    }

    console.log('\n✅ All icons generated successfully!');
    console.log(`📁 Icons saved to: ${outputDir}`);
}

// Get source image path from command line arguments
const sourcePath = process.argv[2];

if (!sourcePath) {
    console.error('❌ Error: Please provide a source image path');
    console.log('\nUsage: node scripts/generate-icons.js <source-image-path>');
    console.log('Example: node scripts/generate-icons.js ./source-icon.png');
    process.exit(1);
}

generateIcons(sourcePath).catch((error) => {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
});
