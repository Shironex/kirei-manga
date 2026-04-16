import sharp from 'apps/desktop/node_modules/sharp';
import { readFileSync, writeFileSync } from 'fs';

const SUMI = { r: 20, g: 18, b: 14, alpha: 1 };

async function compose(mascotPath, outPath, canvas = 512, mascot = 320) {
  const mascotBuf = readFileSync(mascotPath);
  const resized = await sharp(mascotBuf).resize(mascot, mascot, { kernel: 'lanczos3' }).toBuffer();
  const bg = await sharp({
    create: { width: canvas, height: canvas, channels: 4, background: SUMI },
  })
    .png()
    .toBuffer();
  const composed = await sharp(bg)
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toBuffer();
  writeFileSync(outPath, composed);
  console.log(`wrote ${outPath}`);
}

await compose('assets/chibi_read.png', 'assets/preview_read_on_sumi.png');
await compose('assets/chibi_wave.png', 'assets/preview_wave_on_sumi.png');
