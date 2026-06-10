// Rasterize public/icons/icon.svg into the PWA icon set.
// Usage: node scripts/make-icons.mjs
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'public/icons/icon.svg')
const outDir = join(root, 'public/icons')

const svg = await sharp(src, { density: 300 }).png().toBuffer()

await sharp(svg).resize(192, 192).png().toFile(join(outDir, 'icon-192.png'))
await sharp(svg).resize(512, 512).png().toFile(join(outDir, 'icon-512.png'))

// apple-touch-icon: iOS applies its own corner mask, so render the mark on a
// full-bleed background with extra padding instead of our rounded square.
const padded = await sharp(svg)
  .resize(150, 150)
  .extend({ top: 15, bottom: 15, left: 15, right: 15, background: '#0a0a0f' })
  .flatten({ background: '#0a0a0f' })
  .png()
  .toBuffer()
await sharp(padded).resize(180, 180).png().toFile(join(outDir, 'apple-touch-icon.png'))

console.log('icons written: icon-192.png, icon-512.png, apple-touch-icon.png')
