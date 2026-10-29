import sharp from "sharp";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

const orbSvg = Buffer.from(svg.toString().replace(/<rect width="1024" height="1024" rx="228" fill="url\(#bg\)"\/>/, ""));
const renderSvg = (source, size) => sharp(source, { density: Math.max(72, (72 * size) / 1024) }).resize(size, size).png().toBuffer();

const bmp = async (image, mirror = false) => {
  const { data, info } = await image.flatten({ background: "#ffffff" }).flop(mirror).raw().toBuffer({ resolveWithObject: true });
  const rowSize = Math.ceil((info.width * 3) / 4) * 4;
  const pixels = Buffer.alloc(rowSize * info.height);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const source = (y * info.width + x) * info.channels;
      const target = (info.height - 1 - y) * rowSize + x * 3;
      pixels[target] = data[source + 2];
      pixels[target + 1] = data[source + 1];
      pixels[target + 2] = data[source];
    }
  }
  const header = Buffer.alloc(54);
  header.write("BM", 0);
  header.writeUInt32LE(54 + pixels.length, 2);
  header.writeUInt32LE(54, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(info.width, 18);
  header.writeInt32LE(info.height, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(pixels.length, 34);
  return Buffer.concat([header, pixels]);
};

const installerWatermark = async () =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314"><defs><linearGradient id="w" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#2B1470"/><stop offset="0.6" stop-color="#140934"/><stop offset="1" stop-color="#07040F"/></linearGradient></defs><rect width="164" height="314" fill="url(#w)"/><text x="82" y="262" text-anchor="middle" font-family="Segoe UI, -apple-system, Helvetica, sans-serif" font-size="25" font-weight="700" fill="#fff" letter-spacing="-0.5">Overwisp</text></svg>`
    )
  ).composite([{ input: await renderSvg(orbSvg, 160), left: 2, top: 30 }]);

const installerHeader = async () =>
  sharp({ create: { width: 150, height: 57, channels: 3, background: "#ffffff" } }).composite([
    { input: await renderSvg(svg, 47), left: 98, top: 5 },
  ]);

const versionInfoNode = (key, value, type, children = []) => {
  const pad = (buffer) => Buffer.concat([buffer, Buffer.alloc((4 - (buffer.length % 4)) % 4)]);
  const keyBuffer = Buffer.from(key + "\0", "utf16le");
  const body = Buffer.concat([pad(Buffer.concat([Buffer.alloc(6), keyBuffer])), pad(value), ...children.map(pad)]);
  body.writeUInt16LE(body.length, 0);
  body.writeUInt16LE(type === 1 ? value.length / 2 : value.length, 2);
  body.writeUInt16LE(type, 4);
  return body;
};

const installerVersionInfo = (fixedFileInfo) =>
  versionInfoNode("VS_VERSION_INFO", fixedFileInfo, 0, [
    versionInfoNode("StringFileInfo", Buffer.alloc(0), 1, [
      versionInfoNode(
        "040904b0",
        Buffer.alloc(0),
        1,
        [
          ["CompanyName", "OverClouds"],
          ["FileDescription", "Overwisp"],
          ["FileVersion", "18.05"],
          ["InternalName", "7zSD.sfx"],
          ["LegalCopyright", "OverClouds"],
          ["OriginalFilename", "7zSD.sfx"],
          ["ProductName", "Overwisp"],
          ["ProductVersion", "18.05"],
        ].map(([name, text]) => versionInfoNode(name, Buffer.from(text + "\0", "utf16le"), 1))
      ),
    ]),
    versionInfoNode("VarFileInfo", Buffer.alloc(0), 1, [versionInfoNode("Translation", Buffer.from([0x09, 0x04, 0xb0, 0x04]), 0)]),
  ]);

const brandInstallerStub = async (stub) => {
  const pe = readFileSync(stub);
  const header = pe.readUInt32LE(0x3c);
  const optional = header + 24;
  const sections = optional + pe.readUInt16LE(header + 20);
  const sectionList = Array.from({ length: pe.readUInt16LE(header + 6) }, (_, index) => {
    const at = sections + 40 * index;
    return { rva: pe.readUInt32LE(at + 12), size: pe.readUInt32LE(at + 16), offset: pe.readUInt32LE(at + 20) };
  });
  const toOffset = (rva) => {
    const section = sectionList.find((item) => rva >= item.rva && rva < item.rva + item.size);
    return rva - section.rva + section.offset;
  };
  const resourceRoot = toOffset(pe.readUInt32LE(optional + 96 + 8 * 2));
  const leaves = [];
  const walk = (directory, path) => {
    const count = pe.readUInt16LE(directory + 12) + pe.readUInt16LE(directory + 14);
    for (let index = 0; index < count; index++) {
      const entry = directory + 16 + 8 * index;
      const id = pe.readUInt32LE(entry);
      const target = pe.readUInt32LE(entry + 4);
      if (target & 0x80000000) {
        walk(resourceRoot + (target & 0x7fffffff), [...path, id]);
      } else {
        const dataEntry = resourceRoot + target;
        leaves.push({ type: path[0], id: path[1], dataEntry, rva: pe.readUInt32LE(dataEntry), size: pe.readUInt32LE(dataEntry + 4) });
      }
    }
  };
  walk(resourceRoot, []);
  const replaced = leaves.filter((leaf) => leaf.type === 3 || leaf.type === 16);
  const start = Math.min(...replaced.map((leaf) => leaf.rva));
  const end = Math.min(...leaves.filter((leaf) => !replaced.includes(leaf) && leaf.rva > start).map((leaf) => leaf.rva));
  const iconSizes = [16, 32, 48, 256];
  const icons = await Promise.all(iconSizes.map((size) => render(size).png({ palette: size > 48, quality: 100, effort: 10 }).toBuffer()));
  const version = leaves.find((leaf) => leaf.type === 16);
  const versionData = pe.subarray(toOffset(version.rva), toOffset(version.rva) + version.size);
  const fixedAt = versionData.indexOf(Buffer.from([0xbd, 0x04, 0xef, 0xfe]));
  const blobs = [...icons, installerVersionInfo(versionData.subarray(fixedAt, fixedAt + 52))];
  let rva = start;
  const placed = blobs.map((blob) => {
    const at = rva;
    rva += Math.ceil(blob.length / 8) * 8;
    return at;
  });
  if (rva > end) {
    throw new Error("installer stub resources do not fit");
  }
  pe.fill(0, toOffset(start), toOffset(end));
  blobs.forEach((blob, index) => blob.copy(pe, toOffset(placed[index])));
  const iconLeaves = replaced.filter((leaf) => leaf.type === 3).sort((a, b) => a.id - b.id);
  if (iconLeaves.length !== icons.length) {
    throw new Error("unexpected installer stub icon count");
  }
  iconLeaves.forEach((leaf, index) => {
    pe.writeUInt32LE(placed[index], leaf.dataEntry);
    pe.writeUInt32LE(icons[index].length, leaf.dataEntry + 4);
  });
  pe.writeUInt32LE(placed[icons.length], version.dataEntry);
  pe.writeUInt32LE(blobs[icons.length].length, version.dataEntry + 4);
  const group = leaves.find((leaf) => leaf.type === 14);
  const groupAt = toOffset(group.rva);
  iconLeaves.forEach((leaf, index) => {
    const entry = groupAt + 6 + 14 * index;
    pe.writeUInt8(iconSizes[index] % 256, entry);
    pe.writeUInt8(iconSizes[index] % 256, entry + 1);
    pe.writeUInt8(0, entry + 2);
    pe.writeUInt8(0, entry + 3);
    pe.writeUInt16LE(1, entry + 4);
    pe.writeUInt16LE(32, entry + 6);
    pe.writeUInt32LE(icons[index].length, entry + 8);
    pe.writeUInt16LE(leaf.id, entry + 12);
  });
  return pe;
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
  writeFileSync(join(dir, "wizWatermark.bmp"), await bmp(await installerWatermark()));
  writeFileSync(join(dir, "wizHeader.bmp"), await bmp(await installerHeader()));
  writeFileSync(join(dir, "wizHeaderRTL.bmp"), await bmp(await installerHeader(), true));
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

const writeSource = (path, data) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
};
const installerStub = join("other-licenses", "7zstub", "firefox", "7zSD.Win32.sfx");
const stubSource = [join(root, "src", installerStub), join(root, "engine", installerStub)].find((path) => existsSync(path));
writeSource(join(root, "src", installerStub), await brandInstallerStub(stubSource));
writeSource(join(root, "src", "toolkit", "mozapps", "installer", "windows", "nsis", "setup.ico"), await ico([256, 48, 32, 16]));
