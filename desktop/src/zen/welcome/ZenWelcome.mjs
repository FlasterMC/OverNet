// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

{
  let lazy = {};

  ChromeUtils.defineESModuleGetters(lazy, {
    AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
    CustomizableUI:
      "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
    AddonRepository: "resource://gre/modules/addons/AddonRepository.sys.mjs",
    SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
  });

  const kZenElementsToIgnore = [
    "zen-browser-background",
    "zen-toast-container",
  ];

  const kEssentialApps = [
    { url: "https://obsidian.md", icon: "obsidian", color: "#7c3aed" },
    { url: "https://discord.com", icon: "discord", color: "#5865f2" },
    { url: "https://trello.com", icon: "trello", color: "#0052cc" },
    { url: "https://slack.com", icon: "slack", color: "#e01e5a" },
    { url: "https://github.com", icon: "github", color: "#57606a" },
    { url: "https://app.tuta.com/", icon: "tuta", color: "#c00002" },
    { url: "https://notion.com", icon: "notion", color: "#37352f" },
    { url: "https://calendar.google.com", icon: "calendar", color: "#4285f4" },
    { url: "https://figma.com", icon: "figma", color: "#f24e1e" },
  ];

  const kAdBlockerId = "uBlock0@raymondhill.net";

  const kImportOnly = !!window.gZenWelcomeImportOnly;
  delete window.gZenWelcomeImportOnly;

  const gChoices = {
    setDefaultBrowser: false,
    essentials: new Set(),
    blockAds: true,
  };

  let _adBlocker;

  async function fetchAdBlocker() {
    if (_adBlocker !== undefined) {
      return _adBlocker;
    }
    try {
      const [found, installed] = await Promise.all([
        lazy.AddonRepository.getAddonsByIDs([kAdBlockerId]),
        lazy.AddonManager.getAddonsByIDs([kAdBlockerId]),
      ]);
      _adBlocker = installed[0] || !found[0]?.sourceURI ? null : found[0];
    } catch (ex) {
      console.error(ex);
      _adBlocker = null;
    }
    return _adBlocker;
  }

  function clearBrowserElements() {
    for (const element of document.getElementById("browser").children) {
      if (kZenElementsToIgnore.includes(element.id)) {
        continue;
      }
      element.style.display = "none";
    }
  }

  function getMotion() {
    return gZenUIManager.motion;
  }

  function animate(...args) {
    return getMotion().animate(...args);
  }

  function parseXUL(xul) {
    return window.MozXULElement.parseXULToFragment(xul);
  }

  function initializeZenWelcome() {
    document.documentElement.setAttribute("zen-welcome-stage", "true");
    const XUL = `
      <html:canvas id="zen-welcome-background" aria-hidden="true"></html:canvas>
      <html:div id="zen-welcome">
        <html:div id="zen-welcome-start">
          <html:h1 id="zen-welcome-title"></html:h1>
          <html:button id="zen-welcome-start-button" data-l10n-id="zen-welcome-get-started"></html:button>
        </html:div>
        <html:div id="zen-welcome-pages">
          <html:div id="zen-welcome-page-sidebar">
            <html:button id="zen-welcome-back" data-l10n-id="zen-welcome-back"></html:button>
            <html:div id="zen-welcome-page-sidebar-content"></html:div>
            <html:div id="zen-welcome-page-sidebar-buttons"></html:div>
          </html:div>
          <html:div id="zen-welcome-page-content"></html:div>
        </html:div>
      </html:div>
    `;
    document.getElementById("browser").appendChild(parseXUL(XUL));
    startAsciiBackground();
    window.MozXULElement.insertFTLIfNeeded("browser/zen-welcome.ftl");
    window.MozXULElement.insertFTLIfNeeded("browser/migrationWizard.ftl");
    window.MozXULElement.insertFTLIfNeeded("browser/zen-migration.ftl");
  }

  var _iconToData = {};

  async function getIconData(iconURL) {
    if (_iconToData[iconURL]) {
      return _iconToData[iconURL];
    }
    const response = await fetch(iconURL);
    if (!response.ok) {
      console.error(`Failed to fetch icon: ${iconURL}`);
      return null;
    }
    const blob = await response.blob();
    const reader = new FileReader();
    const data = await new Promise(resolve => {
      reader.onloadend = () => {
        const base64Data = reader.result.split(",")[1];
        _iconToData[iconURL] = `data:${blob.type};base64,${base64Data}`;
        resolve(_iconToData[iconURL]);
      };
      reader.readAsDataURL(blob);
    });
    return data;
  }

  function createIconWrapper(url) {
    const iconWrapper = document.createElement("div");
    iconWrapper.className = "engine-icon-wrapper";
    const iconBackdrop = document.createElement("img");
    iconBackdrop.className = "engine-icon-backdrop";
    const icon = document.createElement("img");
    icon.className = "engine-icon";
    icon.width = icon.height = 40;
    if (url) {
      icon.src = url;
      iconBackdrop.src = url;
    }
    iconWrapper.append(iconBackdrop, icon);
    return iconWrapper;
  }

  function createOption({ id, group, checked, l10n, text, extra }) {
    const label = document.createElement("label");
    label.className = "zen-welcome-option";
    label.setAttribute("for", id);
    const input = document.createElement("input");
    input.type = "radio";
    input.id = id;
    input.name = group;
    input.checked = !!checked;
    label.appendChild(input);
    const radio = document.createElement("span");
    radio.className = "zen-welcome-option-radio no-squircles";
    label.appendChild(radio);
    if (extra) {
      label.appendChild(extra);
    }
    const labelText = document.createElement("span");
    labelText.className = "zen-welcome-option-label";
    if (l10n) {
      document.l10n.setAttributes(labelText, l10n);
    } else {
      labelText.textContent = text;
    }
    label.appendChild(labelText);
    return label;
  }

  const _startedInstalls = new Set();

  function unpinInstalledAddon(addon) {
    const widgetId =
      addon.id.toLowerCase().replace(/[^a-z0-9_-]/g, "_") + "-browser-action";
    try {
      if (lazy.CustomizableUI.getPlacementOfWidget(widgetId)) {
        lazy.CustomizableUI.addWidgetToArea(
          widgetId,
          lazy.CustomizableUI.AREA_ADDONS
        );
      }
    } catch (ex) {
      console.error(ex);
    }
  }

  function installAddons(addons) {
    for (const addon of addons) {
      if (_startedInstalls.has(addon.id)) {
        continue;
      }
      _startedInstalls.add(addon.id);
      (async () => {
        try {
          const install = await lazy.AddonManager.getInstallForURL(
            addon.sourceURI.spec,
            { name: addon.name, icons: addon.icons }
          );
          await install.install();
          unpinInstalledAddon(addon);
        } catch (ex) {
          console.error(`Failed to install ${addon.id}`, ex);
        }
      })();
    }
  }

  // GradientASCII is ported from React Bits (https://reactbits.dev), MIT + Commons Clause.
  const kGradientAscii = {
    colors: ["#5b21b6", "#faf5ff", "#e2ccff", "#a166ee"],
    shape: 0,
    characters: " =+xX0S8#@",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    cellSize: 18,
    density: 0.8,
    glyphOpacity: 0.85,
    glow: 0.2,
    depthOfField: 0,
    flicker: 0.2,
    softness: 0.5,
    scale: 1,
    flow: 0.5,
    speed: 1,
    gradientOpacity: 0.9,
    grain: 0.08,
    variation: 0,
    scrambleRadius: 0.1,
    clickEffect: 1,
    maxTrail: 24,
    maxClicks: 4,
    clickLife: 1.2,
    trailLife: 0.7,
    trailStep: 0.015,
    introSeconds: 2.4,
    atlasCellWidth: 60,
    atlasCellHeight: 100,
    atlasColumns: 16,
    fontScale: 0.78,
  };

  const kGradientAsciiVertex = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  const kGradientAsciiCommon = `
float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
`;

  const kGradientAsciiField = `#version 300 es
precision highp float;
precision highp int;
uniform float uAspect;
uniform float uTime;
uniform int uShape;
uniform vec3 uRamp[8];
uniform int uCount;
uniform float uScale;
uniform float uSoftness;
uniform float uFlow;
uniform vec2 uSeed;
uniform vec4 uTrail[24];
uniform float uRadius;
uniform vec4 uClicks[4];
uniform int uClickEffect;
uniform float uIntro;
uniform float uFrame;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outAux;
${kGradientAsciiCommon}
vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy) * 2.0 - 1.0;
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(i), f);
  float b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return 0.5 + 0.5 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec3 labToRgb(vec3 lab) {
  float l = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

vec3 encode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 horizon(vec2 p, float time, out float order) {
  float span = 0.5 * max(uAspect, 1.0);
  float x = p.x / span;
  float arch = -0.17 - 0.2 * x * x + 0.02 * sin(time * 0.6);
  float soft = mix(0.05, 0.22, uSoftness);
  float edge = p.y - arch;
  float rim = 0.38 * smoothstep(-soft, 0.42, edge);
  vec2 sun = vec2(0.08 * sin(time * 0.31) * span, 0.58);
  float spread = length((p - sun) / vec2(0.95 * span, 0.75));
  float sky = mix(0.55, 1.0, smoothstep(0.2, 0.95, spread));
  order = clamp(edge * 1.3, 0.0, 1.0);
  return vec3(rim, sky, smoothstep(0.18, 0.62, edge));
}

vec3 pinch(vec2 p, float time, out float order) {
  float span = 0.5 * max(uAspect, 0.75);
  float x = p.x / span;
  float sway = 0.02 * sin(x * 1.7 + time * 0.55);
  float breathe = 1.0 + 0.06 * sin(time * 0.8);
  float width = (0.13 + 0.22 * x * x) * breathe * mix(0.85, 1.2, uSoftness);
  float y = abs(p.y - sway) / width;
  float t = exp(-pow(y, 2.2)) * (0.42 + 0.58 * exp(-x * x * 1.8));
  order = clamp(abs(p.y - sway) * 2.4 + abs(x) * 0.3, 0.0, 1.0);
  return vec3(t, t, 0.0);
}

vec3 rise(vec2 p, float time, out float order) {
  float wide = max(uAspect, 0.9);
  vec2 center = vec2(0.05 * sin(time * 0.45) * wide, -0.7);
  vec2 radius = vec2(0.82 * wide, 0.64 * (1.0 + 0.04 * sin(time * 0.8)));
  float d = length((p - center) / radius);
  float soft = mix(0.6, 1.15, uSoftness);
  float t = clamp(pow(clamp(1.0 - d, 0.0, 1.0), soft) * 1.35, 0.0, 1.0);
  order = clamp((d - 0.2) * 1.3, 0.0, 1.0);
  return vec3(t, t, 0.0);
}

vec3 eclipse(vec2 p, float time, out float order) {
  float fit = min(1.0, uAspect * 1.25);
  float r = 0.23 * fit * (1.0 + 0.015 * sin(time * 0.9));
  float angle = atan(p.y, p.x);
  float rays = noise(vec2(cos(angle), sin(angle)) * 2.2 + time * 0.08) * 0.8 + 0.6;
  float d = length(p) - r;
  float reach = mix(0.07, 0.15, uSoftness) * rays * fit;
  float t = smoothstep(-0.006, 0.006 + 0.02 * uSoftness, d) * exp(-max(d, 0.0) / reach);
  order = clamp(d * 2.0, 0.0, 1.0);
  return vec3(t, t, 0.0);
}

vec4 tone(float t) {
  float x = smoothstep(0.3, 1.0, t) * float(uCount - 1);
  int index = int(floor(x));
  return vec4(mix(uRamp[index], uRamp[min(index + 1, uCount - 1)], fract(x)), smoothstep(0.0, 0.38, t));
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float time = uTime;
  vec2 q = p / uScale;
  vec2 warp = vec2(
    noise(q * 1.6 + uSeed + vec2(0.0, time * 0.3)),
    noise(q * 1.6 + uSeed.yx + vec2(4.3, -time * 0.24))
  ) - 0.5;
  q += warp * uFlow * (uShape == 3 ? 0.04 : 0.18);
  float order = 0.0;
  vec3 shape;
  if (uShape == 0) shape = horizon(q, time, order);
  else if (uShape == 1) shape = pinch(q, time, order);
  else if (uShape == 2) shape = rise(q, time, order);
  else shape = eclipse(q, time, order);

  float reveal = clamp((uIntro * 1.45 - order) / 0.45, 0.0, 1.0);
  reveal = reveal * reveal * (3.0 - 2.0 * reveal);

  float scramble = 0.0;
  for (int i = 0; i < 24; i++) {
    vec4 point = uTrail[i];
    if (point.z <= 0.0) continue;
    vec2 d = p - point.xy;
    scramble = max(scramble, point.z * exp(-dot(d, d) / (uRadius * uRadius)));
  }
  for (int i = 0; i < 4; i++) {
    vec4 c = uClicks[i];
    if (c.w <= 0.0) continue;
    float d = length(p - c.xy);
    if (uClickEffect == 1) {
      scramble = max(scramble, exp(-pow((d - c.z * 0.75) / 0.06, 2.0)) * c.w);
    } else if (uClickEffect == 2) {
      float size = 0.08 + 0.22 * (1.0 - exp(-c.z * 5.0));
      scramble = max(scramble, (1.0 - smoothstep(size * 0.6, size, d)) * c.w);
    }
  }
  vec2 t = clamp(shape.xy * mix(0.7, 1.0, reveal), 0.0, 1.0);
  vec4 mixed = mix(tone(t.x), tone(t.y), shape.z);
  vec3 color = encode(labToRgb(mixed.rgb));
  float alpha = mixed.a * reveal;
  float dither = (hash12(gl_FragCoord.xy + uFrame * 13.7) - 0.5) / 255.0;
  outColor = clamp(vec4(color * alpha + dither, alpha + dither), 0.0, 1.0);
  outAux = vec4(reveal, scramble, 0.0, 1.0);
}`;

  const kGradientAsciiGlyphs = `
uniform sampler2D uField;
uniform sampler2D uAux;
uniform sampler2D uAtlas;
uniform vec2 uResolution;
uniform vec2 uCell;
uniform vec2 uOffset;
uniform vec2 uAtlasGrid;
uniform float uCount;
uniform float uDensity;
uniform float uOpacity;
uniform float uFlicker;
uniform float uDepth;
uniform float uGlyphTime;
uniform float uSeedValue;
${kGradientAsciiCommon}
float sampleGlyph(float index, vec2 local, vec2 coord, float soft) {
  float column = mod(index, uAtlasGrid.x);
  float row = floor(index / uAtlasGrid.x);
  vec2 atlasUv = vec2((column + local.x) / uAtlasGrid.x, (row + 1.0 - local.y) / uAtlasGrid.y);
  vec2 continuous = coord / uAtlasGrid;
  float scale = exp2(soft);
  return textureGrad(uAtlas, atlasUv, dFdx(continuous) * scale, dFdy(continuous) * scale).a;
}

vec4 glyphAt(vec2 px) {
  vec2 coord = (px - uOffset) / uCell;
  vec2 cell = floor(coord);
  vec2 local = coord - cell;
  vec2 uv = clamp(((cell + 0.5) * uCell + uOffset) / uResolution, vec2(0.0), vec2(1.0));
  vec4 field = texture(uField, uv);
  vec4 aux = texture(uAux, uv);
  float value = dot(field.rgb, vec3(0.2126, 0.7152, 0.0722));
  float pick = hash12(cell + uSeedValue * 7.31);
  float level = hash12(cell * 1.73 + 4.1 + uSeedValue);
  float tick = floor(uGlyphTime * 9.0 + level * 9.0);
  float wobble = (hash12(cell * 2.31 + tick * 17.7) - 0.5) * uFlicker * 0.4 + (level - 0.5) * 0.1;
  float tone = clamp(pow(value, 0.75) + wobble, 0.0, 1.0);
  float index = floor(tone * (uCount - 1.0) + 0.5);
  float decode = max(aux.g, 1.0 - aux.r);
  if (decode > 0.02) {
    float frame = floor(uGlyphTime * 20.0);
    if (hash12(cell * 3.7 + frame * 5.3) < decode * 1.25) index = 1.0 + floor(hash12(cell + frame * 1.37) * (uCount - 1.0));
  }
  float present = step(pick, uDensity * mix(1.0, 0.3 + tone * 1.1, 0.55));
  float cutoff = smoothstep(0.03, 0.1, value);
  float focus = step(hash12(cell * 0.71 + 9.2 + uSeedValue), uDepth);
  float coverage = sampleGlyph(index, local, coord, focus * 1.2);
  float alpha = uOpacity * present * cutoff * coverage * mix(1.0, 0.35 + 0.65 * level, 0.55) * (1.0 - focus * 0.5);
  vec3 light = field.rgb * 0.55 + vec3(0.03) * field.a;
  return vec4(light * alpha, 0.6 * field.a * alpha);
}
`;

  const kGradientAsciiHalo = `#version 300 es
precision highp float;
uniform float uDownscale;
in vec2 vUv;
out vec4 outColor;
${kGradientAsciiGlyphs}
void main() {
  outColor = glyphAt(gl_FragCoord.xy * uDownscale);
}`;

  const kGradientAsciiBlur = `#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform vec2 uStep;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec4 sum = texture(uSource, vUv) * 0.2270270270;
  sum += texture(uSource, vUv + uStep * 1.3846153846) * 0.3162162162;
  sum += texture(uSource, vUv - uStep * 1.3846153846) * 0.3162162162;
  sum += texture(uSource, vUv + uStep * 3.2307692308) * 0.0702702703;
  sum += texture(uSource, vUv - uStep * 3.2307692308) * 0.0702702703;
  outColor = sum;
}`;

  const kGradientAsciiComposite = `#version 300 es
precision highp float;
uniform sampler2D uHalo;
uniform float uGlow;
uniform float uGradient;
uniform float uGrain;
uniform float uFrame;
in vec2 vUv;
out vec4 outColor;
${kGradientAsciiGlyphs}
void main() {
  vec4 base = texture(uField, vUv) * uGradient;
  vec4 glyph = glyphAt(gl_FragCoord.xy);
  vec4 halo = texture(uHalo, vUv) * uGlow;
  vec4 color = base + glyph + halo;
  float grain = (hash12(gl_FragCoord.xy + uFrame * vec2(17.0, 59.0)) + hash12(gl_FragCoord.xy * 1.31 + uFrame * 7.0) - 1.0) * uGrain;
  float body = clamp(color.a, 0.0, 1.0);
  color.rgb += grain * (0.25 + body) * 0.5;
  color.a = clamp(color.a, 0.0, 1.0);
  color.rgb = clamp(color.rgb, 0.0, color.a);
  outColor = color;
}`;

  function gradientAsciiToLab(hex) {
    const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = channels.map(value =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    );
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  }

  function gradientAsciiLink(gl, fragmentSource) {
    const shaders = [
      [gl.VERTEX_SHADER, kGradientAsciiVertex],
      [gl.FRAGMENT_SHADER, fragmentSource],
    ].map(([type, source]) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("ZenWelcome: shader", gl.getShaderInfoLog(shader));
      }
      return shader;
    });
    const program = gl.createProgram();
    shaders.forEach(shader => gl.attachShader(program, shader));
    gl.linkProgram(program);
    shaders.forEach(shader => gl.deleteShader(shader));
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(program, i).name.replace(/\[0\]$/, "");
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    return { program, uniforms };
  }

  function gradientAsciiTarget(gl, count) {
    const textures = Array.from({ length: count }, () => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    });
    return { textures, framebuffer: gl.createFramebuffer(), width: 0, height: 0 };
  }

  function gradientAsciiSizeTarget(gl, target, width, height) {
    if (target.width === width && target.height === height) {
      return;
    }
    target.width = width;
    target.height = height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    target.textures.forEach((texture, i) => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, texture, 0);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function gradientAsciiAtlas(gl) {
    const s = kGradientAscii;
    const list = [...new Set(s.characters)];
    const columns = Math.min(s.atlasColumns, list.length);
    const rows = Math.ceil(list.length / columns);
    const canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
    canvas.width = s.atlasCellWidth * columns;
    canvas.height = s.atlasCellHeight * rows;
    const context = canvas.getContext("2d");
    context.font = `300 ${Math.round(s.atlasCellHeight * s.fontScale)}px ${s.fontFamily}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#fff";
    list.forEach((char, index) => {
      context.fillText(
        char,
        (index % columns) * s.atlasCellWidth + s.atlasCellWidth / 2,
        Math.floor(index / columns) * s.atlasCellHeight + s.atlasCellHeight / 2 + 3
      );
    });
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { texture, count: list.length, grid: [columns, rows] };
  }

  const kGradientAsciiIdleFrame = 1000 / 30;

  let stopAsciiBackground = null;

  function startAsciiBackground() {
    const s = kGradientAscii;
    const canvas = document.getElementById("zen-welcome-background");
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) {
      return;
    }
    const field = gradientAsciiLink(gl, kGradientAsciiField);
    const halo = gradientAsciiLink(gl, kGradientAsciiHalo);
    const blur = gradientAsciiLink(gl, kGradientAsciiBlur);
    const composite = gradientAsciiLink(gl, kGradientAsciiComposite);
    if (!field || !halo || !blur || !composite) {
      return;
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(3), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);
    const fieldTarget = gradientAsciiTarget(gl, 2);
    const haloA = gradientAsciiTarget(gl, 1);
    const haloB = gradientAsciiTarget(gl, 1);
    const atlas = gradientAsciiAtlas(gl);
    const ramp = new Float32Array(24);
    s.colors.forEach((color, i) => ramp.set(gradientAsciiToLab(color), i * 3));

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const view = { width: 1, height: 1, ratio: 1 };
    const clickData = new Float32Array(s.maxClicks * 4);
    const clicks = [];
    const trailData = new Float32Array(s.maxTrail * 4);
    const trail = [];
    let time = 0;
    let glyphTime = 0;
    let introClock = reduce ? 1 : 0;
    let frameSeed = 0;
    let grainClock = 0;
    let raf = 0;
    let last = 0;
    let lastDraw = 0;
    let disposed = false;

    const bindGlyphs = (program, width, height) => {
      const u = program.uniforms;
      const cellHeight = s.cellSize * view.ratio;
      const cellWidth = cellHeight * (s.atlasCellWidth / s.atlasCellHeight);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fieldTarget.textures[0]);
      gl.uniform1i(u.uField, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fieldTarget.textures[1]);
      gl.uniform1i(u.uAux, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
      gl.uniform1i(u.uAtlas, 2);
      gl.uniform2f(u.uResolution, width, height);
      gl.uniform2f(u.uCell, cellWidth, cellHeight);
      gl.uniform2f(
        u.uOffset,
        (width - Math.ceil(width / cellWidth) * cellWidth) / 2,
        (height - Math.ceil(height / cellHeight) * cellHeight) / 2
      );
      gl.uniform2f(u.uAtlasGrid, atlas.grid[0], atlas.grid[1]);
      gl.uniform1f(u.uCount, atlas.count);
      gl.uniform1f(u.uDensity, s.density);
      gl.uniform1f(u.uOpacity, s.glyphOpacity);
      gl.uniform1f(u.uFlicker, reduce ? 0 : s.flicker);
      gl.uniform1f(u.uDepth, s.depthOfField);
      gl.uniform1f(u.uGlyphTime, glyphTime);
      gl.uniform1f(u.uSeedValue, s.variation);
    };

    const draw = () => {
      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fieldTarget.framebuffer);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.viewport(0, 0, fieldTarget.width, fieldTarget.height);
      gl.useProgram(field.program);
      const fu = field.uniforms;
      gl.uniform1f(fu.uAspect, view.width / view.height);
      gl.uniform1f(fu.uTime, time);
      gl.uniform1i(fu.uShape, s.shape);
      gl.uniform3fv(fu.uRamp, ramp);
      gl.uniform1i(fu.uCount, s.colors.length);
      gl.uniform1f(fu.uScale, s.scale);
      gl.uniform1f(fu.uSoftness, s.softness);
      gl.uniform1f(fu.uFlow, s.flow);
      gl.uniform2f(fu.uSeed, s.variation * 3.17, s.variation * 1.91);
      gl.uniform4fv(fu.uTrail, trailData);
      gl.uniform1f(fu.uRadius, s.scrambleRadius);
      gl.uniform4fv(fu.uClicks, clickData);
      gl.uniform1i(fu.uClickEffect, s.clickEffect);
      gl.uniform1f(fu.uIntro, introClock);
      gl.uniform1f(fu.uFrame, frameSeed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, haloA.framebuffer);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.viewport(0, 0, haloA.width, haloA.height);
      gl.useProgram(halo.program);
      bindGlyphs(halo, canvas.width, canvas.height);
      gl.uniform1f(halo.uniforms.uDownscale, canvas.width / haloA.width);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.useProgram(blur.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(blur.uniforms.uSource, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, haloB.framebuffer);
      gl.bindTexture(gl.TEXTURE_2D, haloA.textures[0]);
      gl.uniform2f(blur.uniforms.uStep, 1 / haloA.width, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, haloA.framebuffer);
      gl.bindTexture(gl.TEXTURE_2D, haloB.textures[0]);
      gl.uniform2f(blur.uniforms.uStep, 0, 1 / haloA.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(composite.program);
      bindGlyphs(composite, canvas.width, canvas.height);
      const cu = composite.uniforms;
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, haloA.textures[0]);
      gl.uniform1i(cu.uHalo, 3);
      gl.uniform1f(cu.uGlow, s.glow);
      gl.uniform1f(cu.uGradient, s.gradientOpacity);
      gl.uniform1f(cu.uGrain, s.grain);
      gl.uniform1f(cu.uFrame, frameSeed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const resize = () => {
      view.width = Math.max(1, canvas.clientWidth);
      view.height = Math.max(1, canvas.clientHeight);
      view.ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(view.width * view.ratio));
      canvas.height = Math.max(1, Math.round(view.height * view.ratio));
      gradientAsciiSizeTarget(
        gl,
        fieldTarget,
        Math.max(1, Math.round(canvas.width / 2)),
        Math.max(1, Math.round(canvas.height / 2))
      );
      const haloWidth = Math.max(1, Math.round(canvas.width / 4));
      const haloHeight = Math.max(1, Math.round(canvas.height / 4));
      gradientAsciiSizeTarget(gl, haloA, haloWidth, haloHeight);
      gradientAsciiSizeTarget(gl, haloB, haloWidth, haloHeight);
      draw();
      wake();
    };

    const updateInput = dt => {
      trail.forEach(point => (point.age += dt));
      while (trail.length && trail[trail.length - 1].age > s.trailLife) {
        trail.pop();
      }
      for (let i = 0; i < s.maxTrail; i++) {
        const point = trail[i];
        if (!point) {
          trailData[i * 4 + 2] = 0;
          continue;
        }
        const k = 1 - point.age / s.trailLife;
        trailData[i * 4] = point.x;
        trailData[i * 4 + 1] = point.y;
        trailData[i * 4 + 2] = k * k;
      }
      clicks.forEach(click => (click.age += dt));
      while (clicks.length && clicks[clicks.length - 1].age > s.clickLife) {
        clicks.pop();
      }
      for (let i = 0; i < s.maxClicks; i++) {
        const click = clicks[i];
        if (!click) {
          clickData[i * 4 + 3] = 0;
          continue;
        }
        const k = click.age / s.clickLife;
        const envelope = Math.min(1, click.age / 0.08) * (1 - k) * (1 - k);
        clickData[i * 4] = click.x;
        clickData[i * 4 + 1] = click.y;
        clickData[i * 4 + 2] = click.age;
        clickData[i * 4 + 3] = envelope;
      }
    };

    const frame = now => {
      raf = 0;
      if (disposed || document.hidden) {
        return;
      }
      const dt = last ? Math.min(0.05, Math.max(0.001, (now - last) / 1000)) : 1 / 60;
      last = now;
      if (!reduce) {
        time += dt * s.speed * 0.5;
        glyphTime += dt * Math.max(s.speed, 0.15);
      }
      if (introClock < 1) {
        introClock = Math.min(1, introClock + dt / s.introSeconds);
      }
      grainClock += dt;
      if (!reduce && grainClock > 1 / 24) {
        grainClock = 0;
        frameSeed = (frameSeed + 1) % 97;
      }
      updateInput(dt);
      const interacting = introClock < 1 || clicks.length || trail.length;
      if (interacting || now - lastDraw >= kGradientAsciiIdleFrame) {
        lastDraw = now;
        draw();
      }
      if (!reduce || introClock < 1 || clicks.length || trail.length) {
        raf = requestAnimationFrame(frame);
      } else {
        last = 0;
      }
    };

    function wake() {
      if (!raf && !disposed && !document.hidden) {
        raf = requestAnimationFrame(frame);
      }
    }

    const locate = event => {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / Math.max(1, rect.width);
      const y = 1 - (event.clientY - rect.top) / Math.max(1, rect.height);
      return {
        inside: x >= 0 && x <= 1 && y >= 0 && y <= 1,
        x: (x - 0.5) * (rect.width / Math.max(1, rect.height)),
        y: y - 0.5,
      };
    };

    const onPointerMove = event => {
      const pointer = locate(event);
      if (!pointer.inside || reduce) {
        return;
      }
      const head = trail[0];
      const gap = head ? Math.hypot(pointer.x - head.x, pointer.y - head.y) : Infinity;
      if (gap < s.trailStep) {
        return;
      }
      if (head && head.age < 0.1) {
        const steps = Math.min(6, Math.floor(gap / (s.trailStep * 2)));
        for (let i = 1; i <= steps; i++) {
          const k = i / (steps + 1);
          trail.unshift({
            x: head.x + (pointer.x - head.x) * k,
            y: head.y + (pointer.y - head.y) * k,
            age: 0,
          });
        }
      }
      trail.unshift({ x: pointer.x, y: pointer.y, age: 0 });
      trail.length = Math.min(trail.length, s.maxTrail);
      wake();
    };

    const onPointerDown = event => {
      const pointer = locate(event);
      if (!pointer.inside || reduce) {
        return;
      }
      clicks.unshift({ x: pointer.x, y: pointer.y, age: 0 });
      if (clicks.length > s.maxClicks) {
        clicks.pop();
      }
      wake();
    };

    const onVisibility = () => {
      last = 0;
      wake();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    resize();

    stopAsciiBackground = () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("visibilitychange", onVisibility);
      animate(canvas, { opacity: 0 }, { duration: 0.6, ease: "easeOut" }).then(() => {
        [fieldTarget, haloA, haloB].forEach(target => {
          target.textures.forEach(texture => gl.deleteTexture(texture));
          gl.deleteFramebuffer(target.framebuffer);
        });
        gl.deleteTexture(atlas.texture);
        gl.deleteVertexArray(vao);
        [field, halo, blur, composite].forEach(item => gl.deleteProgram(item.program));
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        canvas.remove();
      });
    };
  }

  function removeAsciiBackground() {
    stopAsciiBackground?.();
    stopAsciiBackground = null;
  }

  const kSpring = { type: "spring", bounce: 0.35, visualDuration: 0.35 };
  const kExit = { duration: 0.12, ease: "easeIn" };
  const kFade = { duration: 0.25, ease: "easeOut" };

  class nsZenWelcomePages {
    #index = -1;
    #pages;
    #content = null;
    #renderToken = 0;
    #buttonsToken = 0;

    constructor(pages) {
      this.#pages = pages;
      this.init();
      this.next();
    }

    get textContainer() {
      return document.getElementById("zen-welcome-page-sidebar-content");
    }

    get contentContainer() {
      return document.getElementById("zen-welcome-page-content");
    }

    get buttonsContainer() {
      return document.getElementById("zen-welcome-page-sidebar-buttons");
    }

    get backButton() {
      return document.getElementById("zen-welcome-back");
    }

    get currentPage() {
      return this.#pages[this.#index];
    }

    get content() {
      return this.#content;
    }

    init() {
      document.getElementById("zen-welcome-start").remove();
      const pages = document.getElementById("zen-welcome-pages");
      pages.style.display = "flex";
      animate(pages, { opacity: [0, 1] }, { ...kFade, duration: 0.45 });
      this.backButton.addEventListener("click", () => this.back());
    }

    next() {
      this.currentPage?.commit?.(this.#content);
      this.#show(this.#index + 1, 1);
    }

    back() {
      if (this.#index <= 0) {
        return;
      }
      this.#show(this.#index - 1, -1);
    }

    #show(index, direction) {
      const previous = this.currentPage;
      while (this.#pages[index]?.skip?.()) {
        index += direction;
      }
      if (index < 0) {
        return;
      }
      this.#index = index;
      const page = this.currentPage;
      if (!page) {
        this.finish();
        return;
      }
      previous?.leave?.();
      this.#exit(this.textContainer, { x: [0, -80 * direction] });
      this.#exit(this.contentContainer, {});
      this.backButton.toggleAttribute("disabled", index === 0);
      this.updateButtons();
      this.#renderText(page, direction);
      this.#renderContent(page);
    }

    #exit(container, keyframes) {
      for (const element of container.children) {
        if (element.hasAttribute("exiting")) {
          continue;
        }
        element.setAttribute("exiting", "");
        animate(element, { opacity: [1, 0], ...keyframes }, kExit).then(() =>
          element.remove()
        );
      }
    }

    async #renderText(page, direction) {
      const token = ++this.#renderToken;
      const text = document.createElement("div");
      text.className = "zen-welcome-text";
      const title = document.createElement("h1");
      document.l10n.setAttributes(title, page.title);
      text.appendChild(title);
      for (const id of page.descriptions ?? []) {
        const p = document.createElement("p");
        document.l10n.setAttributes(p, id);
        text.appendChild(p);
      }
      await document.l10n.translateFragment(text);
      if (token !== this.#renderToken) {
        return;
      }
      this.textContainer.appendChild(text);
      animate(
        [...text.children],
        { opacity: [0, 1], x: [120 * direction, 0] },
        {
          ...kSpring,
          bounce: 0.4,
          visualDuration: 0.3,
          delay: getMotion().stagger(0.03),
        }
      );
    }

    #renderContent(page) {
      const content = document.createElement("div");
      content.className = "zen-welcome-page";
      if (page.id) {
        content.setAttribute("page", page.id);
      }
      page.render(content, this);
      this.contentContainer.appendChild(content);
      this.#content = content;
      animate(content, { opacity: [0, 1] }, kFade);
    }

    async updateButtons() {
      const token = ++this.#buttonsToken;
      const fragment = document.createDocumentFragment();
      for (const button of this.currentPage.buttons) {
        const element = document.createElement("button");
        element.className = button.primary
          ? "zen-big-accent-button primary"
          : "zen-big-accent-button";
        document.l10n.setAttributes(element, button.l10n);
        element.addEventListener("click", () => {
          if (button.onclick?.(this) !== false) {
            this.next();
          }
        });
        fragment.appendChild(element);
      }
      await document.l10n.translateFragment(fragment);
      if (token === this.#buttonsToken) {
        this.buttonsContainer.replaceChildren(fragment);
      }
    }

    async finish() {
      ++this.#buttonsToken;
      this.buttonsContainer.replaceChildren();
      this.backButton.toggleAttribute("disabled", true);
      if (!kImportOnly) {
        gZenWorkspaces.reorganizeTabsAfterWelcome();
      }
      const promises = [this.#applyChoices()];
      await animate("#zen-welcome", { opacity: [1, 0] });
      this.contentContainer.remove();
      await Promise.all(promises);
      _iconToData = undefined; // Unload icon data
      document.getElementById("zen-welcome").remove();
      removeAsciiBackground();
      document.documentElement.removeAttribute("zen-welcome-stage");
      unlockWindowSize();
      for (const element of document.getElementById("browser").children) {
        if (kZenElementsToIgnore.includes(element.id)) {
          continue;
        }
        element.style.opacity = 0;
        element.style.removeProperty("display");
      }
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new window.Event("resize")); // To recalculate the layout
      });
      gZenFolders.relayoutCollapsedFolders();
      let elementsToIgnore = kZenElementsToIgnore
        .map(id => `#${id}`)
        .join(", ");
      await animate(`#browser > *:not(${elementsToIgnore})`, {
        opacity: [0, 1],
      });
      _adBlocker = undefined;
      _startedInstalls.clear();
    }

    async #applyChoices() {
      await this.#pinEssentials();
    }

    async #pinEssentials() {
      const apps = kEssentialApps.filter(app =>
        gChoices.essentials.has(app.url)
      );
      if (!apps.length) {
        return;
      }
      await PlacesUtils.history.insertMany(
        apps.map(app => ({
          url: app.url,
          visits: [{ transition: PlacesUtils.history.TRANSITIONS.TYPED }],
        }))
      );
      const { TabStateCache } = ChromeUtils.importESModule(
        "moz-src:///browser/components/sessionstore/TabStateCache.sys.mjs"
      );
      for (const app of apps) {
        const tab = window.gBrowser.addTrustedTab(app.url, {
          inBackground: true,
          createLazyBrowser: true,
        });
        const icon = await getIconData(
          `chrome://browser/content/zen-images/favicons/${app.icon}.svg`
        );
        // Update the persistent tab state cache with |tabData| information.
        TabStateCache.update(tab.linkedBrowser.permanentKey, {
          history: { entries: [{ url: app.url }], index: 0 },
          image: icon,
        });
        gBrowser.setIcon(tab, icon);
        tab.removeAttribute("pending"); // Make it appear loaded
        gZenPinnedTabManager.addToEssentials(tab);
      }
    }
  }

  class ZenSearchEngineStore {
    constructor() {
      this._engines = [];
    }

    async init() {
      const visibleEngines = await lazy.SearchService.getVisibleEngines();
      this.initSpecificEngine(visibleEngines);
    }

    getEngines() {
      return this._engines.filter(
        engine =>
          !(
            engine.name.toLowerCase().includes("wikipedia") ||
            engine.name.toLowerCase().includes("ebay")
          )
      );
    }

    initSpecificEngine(engines) {
      for (const engine of engines) {
        try {
          this._engines.push(this._cloneEngine(engine));
        } catch (e) {
          // Ignore engines that throw an exception when cloning.
          console.error(e);
        }
      }
    }

    getEngineByName(aName) {
      return this._engines.find(engine => engine.name == aName);
    }

    _cloneEngine(aEngine) {
      const clonedObj = {};

      for (const i of ["name", "alias", "_iconURI", "hidden"]) {
        clonedObj[i] = aEngine[i];
      }

      clonedObj.originalEngine = aEngine;

      return clonedObj;
    }

    async getDefaultEngine() {
      let engineName = await lazy.SearchService.getDefault();
      return this.getEngineByName(engineName._name);
    }

    async setDefaultEngine(engine) {
      await lazy.SearchService.setDefault(
        engine.originalEngine,
        lazy.SearchService.CHANGE_REASON.USER
      );
    }
  }

  const kNextButton = { l10n: "zen-generic-next", primary: true };

  const kDefaultBrandImage = "chrome://global/skin/icons/defaultFavicon.svg";

  /**
   * Browsers with data to import, most recently used first.
   *
   * @returns {Promise<object[]>} Sources with `key`, `name`, `image` and
   *   `profiles`, the browser's profiles (`{ id, name }`) or `[null]` for a
   *   browser without any.
   */
  async function getImportableBrowsers() {
    const l10n = new Localization([
      "branding/brand.ftl",
      "browser/migrationWizard.ftl",
      "browser/zen-migration.ftl",
    ]);
    const sources = [];
    await Promise.all(
      MigrationUtils.availableMigratorKeys.map(async key => {
        try {
          const migrator = await MigrationUtils.getMigrator(key);
          if (!migrator?.enabled) {
            return;
          }
          const hasPermissions = await migrator.hasPermissions();
          if (!hasPermissions && !(await migrator.canGetPermissions())) {
            return;
          }
          let profiles = hasPermissions
            ? await migrator.getSourceProfiles()
            : [null];
          if (Array.isArray(profiles) && !profiles.length) {
            return;
          }
          if (!Array.isArray(profiles)) {
            // Single profile browsers report no profile list.
            profiles = [null];
          }
          if (key === "arc") {
            profiles = [
              profiles.find(profile => profile?.id === "Default") ??
                profiles[0],
            ];
          }
          const nameId = migrator.constructor.displayNameL10nID;
          let displayName = nameId;
          try {
            displayName = (await l10n.formatValue(nameId)) || nameId;
          } catch {}
          const lastUsed = (await migrator.getLastUsedDate()).getTime();
          sources.push({
            key,
            name: displayName,
            image: migrator.constructor.brandImage || kDefaultBrandImage,
            lastUsed,
            profiles,
          });
        } catch (ex) {
          console.error(`Could not check the ${key} migrator`, ex);
        }
      })
    );
    return sources.sort((a, b) => b.lastUsed - a.lastUsed);
  }

  /**
   * A browser's card on the import page, followed by its profiles to pick
   * from when it has more than one.
   *
   * @param {object} source One of getImportableBrowsers' entries
   * @param {number} index Its position in the list
   */
  function createImportSource(source, index) {
    const container = document.createElement("div");
    container.className = "zen-welcome-import-source";
    const option = createOption({
      id: "zen-welcome-import-" + index,
      group: "zen-welcome-import",
      text: source.name,
      extra: createIconWrapper(source.image),
    });
    option.querySelector("input").dataset.sourceIndex = index;
    container.appendChild(option);
    if (source.profiles.length > 1) {
      const profiles = document.createElement("div");
      profiles.className = "zen-welcome-import-profiles";
      const list = document.createElement("div");
      list.className = "zen-welcome-import-profiles-list";
      source.profiles.forEach((profile, profileIndex) => {
        const row = document.createElement("label");
        row.className = "zen-welcome-import-profile";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = `zen-welcome-import-profile-${index}`;
        input.value = profileIndex;
        input.checked = profileIndex === 0;
        const check = document.createElement("span");
        check.className = "zen-welcome-import-profile-check no-squircles";
        const text = document.createElement("span");
        text.className = "zen-welcome-import-profile-name";
        text.textContent = profile?.name || profile?.id || source.name;
        row.append(input, check, text);
        list.appendChild(row);
      });
      profiles.appendChild(list);
      container.appendChild(profiles);
    }
    return container;
  }

  function updateExpandedImportSource(content) {
    for (const source of content.querySelectorAll(
      ".zen-welcome-import-source"
    )) {
      source.toggleAttribute(
        "expanded",
        source.querySelector("input[name='zen-welcome-import']").checked
      );
    }
  }

  async function setDefaultBrowser() {
    const shellSvc =
      AppConstants.HAVE_SHELL_SERVICE && window.getShellService();
    if (!shellSvc) {
      return;
    }
    try {
      await shellSvc.setDefaultBrowser(false);
    } catch (ex) {
      console.error(ex);
    }
  }

  function getWelcomePages() {
    return [
      {
        id: "import",
        title: "zen-welcome-import-title",
        descriptions: ["zen-welcome-import-description"],
        buttons: [kNextButton],
        async render(content) {
          content.appendChild(
            createOption({
              id: "zen-welcome-import-no",
              group: "zen-welcome-import",
              l10n: "zen-welcome-import-no",
              checked: true,
            })
          );
          const sources = await getImportableBrowsers();
          if (!content.isConnected) {
            return;
          }
          content.importSources = sources;
          sources.forEach((source, index) => {
            content.appendChild(createImportSource(source, index));
          });
          content.addEventListener("change", event => {
            if (event.target.name === "zen-welcome-import") {
              updateExpandedImportSource(content);
            }
          });
          updateExpandedImportSource(content);
        },
        commit(content) {
          const checked = content.querySelector(
            "input[name='zen-welcome-import']:checked"
          );
          const source = content.importSources?.[checked?.dataset.sourceIndex];
          if (!source) {
            return;
          }
          const profileIndex =
            checked
              .closest(".zen-welcome-import-source")
              .querySelector("input[type='radio'][value]:checked")?.value ?? 0;
          const profile = source.profiles[profileIndex];
          MigrationUtils.showMigrationWizard(window, {
            entrypoint: kImportOnly
              ? MigrationUtils.MIGRATION_ENTRYPOINTS.PREFERENCES
              : MigrationUtils.MIGRATION_ENTRYPOINTS.FIRSTRUN,
            isStartupMigration: !kImportOnly,
            migratorKey: source.key,
            profileId: profile?.id,
          });
        },
      },
      {
        id: "colors",
        title: "zen-welcome-workspace-colors-title",
        descriptions: ["zen-welcome-workspace-colors-description"],
        buttons: [kNextButton],
        render(content) {
          removeAsciiBackground();
          document.getElementById("zen-welcome").setAttribute("themed", "");
          const anchor = document.createElement("div");
          anchor.id = "zen-welcome-workspace-colors-anchor";
          content.appendChild(anchor);
          const panel = gZenThemePicker.panel;
          panel.setAttribute("noautohide", "true");
          panel.setAttribute("consumeoutsideclicks", "false");
          panel.setAttribute("nonnative", "");
          panel.addEventListener(
            "popupshowing",
            () => {
              const panelRect = panel.getBoundingClientRect();
              // 20 is the shadow width * 2
              anchor.style.height =
                panelRect.height -
                (AppConstants.platform == "macosx" ? -90 : 20) +
                "px";
              anchor.style.width = panelRect.width - 20 + "px";
            },
            { once: true }
          );
          PanelMultiView.openPopup(panel, anchor, { position: "overlap" });
        },
        leave() {
          const panel = gZenThemePicker.panel;
          panel.removeAttribute("noautohide");
          panel.removeAttribute("consumeoutsideclicks");
          panel.removeAttribute("nonnative");
          animate(panel, { opacity: [1, 0] }, kExit).then(() => {
            panel.hidePopup();
            panel.removeAttribute("style");
          });
        },
      },
      {
        id: "search",
        title: "zen-welcome-default-search-title",
        descriptions: ["zen-welcome-default-search-description"],
        buttons: [kNextButton],
        async render(content) {
          const engineStore = new ZenSearchEngineStore();
          await engineStore.init();
          const defaultEngine = await lazy.SearchService.getDefault();
          for (const engine of engineStore.getEngines()) {
            const iconWrapper = createIconWrapper();
            engine.originalEngine.getIconURL(96).then(url => {
              for (const img of iconWrapper.children) {
                img.src = url;
              }
            });
            const option = createOption({
              id: "zen-welcome-engine-" + engine.name.replace(/\s+/g, "-"),
              group: "zen-welcome-search-engine",
              text: engine.name,
              checked: engine.name === defaultEngine.name,
              extra: iconWrapper,
            });
            option
              .querySelector("input")
              .addEventListener("change", () =>
                engineStore.setDefaultEngine(engine)
              );
            content.appendChild(option);
          }
        },
      },
      {
        id: "block-ads",
        title: "zen-welcome-block-ads-title",
        descriptions: ["zen-welcome-block-ads-description"],
        buttons: [kNextButton],
        // Nothing to offer once we know the add-on can't be installed.
        skip() {
          return _adBlocker === null;
        },
        async render(content, pages) {
          content.appendChild(
            createOption({
              id: "zen-welcome-block-ads-yes",
              group: "zen-welcome-block-ads",
              l10n: "zen-welcome-block-ads-yes",
              checked: gChoices.blockAds,
            })
          );
          content.appendChild(
            createOption({
              id: "zen-welcome-block-ads-no",
              group: "zen-welcome-block-ads",
              l10n: "zen-welcome-block-ads-no",
              checked: !gChoices.blockAds,
            })
          );
          // The lookup is warmed at startup, so this usually settled long ago.
          if ((await fetchAdBlocker()) === null && content.isConnected) {
            pages.next();
          }
        },
        commit(content) {
          gChoices.blockAds = content.querySelector(
            "#zen-welcome-block-ads-yes"
          ).checked;
          if (gChoices.blockAds && _adBlocker) {
            installAddons([_adBlocker]);
          }
        },
      },
      {
        id: "essentials",
        title: "zen-welcome-essentials-title",
        descriptions: ["zen-welcome-essentials-description"],
        buttons: [
          kNextButton,
          {
            l10n: "zen-welcome-skip",
            onclick(pages) {
              for (const button of pages.content.querySelectorAll(
                ".zen-welcome-essential[selected]"
              )) {
                button.removeAttribute("selected");
              }
            },
          },
        ],
        render(content) {
          content.appendChild(
            parseXUL(`
              <html:div class="zen-welcome-mock-browser">
                <html:div class="zen-welcome-mock-browser-sidebar">
                  <html:div class="zen-welcome-mock-browser-dots">
                    <html:div class="no-squircles"></html:div>
                    <html:div class="no-squircles"></html:div>
                    <html:div class="no-squircles"></html:div>
                  </html:div>
                  <html:div id="zen-welcome-essentials"></html:div>
                  <html:div class="zen-welcome-mock-tab"></html:div>
                  <html:div class="zen-welcome-mock-tab"></html:div>
                </html:div>
              </html:div>
            `)
          );
          const grid = content.querySelector("#zen-welcome-essentials");
          for (const app of kEssentialApps) {
            const button = document.createElement("button");
            button.className = "zen-welcome-essential";
            button.dataset.url = app.url;
            button.style.setProperty(
              "--zen-welcome-app-icon",
              `url("chrome://browser/content/zen-images/favicons/${app.icon}.svg")`
            );
            button.style.setProperty("--zen-welcome-app-color", app.color);
            button.toggleAttribute(
              "selected",
              gChoices.essentials.has(app.url)
            );
            button.addEventListener("click", () => {
              button.toggleAttribute("selected");
            });
            grid.appendChild(button);
          }
        },
        commit(content) {
          gChoices.essentials = new Set(
            [
              ...content.querySelectorAll(".zen-welcome-essential[selected]"),
            ].map(button => button.dataset.url)
          );
        },
      },
      {
        id: "default-browser",
        title: "zen-welcome-default-browser-title",
        descriptions: ["zen-welcome-default-browser-description"],
        buttons: [kNextButton],
        render(content) {
          content.appendChild(
            createOption({
              id: "zen-welcome-set-default-browser",
              group: "zen-welcome-default-browser",
              l10n: "zen-welcome-set-default-browser",
              checked: gChoices.setDefaultBrowser,
            })
          );
          content.appendChild(
            createOption({
              id: "zen-welcome-dont-set-default-browser",
              group: "zen-welcome-default-browser",
              l10n: "zen-welcome-dont-set-default-browser",
              checked: !gChoices.setDefaultBrowser,
            })
          );
        },
        commit(content) {
          gChoices.setDefaultBrowser = content.querySelector(
            "#zen-welcome-set-default-browser"
          ).checked;
          if (gChoices.setDefaultBrowser) {
            setDefaultBrowser();
          }
        },
      },
      {
        id: "finish",
        title: "zen-welcome-start-browsing-title",
        descriptions: ["zen-welcome-start-browsing-description-1"],
        buttons: [{ l10n: "zen-welcome-start-browsing", primary: true }],
        render() {},
      },
    ];
  }

  async function animateInitialStage() {
    const [title1, title2] = await document.l10n.formatValues([
      { id: "zen-welcome-title-line1" },
      { id: "zen-welcome-title-line2" },
    ]);
    const titleElement = document.getElementById("zen-welcome-title");
    for (const line of [title1, title2]) {
      const lineElement = document.createElement("span");
      for (const char of line) {
        if (char === " ") {
          lineElement.append(" ");
          continue;
        }
        const charElement = document.createElement("span");
        charElement.className = "zen-welcome-char";
        charElement.textContent = char;
        lineElement.appendChild(charElement);
      }
      titleElement.append(lineElement, " ");
    }
    const chars = titleElement.querySelectorAll(".zen-welcome-char");
    await animate(
      chars,
      { opacity: [0, 1], y: [50, 0] },
      {
        delay: getMotion().stagger(0.035, { startDelay: 0.8 }),
        type: "spring",
        bounce: 0.3,
        visualDuration: 0.45,
      }
    );
    const button = document.getElementById("zen-welcome-start-button");
    let glassPointer = null;
    let glassFrame = 0;
    const updateGlass = () => {
      glassFrame = 0;
      const rect = button.getBoundingClientRect();
      const x = Math.min(rect.width, Math.max(0, glassPointer.x - rect.left));
      const y = Math.min(rect.height, Math.max(0, glassPointer.y - rect.top));
      button.style.setProperty("--glass-x", `${x}px`);
      button.style.setProperty("--glass-y", `${y}px`);
    };
    const followGlass = event => {
      glassPointer = { x: event.clientX, y: event.clientY };
      glassFrame ||= requestAnimationFrame(updateGlass);
    };
    window.addEventListener("pointermove", followGlass, { passive: true });
    button.addEventListener(
      "click",
      async () => {
        window.removeEventListener("pointermove", followGlass);
        cancelAnimationFrame(glassFrame);
        await animate(
          "#zen-welcome-title .zen-welcome-char, #zen-welcome-start-button",
          { opacity: [1, 0], y: [0, -14] },
          {
            duration: 0.3,
            ease: "easeIn",
            delay: getMotion().stagger(0.012),
          }
        );
        new nsZenWelcomePages(getWelcomePages());
      },
      { once: true }
    );
    await animate(
      button,
      { opacity: [0, 1], y: [20, 0], filter: ["blur(2px)", "blur(0px)"] },
      {
        delay: 0.1,
        type: "spring",
        stiffness: 300,
        damping: 20,
        mass: 1.8,
      }
    );
  }

  const kSizeLockProperties = [
    "min-width",
    "max-width",
    "min-height",
    "max-height",
  ];

  function lockWindowSize(width, height) {
    const style = document.documentElement.style;
    style.setProperty("min-width", `${width}px`, "important");
    style.setProperty("max-width", `${width}px`, "important");
    style.setProperty("min-height", `${height}px`, "important");
    style.setProperty("max-height", `${height}px`, "important");
  }

  function unlockWindowSize() {
    const style = document.documentElement.style;
    for (const property of kSizeLockProperties) {
      style.removeProperty(property);
    }
  }

  function centerWindowOnScreen() {
    window.addEventListener(
      "MozAfterPaint",
      function () {
        const width = Math.min(1200, screen.availWidth);
        const height = Math.min(720, screen.availHeight);
        window.resizeTo(width, height);
        window.focus();
        const appWin = window.docShell.treeOwner
          .QueryInterface(Ci.nsIInterfaceRequestor)
          .getInterface(Ci.nsIAppWindow);
        appWin.rollupAllPopups();
        window.moveTo(
          screen.availLeft + (screen.availWidth - width) / 2,
          screen.availTop + (screen.availHeight - height) / 2
        );
        lockWindowSize(width, height);
      },
      { once: true }
    );
  }

  function startZenWelcome() {
    if (kImportOnly) {
      clearBrowserElements();
      initializeZenWelcome();
      new nsZenWelcomePages(
        getWelcomePages().filter(page => page.id === "import")
      );
      return;
    }
    fetchAdBlocker();
    clearBrowserElements();
    centerWindowOnScreen();
    initializeZenWelcome();
    animateInitialStage();
  }

  startZenWelcome();
}
