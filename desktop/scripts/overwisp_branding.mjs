import sharp from "sharp";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
const brandingDir = join(root, "configs", "branding");
const svg = readFileSync(join(brandingDir, "overwisp.svg"));
const render = (size) => sharp(svg, { density: Math.max(72, (72 * size) / 1024) }).resize(size, size);

const padded = async (canvas, inner, width = canvas) =>
  sharp({ create: { width, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await render(inner).png().toBuffer(), gravity: "center" }])
    .png();

const ico = async (sizes) => {
  const images = await Promise.all(sizes.map((size) => render(size).png().toBuffer()));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, index) => {
    const entry = 6 + 16 * index;
    header.writeUInt8(size % 256, entry);
    header.writeUInt8(size % 256, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(images[index].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += images[index].length;
  });
  return Buffer.concat([header, ...images]);
};

const wordmark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 56"><text x="0" y="44" font-family="-apple-system, system-ui, sans-serif" font-size="48" font-weight="700" fill="#fff">Overwisp</text></svg>`;

for (const brand of ["release", "twilight"]) {
  const dir = join(brandingDir, brand);
  for (const size of [16, 22, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    await render(size).png().toFile(join(dir, `logo${size}.png`));
  }
  await render(1024).png().toFile(join(dir, "logo.png"));
  await (await padded(1024, 824)).toFile(join(dir, "logo-mac.png"));
  const iconset = join(mkdtempSync(join(tmpdir(), "overwisp-")), "icon.iconset");
  execFileSync("mkdir", [iconset]);
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const name = scale === 1 ? `icon_${size}x${size}.png` : `icon_${size}x${size}@2x.png`;
      await sharp(join(dir, "logo-mac.png")).resize(size * scale, size * scale).png().toFile(join(iconset, name));
    }
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", join(dir, "firefox.icns")]);
  rmSync(join(iconset, ".."), { recursive: true });
  const appIcon = await ico([256, 64, 48, 32, 16]);
  writeFileSync(join(dir, "firefox.ico"), appIcon);
  writeFileSync(join(dir, "firefox64.ico"), appIcon);
  writeFileSync(join(dir, "pbmode.ico"), await ico([16, 32, 48, 64, 128, 256]));
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
