const test = require('node:test');
const assert = require('node:assert/strict');

// DeviceManager against a scripted adb runner: no process, no device.
const { Manager: Adb } = require('../dist/Modules/Adb');
const { Manager: DeviceManager, MergeDevices } = require('../dist/Modules/DeviceManager');
const { Manager: Broadcast } = require('../dist/Modules/Broadcast');
const { ParseDevicesList } = require('../dist/Modules/Adb/parse');

function scriptedRunner(responses) {
  const calls = [];
  const runner = async (args) => {
    calls.push(args);
    const key = args.join(' ');
    for (const [pattern, result] of responses) {
      if (pattern.test(key)) {
        return { Code: 0, Stdout: '', Stderr: '', TimedOut: false, Command: key, ...result };
      }
    }
    return { Code: 1, Stdout: '', Stderr: `unexpected: ${key}`, TimedOut: false, Command: key };
  };
  return { runner, calls };
}

test('MergeDevices keeps enrichment across polls and drops devices adb no longer lists', () => {
  const first = MergeDevices(
    new Map(),
    ParseDevicesList('A\tdevice model:One\nB\tdevice model:Two\n'),
    100
  );
  assert.equal(first.size, 2);
  assert.equal(first.get('A').FirstSeen, 100);

  first.set('A', { ...first.get('A'), Enriched: true, AndroidVersion: '13', BatteryLevel: 50 });
  const second = MergeDevices(first, ParseDevicesList('A\tdevice model:One\nC\toffline\n'), 200);
  assert.deepEqual([...second.keys()], ['A', 'C']);
  assert.equal(second.get('A').AndroidVersion, '13', 'enrichment survives');
  assert.equal(second.get('A').FirstSeen, 100);
  assert.equal(second.get('A').LastSeen, 200);
  assert.equal(second.get('C').State, 'offline');

  // A device that goes unauthorized is re-read when it comes back online.
  const third = MergeDevices(second, ParseDevicesList('A\tunauthorized\n'), 300);
  assert.equal(third.get('A').Enriched, false);
});

test('Poll announces DevicesUpdated only on change and enriches online devices', async () => {
  DeviceManager.ResetForTests();
  const { runner, calls } = scriptedRunner([
    [/^version$/, { Stdout: 'Android Debug Bridge version 1.0.41' }],
    [
      /^devices -l$/,
      {
        Stdout:
          'List of devices attached\nS1\tdevice product:p model:M_1 device:d transport_id:1\n',
      },
    ],
    [
      /^-s S1 shell getprop$/,
      {
        Stdout:
          '[ro.product.manufacturer]: [acme]\n[ro.product.model]: [Tab 10]\n[ro.build.version.release]: [14]\n[ro.build.version.sdk]: [34]\n',
      },
    ],
    [/^-s S1 shell dumpsys battery$/, { Stdout: '  level: 64\n' }],
  ]);
  const previous = Adb.SetRunner(runner);
  const pushes = [];
  const onUpdate = (devices) => pushes.push(devices);
  Broadcast.on('DevicesUpdated', onUpdate);
  try {
    const devices = await DeviceManager.Poll();
    DeviceManager.Stop();
    assert.equal(devices.length, 1);
    assert.equal(devices[0].Serial, 'S1');
    assert.equal(pushes.length, 1, 'first poll announces');

    // Enrichment runs in the background; wait for it.
    for (let i = 0; i < 50 && !DeviceManager.Get('S1').Enriched; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const enriched = DeviceManager.Get('S1');
    assert.equal(enriched.Enriched, true);
    assert.equal(enriched.Manufacturer, 'acme');
    assert.equal(enriched.Model, 'Tab 10');
    assert.equal(enriched.SdkVersion, 34);
    assert.equal(enriched.BatteryLevel, 64);
    assert.equal(pushes.length, 2, 'enrichment announces once');

    await DeviceManager.Poll();
    DeviceManager.Stop();
    assert.equal(pushes.length, 2, 'an unchanged poll is silent');
    assert.ok(calls.some((c) => c.join(' ') === '-s S1 shell getprop'));
  } finally {
    Broadcast.off('DevicesUpdated', onUpdate);
    Adb.SetRunner(previous);
    DeviceManager.ResetForTests();
  }
});

test('Forget drops a device immediately', async () => {
  DeviceManager.ResetForTests();
  const { runner } = scriptedRunner([
    [/^version$/, { Stdout: 'Android Debug Bridge version 1.0.41' }],
    [/^devices -l$/, { Stdout: 'N1\tdevice\n' }],
  ]);
  const previous = Adb.SetRunner(runner);
  try {
    await DeviceManager.Poll();
    DeviceManager.Stop();
    assert.equal(DeviceManager.GetAll().length, 1);
    DeviceManager.Forget('N1');
    assert.equal(DeviceManager.GetAll().length, 0);
  } finally {
    Adb.SetRunner(previous);
    DeviceManager.ResetForTests();
  }
});
