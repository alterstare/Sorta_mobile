// Android app icons + splash from the Sorta logo (`sorta icon.png`, 1024²,
// the same art as the PC app):
//   mipmap-*/ic_launcher.png            legacy icon, rounded square (as on the PC)
//   mipmap-*/ic_launcher_round.png      legacy round icon
//   mipmap-*/ic_launcher_foreground.png adaptive icon layer (108dp): the whole
//                                       logo fills the 72dp visible part, its
//                                       edges stretched outwards for the margin
//   drawable-*/splash.png               launch screen before Android 12
// Every size is rendered on its own from the full-size art (area-averaged,
// small sizes sharpened), so the halftone dots blend into tone instead of
// breaking into blotches.
//   node scripts/make-icons.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const res = join(root, 'android/app/src/main/res')
const SIZE = 1024
const RADIUS = 0.22 // corner radius / side, as the PC app's icon
const BG = '#f4f5f8' // the app's light background
const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }

const art = await sharp(readFileSync(join(root, 'sorta icon.png'))).resize(SIZE, SIZE).ensureAlpha().png().toBuffer()
const masked = async (svgShape) =>
  sharp(art)
    .composite([{ input: Buffer.from(`<svg width="${SIZE}" height="${SIZE}">${svgShape}</svg>`), blend: 'dest-in' }])
    .png()
    .toBuffer()
// Small sizes: the S is thin purple stripes on lavender, which average out to
// a pale tint. A purple layer whose opacity is the stripes' local density
// (gamma-lifted) keeps its top-to-bottom fade but reads at icon size.
const { data: px, info } = await sharp(art).raw().toBuffer({ resolveWithObject: true })
const purple = Buffer.alloc(info.width * info.height)
for (let i = 0; i < purple.length; i++) {
  const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2]
  purple[i] = b > r + 40 && b > g + 60 ? 255 : 0
}
const density = await sharp(purple, { raw: { width: info.width, height: info.height, channels: 1 } }).blur(6).extractChannel(0).raw().toBuffer()
const overlay = Buffer.alloc(info.width * info.height * 4)
for (let i = 0; i < info.width * info.height; i++) {
  overlay.set([0x71, 0x32, 0xf5, Math.round(255 * Math.pow(density[i] / 255, 0.55))], i * 4)
}
const bold = await sharp(art)
  .composite([{ input: overlay, raw: { width: info.width, height: info.height, channels: 4 } }])
  .png()
  .toBuffer()
const BOLD_BELOW = Infinity // launcher icons always show small on screen: all use the bold S (the splash keeps the stripes)

const roundedOf = (src) =>
  sharp(src)
    .composite([{ input: Buffer.from(`<svg width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="${SIZE * RADIUS}" ry="${SIZE * RADIUS}" fill="#fff"/></svg>`), blend: 'dest-in' }])
    .png()
    .toBuffer()
const roundOf = (src) =>
  sharp(src)
    .composite([{ input: Buffer.from(`<svg width="${SIZE}" height="${SIZE}"><circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}" fill="#fff"/></svg>`), blend: 'dest-in' }])
    .png()
    .toBuffer()
const roundedBold = await roundedOf(bold)
const roundBold = await roundOf(bold)
const rounded = await masked(`<rect width="${SIZE}" height="${SIZE}" rx="${SIZE * RADIUS}" ry="${SIZE * RADIUS}" fill="#fff"/>`)
const round = await masked(`<circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}" fill="#fff"/>`)

// One size from the big art: linear-light area averaging, a little sharpening
// and contrast on the small ones so the "S" stays readable.
async function render(src, n) {
  let img = sharp(src).resize(n, n, { kernel: n <= 96 ? 'lanczos3' : 'mitchell' })
  if (n <= 144) img = img.sharpen({ sigma: 0.5 })
  return img.png({ compressionLevel: 9 }).toBuffer()
}

for (const [d, k] of Object.entries(DENSITY)) {
  const dir = join(res, `mipmap-${d}`)
  mkdirSync(dir, { recursive: true })
  const legacy = Math.round(48 * k)
  const small = legacy < BOLD_BELOW
  writeFileSync(join(dir, 'ic_launcher.png'), await render(small ? roundedBold : rounded, legacy))
  writeFileSync(join(dir, 'ic_launcher_round.png'), await render(small ? roundBold : round, legacy))
  // adaptive foreground: 108dp, the logo in the middle 72dp; the margin (seen
  // only while the launcher animates) is the logo enlarged and blurred
  const full = Math.round(108 * k)
  const inner = Math.round(72 * k)
  const pad = Math.floor((full - inner) / 2)
  const logo = await render(inner < BOLD_BELOW ? bold : art, inner)
  const back = await sharp(art).resize(full, full).blur(Math.max(1, full / 24)).png().toBuffer()
  const fg = await sharp(back)
    .composite([{ input: logo, left: pad, top: pad }])
    .png({ compressionLevel: 9 })
    .toBuffer()
  writeFileSync(join(dir, 'ic_launcher_foreground.png'), fg)
}

// Launch screen (before Android 12; 12+ shows the adaptive icon itself).
const SPLASH = {
  'port-mdpi': [320, 480],
  'port-hdpi': [480, 800],
  'port-xhdpi': [720, 1280],
  'port-xxhdpi': [960, 1600],
  'port-xxxhdpi': [1280, 1920],
  'land-mdpi': [480, 320],
  'land-hdpi': [800, 480],
  'land-xhdpi': [1280, 720],
  'land-xxhdpi': [1600, 960],
  'land-xxxhdpi': [1920, 1280]
}
for (const [d, [w, h]] of Object.entries(SPLASH)) {
  const n = Math.round(Math.min(w, h) * 0.32)
  const logo = await render(rounded, n)
  const png = await sharp({ create: { width: w, height: h, channels: 4, background: BG } })
    .composite([{ input: logo, left: Math.round((w - n) / 2), top: Math.round((h - n) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer()
  mkdirSync(join(res, `drawable-${d}`), { recursive: true })
  writeFileSync(join(res, `drawable-${d}`, 'splash.png'), png)
}
writeFileSync(
  join(res, 'drawable/splash.png'),
  await sharp({ create: { width: 480, height: 800, channels: 4, background: BG } })
    .composite([{ input: await render(rounded, 154), left: 163, top: 323 }])
    .png()
    .toBuffer()
)
console.log('icons + splash written')
