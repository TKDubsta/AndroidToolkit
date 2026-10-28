const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The set of RPC.handle('...') registrations under src/main/registrars must
// equal INVOKE_CHANNELS: a handler without an allowlist entry is unreachable
// from the renderer, and a dead allowlist entry is a lie about the surface.
const { INVOKE_CHANNELS, SUBSCRIBE_CHANNELS } = require('../dist/Modules/IPCRegistry/channels');

function collectHandled(dir) {
  const found = new Set();
  for (const file of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const match of text.matchAll(/RPC\.handle\(\s*'([^']+)'/g)) found.add(match[1]);
  }
  return found;
}

test('every registered handler is allowlisted, and vice versa', () => {
  const handled = collectHandled(path.join(__dirname, '..', 'src', 'main', 'registrars'));
  const declared = new Set(INVOKE_CHANNELS);
  assert.deepEqual([...handled].sort(), [...declared].sort());
});

test('the preload allowlists mirror the registry', () => {
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'bridge_main.ts'), 'utf8');
  for (const channel of INVOKE_CHANNELS)
    assert.ok(preload.includes(`'${channel}'`), `preload lacks ${channel}`);
  for (const channel of SUBSCRIBE_CHANNELS)
    assert.ok(preload.includes(`'${channel}'`), `preload lacks ${channel}`);
});

test('the push channels main.ts forwards are all declared', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
  const forwarded = /for \(const Channel of \[([^\]]+)\]\)/
    .exec(main)[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''));
  for (const channel of forwarded)
    assert.ok(SUBSCRIBE_CHANNELS.includes(channel), `${channel} is not a subscribe channel`);
});
