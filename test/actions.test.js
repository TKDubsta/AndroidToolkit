const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The bulk actions against a scripted runner: one job per device, outcome
// taken from adb's text.
const { Manager: Adb } = require('../dist/Modules/Adb');
const { Manager: Jobs } = require('../dist/Modules/Jobs');
const { InstallApk } = require('../dist/Modules/Actions/apk-deploy');
const { RemoveDeviceAdmins } = require('../dist/Modules/Actions/device-admin');
const { FactoryReset } = require('../dist/Modules/Actions/factory-reset');
const { NormalizeAddress } = require('../dist/Modules/Actions/connectivity');

function scriptedRunner(script) {
  const calls = [];
  const runner = async (args, options = {}) => {
    calls.push(args.join(' '));
    const result = {
      Code: 0,
      Stdout: '',
      Stderr: '',
      TimedOut: false,
      Command: args.join(' '),
      ...script(args.join(' ')),
    };
    if (options.OnOutput && result.Stdout) options.OnOutput(result.Stdout);
    return result;
  };
  return { runner, calls };
}

async function settled(jobIds) {
  for (let i = 0; i < 200; i++) {
    const jobs = jobIds.map((id) => Jobs.Get(id));
    if (jobs.every((j) => j.Status === 'success' || j.Status === 'failed')) return jobs;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('jobs did not settle');
}

test('InstallApk creates a job per device and reads Success / Failure', async () => {
  Jobs.ResetForTests();
  const apk = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'atk-')), 'app.apk');
  fs.writeFileSync(apk, 'not really an apk');
  const { runner, calls } = scriptedRunner((cmd) =>
    cmd.startsWith('-s GOOD')
      ? { Stdout: 'Performing Streamed Install\nSuccess\n' }
      : { Code: 1, Stderr: 'adb: failed to install app.apk: Failure [INSTALL_FAILED_OLDER_SDK]' }
  );
  const previous = Adb.SetRunner(runner);
  try {
    const [err, ids] = await InstallApk(['GOOD', 'BAD'], apk, {
      Reinstall: true,
      GrantPermissions: false,
      AllowDowngrade: false,
      AllowTestPackages: false,
    });
    assert.equal(err, null);
    const [good, bad] = await settled(ids);
    assert.equal(good.Status, 'success');
    assert.equal(good.Serial, 'GOOD');
    assert.equal(bad.Status, 'failed');
    assert.match(bad.Error, /INSTALL_FAILED_OLDER_SDK/);
    assert.ok(calls.includes(`-s GOOD install -r ${apk}`));
  } finally {
    Adb.SetRunner(previous);
    Jobs.ResetForTests();
  }
});

test('InstallApk rejects a missing file before touching adb', async () => {
  const [err] = await InstallApk(['S1'], path.join(os.tmpdir(), 'does-not-exist.apk'), {
    Reinstall: true,
    GrantPermissions: true,
    AllowDowngrade: false,
    AllowTestPackages: false,
  });
  assert.equal(err, 'APK file not found');
});

test('RemoveDeviceAdmins removes owners first and fails the job when adb refuses', async () => {
  Jobs.ResetForTests();
  const dump =
    '  Device Owner:\n    admin=ComponentInfo{com.kiosk/.Admin}\n  Enabled Device Admins (User 0):\n    com.other/.Receiver:\n';
  const { runner, calls } = scriptedRunner((cmd) => {
    if (cmd.endsWith('dumpsys device_policy')) return { Stdout: dump };
    if (cmd.includes('remove-active-admin') && cmd.includes('com.kiosk'))
      return { Stdout: 'Success: Admin removed' };
    return { Code: 255, Stderr: 'java.lang.SecurityException: Attempt to remove non-test admin' };
  });
  const previous = Adb.SetRunner(runner);
  try {
    const [, ids] = await RemoveDeviceAdmins(['S1'], null);
    const [job] = await settled(ids);
    assert.equal(job.Status, 'failed');
    assert.match(job.Error, /1 of 2/);
    const removals = calls.filter((c) => c.includes('remove-active-admin'));
    assert.match(removals[0], /com\.kiosk/, 'the device owner goes first');
    assert.match(removals[1], /com\.other/);
    assert.match(job.Output, /SecurityException/);

    const [, ids2] = await RemoveDeviceAdmins(['S1'], 'com.kiosk/.Admin');
    const [single] = await settled(ids2);
    assert.equal(single.Status, 'success');
  } finally {
    Adb.SetRunner(previous);
    Jobs.ResetForTests();
  }
});

test('FactoryReset auto: a delivered broadcast succeeds; a denial falls back to recovery', async () => {
  Jobs.ResetForTests();
  const { runner, calls } = scriptedRunner((cmd) => {
    if (cmd.startsWith('-s OK') && cmd.includes('FACTORY_RESET'))
      return { Stdout: 'Broadcast completed: result=0' };
    if (cmd.startsWith('-s DENIED') && cmd.includes('broadcast'))
      return { Stderr: 'Permission Denial: not allowed to send broadcast' };
    if (cmd.startsWith('-s DENIED') && cmd.includes('recovery')) return { Stdout: '' };
    return { Stdout: '' };
  });
  const previous = Adb.SetRunner(runner);
  try {
    const [, ids] = await FactoryReset(['OK', 'DENIED'], 'auto');
    const [ok, denied] = await settled(ids);
    assert.equal(ok.Status, 'success');
    assert.ok(
      !calls.some((c) => c.startsWith('-s OK') && c.includes('MASTER_CLEAR')),
      'no fallback once delivered'
    );
    assert.equal(denied.Status, 'success', 'recovery path ran after the denial');
    assert.ok(calls.includes('-s DENIED reboot recovery'));
    assert.ok(calls.includes('-s DENIED shell recovery --wipe_data'));

    const [, ids2] = await FactoryReset(['DENIED'], 'broadcast');
    const [broadcastOnly] = await settled(ids2);
    assert.equal(broadcastOnly.Status, 'failed');
    assert.match(broadcastOnly.Error, /denied/i);
  } finally {
    Adb.SetRunner(previous);
    Jobs.ResetForTests();
  }
});

test('NormalizeAddress defaults the port and rejects junk', () => {
  assert.equal(NormalizeAddress('192.168.1.20', 5555), '192.168.1.20:5555');
  assert.equal(NormalizeAddress(' 192.168.1.20:5556 ', 5555), '192.168.1.20:5556');
  assert.equal(NormalizeAddress('tablet.local', 5555), 'tablet.local:5555');
  assert.equal(NormalizeAddress('', 5555), null);
  assert.equal(NormalizeAddress('not an address', 5555), null);
});
