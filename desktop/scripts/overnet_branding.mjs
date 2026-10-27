import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const brandingDir = join(root, "configs", "branding");
const svg = readFileSync(join(brandingDir, "overnet.svg"));
const render = (size) => sharp(svg, { density: Math.max(72, (72 * size) / 1024) }).resize(size, size);

const padded = async (canvas, inner, width = canvas) =>
  sharp({ create: { width, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await render(inner).png().toBuffer(), gravity: "center" }])
    .png();

const wordmark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 56"><text x="0" y="44" font-family="-apple-system, system-ui, sans-serif" font-size="48" font-weight="700" fill="#fff">OverNet</text></svg>`;

for (const brand of ["release", "twilight"]) {
  const dir = join(brandingDir, brand);
  for (const size of [16, 22, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    await render(size).png().toFile(join(dir, `logo${size}.png`));
  }
  await render(1024).png().toFile(join(dir, "logo.png"));
  await (await padded(1024, 824)).toFile(join(dir, "logo-mac.png"));
  await (await padded(270, 160)).toFile(join(dir, "PrivateBrowsing_150.png"));
  await (await padded(126, 76)).toFile(join(dir, "PrivateBrowsing_70.png"));
  await (await padded(1042, 400)).toFile(join(dir, "VisualElements_150.png"));
  await (await padded(1042, 400)).toFile(join(dir, "VisualElements_70.png"));
  const content = join(dir, "content");
  for (const [name, size] of [["about-logo.png", 512], ["about-logo@2x.png", 1024], ["about-logo-private.png", 192], ["about-logo-private@2x.png", 384]]) {
    await render(size).png().toFile(join(content, name));
  }
  writeFileSync(join(content, "about-logo.svg"), svg);
  writeFileSync(join(content, "about-logo-private.svg"), svg);
  writeFileSync(join(content, "about-wordmark.svg"), wordmark);
  writeFileSync(join(content, "firefox-wordmark.svg"), wordmark);
}
