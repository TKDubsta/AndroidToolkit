const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { CandidateAdbPaths } = require('../dist/Modules/Adb/binary');

test('settings path outranks the environment, which outranks known locations and PATH', () => {
  const candidates = CandidateAdbPaths('/custom/adb', {
    platform: 'darwin',
    home: '/Users/tom',
    env: { ANDROID_HOME: '/sdk', PATH: '/usr/bin:/opt/homebrew/bin' },
  });
  assert.deepEqual(candidates.slice(0, 2), [
    { Path: '/custom/adb', Source: 'settings' },
    { Path: path.join('/sdk', 'platform-tools', 'adb'), Source: 'environment' },
  ]);
  const sources = candidates.map((c) => c.Source);
  assert.ok(sources.indexOf('known-location') < sources.indexOf('path'));
  assert.ok(
    candidates.some((c) => c.Path === '/opt/homebrew/bin/adb' && c.Source === 'known-location')
  );
});

test('Windows candidates use adb.exe and the LOCALAPPDATA SDK', () => {
  const candidates = CandidateAdbPaths('', {
    platform: 'win32',
    home: 'C:\\Users\\tom',
    env: { LOCALAPPDATA: 'C:\\Users\\tom\\AppData\\Local', Path: 'C:\\tools' },
  });
  assert.equal(
    candidates[0].Path,
    path.join('C:\\Users\\tom\\AppData\\Local', 'Android', 'Sdk', 'platform-tools', 'adb.exe')
  );
  assert.ok(
    candidates.some((c) => c.Path === path.join('C:\\tools', 'adb.exe') && c.Source === 'path')
  );
});

test('duplicates and blanks are dropped', () => {
  const candidates = CandidateAdbPaths('  ', {
    platform: 'linux',
    home: '/home/tom',
    env: { ADB_PATH: '/usr/bin/adb', PATH: '/usr/bin' },
  });
  const usrBin = candidates.filter((c) => c.Path === '/usr/bin/adb');
  assert.equal(usrBin.length, 1);
  assert.equal(usrBin[0].Source, 'environment');
  assert.ok(!candidates.some((c) => c.Source === 'settings'));
});
