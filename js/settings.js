// Graphics presets + persisted user settings

const DPR = Math.min(window.devicePixelRatio || 1, 3);

export const PRESETS = {
  potato: {
    label: 'Potato', blurb: 'Runs on a toaster. Looks like one too.',
    pixelRatio: 0.5, shadows: false, shadowSize: 256, shadowRange: 0, shadowSoft: false,
    drawDistance: 75, texSize: 128, anisotropy: 1,
    post: false, bloom: false, ao: false, aa: 'none', grade: false,
    grassDensity: 0, grassDistance: 0, flowerDensity: 0,
    treeDetailDist: 18, detailProps: false, particles: 0.35, lampLights: false, envMap: false, decals: 20,
  },
  low: {
    label: 'Low', blurb: 'Basic shadows, short view distance.',
    pixelRatio: 0.75, shadows: true, shadowSize: 512, shadowRange: 28, shadowSoft: false,
    drawDistance: 115, texSize: 256, anisotropy: 2,
    post: false, bloom: false, ao: false, aa: 'none', grade: false,
    grassDensity: 0.18, grassDistance: 26, flowerDensity: 0.2,
    treeDetailDist: 35, detailProps: true, particles: 0.6, lampLights: false, envMap: true, decals: 40,
  },
  normal: {
    label: 'Normal', blurb: 'Balanced. The way Nonna intended.',
    pixelRatio: 1, shadows: true, shadowSize: 1024, shadowRange: 42, shadowSoft: false,
    drawDistance: 170, texSize: 512, anisotropy: 4,
    post: true, bloom: true, ao: false, aa: 'fxaa', grade: true,
    grassDensity: 0.6, grassDistance: 42, flowerDensity: 0.5,
    treeDetailDist: 60, detailProps: true, particles: 1, lampLights: false, envMap: true, decals: 70,
  },
  high: {
    label: 'High', blurb: 'Soft shadows, SMAA, lush grass.',
    pixelRatio: Math.min(DPR, 1.5), shadows: true, shadowSize: 2048, shadowRange: 58, shadowSoft: true,
    drawDistance: 240, texSize: 1024, anisotropy: 8,
    post: true, bloom: true, ao: false, aa: 'smaa', grade: true,
    grassDensity: 0.8, grassDistance: 55, flowerDensity: 0.8,
    treeDetailDist: 95, detailProps: true, particles: 1.3, lampLights: false, envMap: true, decals: 110,
  },
  ultra: {
    label: 'Ultra', blurb: 'Ambient occlusion, native resolution, huge view distance.',
    pixelRatio: Math.min(DPR, 2), shadows: true, shadowSize: 4096, shadowRange: 75, shadowSoft: true,
    drawDistance: 320, texSize: 1024, anisotropy: 16,
    post: true, bloom: true, ao: true, aa: 'smaa', grade: true,
    grassDensity: 1.2, grassDistance: 70, flowerDensity: 1,
    treeDetailDist: 140, detailProps: true, particles: 1.6, lampLights: true, envMap: true, decals: 160,
  },
  blowup: {
    label: 'Blow Up Your Computer', blurb: 'Supersampled, 8K shadows, every blade of grass. Fire extinguisher not included.',
    pixelRatio: Math.min(DPR * 1.5, 3), shadows: true, shadowSize: 8192, shadowRange: 105, shadowSoft: true,
    drawDistance: 520, texSize: 2048, anisotropy: 16,
    post: true, bloom: true, ao: true, aa: 'smaa', grade: true,
    grassDensity: 2.4, grassDistance: 105, flowerDensity: 1.6,
    treeDetailDist: 300, detailProps: true, particles: 2.2, lampLights: true, envMap: true, decals: 260,
  },
};
export const PRESET_ORDER = ['potato', 'low', 'normal', 'high', 'ultra', 'blowup'];

const DEFAULTS = {
  preset: 'normal',
  overrides: {},          // advanced tweaks layered over the preset
  sprintMode: 'hold',     // 'hold' | 'toggle'
  sensitivity: 1.0,
  adsSensitivity: 0.8,
  invertY: false,
  fov: 80,
  volume: 0.8,
  ambientVolume: 0.5,
  showFps: false,
  headBob: 1.0,
  crosshairColor: '#7dff6a',
  crosshairDot: false,
  difficulty: 'normal',   // easy | normal | hard
  mode: 'tdm',            // ffa | tdm
  botCount: 9,
  teamSize: 5,
  roundsToWin: 5,
  playerName: 'You',
  touchControls: 'auto',  // auto | on | off
  touchSens: 1.0,
};

const KEY = 'strikecounter1.settings.v1';

export const settings = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return Object.assign({}, DEFAULTS, JSON.parse(raw));
  } catch (e) { /* storage blocked */ }
  const s = Object.assign({}, DEFAULTS);
  // first run on a phone/tablet: start on a lighter preset
  try { if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) s.preset = 'low'; } catch (e) { /* ignore */ }
  return s;
}

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}

