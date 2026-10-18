const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8');
function tokens(block) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(\d+) (\d+) (\d+);/g)]
    .map(([, name, ...rgb]) => [name, rgb.map(Number)]));
}
const defaults = Object.assign({}, ...[...css.matchAll(/:root\s*\{([^}]+)\}/g)].map(match => tokens(match[1])));
const palettes = { light: defaults };
for (const theme of ['dark', 'high-contrast']) {
  const block = css.match(new RegExp(`:root\\[data-theme="${theme}"\\]\\s*\\{([^}]+)\\}`));
  assert.ok(block, `${theme} palette exists`);
  palettes[theme] = { ...defaults, ...tokens(block[1]) };
}
function luminance(rgb) {
  const channels = rgb.map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
for (const [name, palette] of Object.entries(palettes)) {
  test(`${name}: preference text, controls and focus have sufficient contrast`, () => {
    for (const foreground of ['ink', 'body', 'muted', 'link']) {
      for (const background of ['canvas', 'surface', 'sunken']) {
        const ratio = contrast(palette[foreground], palette[background]);
        assert.ok(ratio >= 4.5, `${foreground}/${background}: ${ratio.toFixed(2)}`);
      }
    }
    for (const foreground of ['control', 'focus']) {
      for (const background of ['canvas', 'surface', 'sunken']) {
        const ratio = contrast(palette[foreground], palette[background]);
        assert.ok(ratio >= 3, `${foreground}/${background}: ${ratio.toFixed(2)}`);
      }
    }
    for (const foreground of ['nav-ink', 'nav-muted']) {
      assert.ok(contrast(palette[foreground], palette.nav) >= 4.5);
    }
    assert.ok(contrast([255, 255, 255], palette.primary) >= 4.5);
  });
}
