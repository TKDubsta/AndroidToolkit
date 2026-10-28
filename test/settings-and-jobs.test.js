const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

// scripts/run-isolated-tests.js points HOME/APPDATA at a sandbox, so the
// settings file written here never touches real settings.
const {
  Manager: Settings,
  NormalizeSettings,
  DEFAULT_SETTINGS,
} = require('../dist/Modules/SettingsManager');
const { Manager: AppData } = require('../dist/Modules/AppData');
const { Manager: Jobs } = require('../dist/Modules/Jobs');

test('NormalizeSettings fills gaps, clamps numbers and rejects unknown strategies', () => {
  const s = NormalizeSettings({
    PollIntervalMs: 10,
    InstallConcurrency: 99,
    FactoryResetStrategy: 'yolo',
    AdbPath: '  /x/adb ',
  });
  assert.equal(s.PollIntervalMs, 500);
  assert.equal(s.InstallConcurrency, 16);
  assert.equal(s.FactoryResetStrategy, 'auto');
  assert.equal(s.AdbPath, '/x/adb');
  assert.deepEqual(s.InstallDefaults, DEFAULT_SETTINGS.InstallDefaults);
  assert.deepEqual(NormalizeSettings(null), DEFAULT_SETTINGS);
});

test('Settings persist to the app-data file and reload', () => {
  Settings.Reset();
  const next = Settings.Update({
    WirelessPort: 6000,
    InstallDefaults: { GrantPermissions: false },
  });
  assert.equal(next.WirelessPort, 6000);
  assert.equal(next.InstallDefaults.GrantPermissions, false);
  assert.equal(next.InstallDefaults.Reinstall, true, 'a partial nested patch keeps the rest');
  assert.ok(fs.existsSync(AppData.GetSettingsFilePath()));
  Settings.Reset();
  assert.equal(Settings.Get().WirelessPort, 6000);
  Settings.Update({ WirelessPort: 5555 });
});

test('Jobs lifecycle, output cap and ClearFinished', async () => {
  Jobs.ResetForTests();
  const handle = Jobs.Create('install', 'S1', 'Install x');
  assert.equal(Jobs.Get(handle.ID).Status, 'queued');
  handle.Start();
  assert.equal(Jobs.Get(handle.ID).Status, 'running');
  handle.Append('x'.repeat(25000));
  assert.equal(Jobs.Get(handle.ID).Output.length, 20000, 'output is capped to the newest chars');
  handle.Succeed('done');
  assert.equal(Jobs.Get(handle.ID).Status, 'success');
  assert.ok(Jobs.Get(handle.ID).Output.endsWith('done'));

  const failing = Jobs.Create('reboot', 'S2', 'Reboot');
  failing.Fail('nope');
  const running = Jobs.Create('reboot', 'S3', 'Reboot');
  running.Start();

  Jobs.ClearFinished();
  assert.deepEqual(
    Jobs.GetAll().map((j) => j.ID),
    [running.ID]
  );
  Jobs.ResetForTests();
});
