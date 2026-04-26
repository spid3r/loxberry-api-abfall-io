/**
 * Renders the four LoxBerry-required PNG sizes (64/128/256/512) from a single
 * high-res source. LoxBerry maps overview icons to:
 *   /system/images/icons/<PLUGIN_NAME>/icon_64.png
 * and the overview widget is picky about having real small assets.
 *
 * We pick the largest dimension icon under icons/ as the source, or icons/icon_512.png.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const iconsDir = path.join(root, "icons");

const sizes = [64, 128, 256, 512];

async function pickSource() {
  const candidates = [
    "icon_512.png",
    "icon_256.png",
    "icon_128.png",
    "icon_64.png",
  ].map((f) => path.join(iconsDir, f));

  let best = null;
  let bestArea = 0;
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const m = await sharp(file).metadata();
    const area = (m.width || 0) * (m.height || 0);
    if (area > bestArea) {
      bestArea = area;
      best = file;
    }
  }
  if (!best) {
    throw new Error("No source PNG under icons/ (expected icon_512.png or similar).");
  }
  return best;
}

async function main() {
  const source = await pickSource();
  const sourceBuf = fs.readFileSync(source);
  for (const size of sizes) {
    const out = path.join(iconsDir, `icon_${size}.png`);
    await sharp(sourceBuf)
      .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(out);
    console.log(`Wrote ${path.relative(root, out)}`);
  }
  // Public + auth UIs: LoxBerry docs / overview helpers expect a small icon in html
  const small = await sharp(sourceBuf)
    .resize(64, 64, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  for (const rel of ["webfrontend/html/icon_64.png", "webfrontend/htmlauth/icon_64.png"]) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, small);
    console.log(`Wrote ${rel}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