// ---- device limits: phones/tablets have strict memory caps (Safari kills the tab) ----
export function isMobileDevice() {
  try {
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) return true;
  } catch (e) { /* ignore */ }
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod|Android/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
export const DEVICE = { mobile: isMobileDevice(), maxTexture: 16384 };
export const MOBILE_CAPS = { pixelRatio: 1.5, shadowSize: 4096, texSize: 1024, grassDensity: 1.4, drawDistance: 360 };

export function gfx() {
  const base = PRESETS[settings.preset] || PRESETS.normal;
  const g = Object.assign({}, base, settings.overrides || {});
  if (DEVICE.mobile) {
    g.pixelRatio = Math.min(g.pixelRatio, MOBILE_CAPS.pixelRatio);
    g.shadowSize = Math.min(g.shadowSize, MOBILE_CAPS.shadowSize);
    g.shadowRange = Math.min(g.shadowRange, 80);
    g.texSize = Math.min(g.texSize, MOBILE_CAPS.texSize);
    g.grassDensity = Math.min(g.grassDensity, MOBILE_CAPS.grassDensity);
    g.grassDistance = Math.min(g.grassDistance, 75);
    g.drawDistance = Math.min(g.drawDistance, MOBILE_CAPS.drawDistance);
    g.treeDetailDist = Math.min(g.treeDetailDist, 140);
  }
  g.shadowSize = Math.min(g.shadowSize, DEVICE.maxTexture);
  return g;
}

// ---- crash-loop guard ----------------------------------------------------
// Before risky work (boot, graphics changes, starting a match) we write a
// "pending" marker; after a few seconds of smooth rendering we clear it. If the
// page dies in between (out of memory, GPU crash), the next launch sees the
// marker and drops back to the last preset that worked.
const BOOT_KEY = 'strikecounter1.boot.v1';
function readBoot() { try { return JSON.parse(localStorage.getItem(BOOT_KEY) || 'null'); } catch (e) { return null; } }
function writeBoot(b) { try { localStorage.setItem(BOOT_KEY, JSON.stringify(b)); } catch (e) { /* ignore */ } }
function sig() { return settings.preset + ':' + JSON.stringify(settings.overrides || {}); }

export function markPending() {
  const b = readBoot() || {};
  writeBoot({ pending: true, sig: sig(), lastGood: b.lastGood || null });
}
export function markGood() { writeBoot({ pending: false, sig: sig(), lastGood: settings.preset }); }

// returns a message if we had to recover from a crash
export function bootGuard() {
  const b = readBoot();
  if (!b || !b.pending) return null;
  const idx = (p) => PRESET_ORDER.indexOf(p);
  const cur = settings.preset;
  const crashed = PRESETS[cur] ? PRESETS[cur].label : cur;
  let next = b.lastGood && PRESETS[b.lastGood] && idx(b.lastGood) < idx(cur) ? b.lastGood : PRESET_ORDER[Math.max(0, idx(cur) - 2)];
  if (!Object.keys(settings.overrides || {}).length && next === cur) next = 'potato';
  settings.preset = next;
  settings.overrides = {};
  saveSettings();
  writeBoot({ pending: false, sig: sig(), lastGood: b.lastGood && idx(b.lastGood) <= idx(next) ? b.lastGood : null });
  return `Strike Counter didn't finish loading last time on “${crashed}”, so graphics were lowered to “${PRESETS[next].label}”. You can change this in Settings.`;
}

export function resetAllSettings() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(BOOT_KEY); } catch (e) { /* ignore */ }
}

// Bot skill. Angles in degrees, times in seconds.
//  reaction: delay before the first shot after spotting you
//  aimError -> errorFloor: aim wobble right after acquiring you, shrinking (trackGain) toward the floor
//  turnSpeed: rad/s · sniperSettle: how long a sniper must stand still & scoped before firing
//  flinch: extra wobble when they get hit · slack: how sloppy a shot they'll take (rad)
export const DIFFICULTY = {
  easy:   { reaction: [0.7, 1.1], aimError: 4.8, errorFloor: 1.15, turnSpeed: 2.8, trackGain: 0.45, burst: [2, 4], firePause: [0.3, 0.65], slack: 0.13, dodgeChance: 0.1, spotRate: 0.6, sniperSettle: [1.9, 2.9], flinch: 3.2, headChance: 0.03, recoilComp: 0.95 },
  normal: { reaction: [0.42, 0.72], aimError: 3.3, errorFloor: 0.75, turnSpeed: 4.6, trackGain: 0.75, burst: [3, 5], firePause: [0.25, 0.55], slack: 0.07, dodgeChance: 0.3, spotRate: 0.9, sniperSettle: [1.2, 1.9], flinch: 2.2, headChance: 0.18, recoilComp: 0.65 },
  hard:   { reaction: [0.25, 0.42], aimError: 2.1, errorFloor: 0.4, turnSpeed: 7.0, trackGain: 1.1, burst: [4, 8], firePause: [0.15, 0.4], slack: 0.05, dodgeChance: 0.5, spotRate: 1.25, sniperSettle: [0.75, 1.15], flinch: 1.5, headChance: 0.4, recoilComp: 0.4 },
};
