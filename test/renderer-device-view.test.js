const test = require('node:test');
const assert = require('node:assert/strict');

// Pure renderer helpers, loaded from the per-file test compile (dist-test/).
const view = require('../dist-test/UI/js/app/lib/device-view.js');
const { Safe, FormatBytes, FormatAgo, WithFullStop } = require('../dist-test/UI/js/app/utils.js');

function device(overrides) {
  return {
    Serial: 'S1',
    State: 'device',
    Transport: 'usb',
    Address: null,
    Product: null,
    Model: null,
    Device: null,
    TransportId: null,
    Manufacturer: null,
    AndroidVersion: null,
    SdkVersion: null,
    HardwareSerial: null,
    BatteryLevel: null,
    Enriched: false,
    FirstSeen: 0,
    LastSeen: 0,
    ...overrides,
  };
}

test('StatusClassFor maps adb states onto the tile palette', () => {
  assert.equal(view.StatusClassFor('device'), 'ONLINE');
  assert.equal(view.StatusClassFor('offline'), 'OFFLINE');
  assert.equal(view.StatusClassFor('unauthorized'), 'DEGRADED');
  assert.equal(view.StatusClassFor('connecting'), 'IDLE');
  assert.equal(view.StatusClassFor('unknown'), 'OFFLINE');
});

test('DeviceTitle prefers maker + model, avoiding a doubled maker', () => {
  assert.equal(
    view.DeviceTitle(device({ Manufacturer: 'samsung', Model: 'SM-G973F' })),
    'Samsung SM-G973F'
  );
  assert.equal(
    view.DeviceTitle(device({ Manufacturer: 'Google', Model: 'Google Pixel 6' })),
    'Google Pixel 6'
  );
  assert.equal(view.DeviceTitle(device({ Product: 'beyond1' })), 'beyond1');
  assert.equal(view.DeviceTitle(device({})), 'S1');
});

test('DeviceSubtitle shows the address for network devices', () => {
  assert.equal(
    view.DeviceSubtitle(
      device({
        Transport: 'network',
        Serial: '10.0.0.2:5555',
        Address: '10.0.0.2:5555',
        HardwareSerial: 'HW1',
      })
    ),
    '10.0.0.2:5555 · HW1'
  );
  assert.equal(view.DeviceSubtitle(device({})), 'S1');
});

test('DeviceMeta reflects enrichment progress', () => {
  assert.equal(view.DeviceMeta(device({ State: 'offline' })), '');
  assert.equal(view.DeviceMeta(device({})), 'Reading details…');
  assert.equal(
    view.DeviceMeta(device({ Enriched: true, AndroidVersion: '14', SdkVersion: 34 })),
    'Android 14 · API 34'
  );
});

test('GroupDevices orders USB, Network, Emulator and omits empty groups', () => {
  const groups = view.GroupDevices([
    device({ Serial: 'E', Transport: 'emulator' }),
    device({ Serial: 'U' }),
    device({ Serial: 'N', Transport: 'network' }),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.Label, g.Devices.map((d) => d.Serial)]),
    [
      ['USB', ['U']],
      ['Network', ['N']],
      ['Emulators', ['E']],
    ]
  );
  assert.deepEqual(view.GroupDevices([]), []);
});

test('UnconnectedServices hides pairing endpoints and hosts already attached', () => {
  const services = [
    {
      Name: 'a',
      Type: 'connect',
      Host: '10.0.0.2',
      Port: 40000,
      Address: '10.0.0.2:40000',
      Source: 'adb',
      FirstSeen: 0,
      LastSeen: 0,
    },
    {
      Name: 'b',
      Type: 'pairing',
      Host: '10.0.0.3',
      Port: 41000,
      Address: '10.0.0.3:41000',
      Source: 'adb',
      FirstSeen: 0,
      LastSeen: 0,
    },
    {
      Name: 'c',
      Type: 'legacy',
      Host: '10.0.0.4',
      Port: 5555,
      Address: '10.0.0.4:5555',
      Source: 'mdns',
      FirstSeen: 0,
      LastSeen: 0,
    },
  ];
  const devices = [
    device({ Serial: '10.0.0.2:5555', Address: '10.0.0.2:5555', Transport: 'network' }),
  ];
  assert.deepEqual(
    view.UnconnectedServices(services, devices).map((s) => s.Name),
    ['c']
  );
});

test('SummarizeJobs and BusySerials', () => {
  const jobs = [
    { ID: '1', Kind: 'install', Serial: 'A', Status: 'running' },
    { ID: '2', Kind: 'install', Serial: 'B', Status: 'queued' },
    { ID: '3', Kind: 'reboot', Serial: 'C', Status: 'failed' },
    { ID: '4', Kind: 'reboot', Serial: null, Status: 'success' },
  ];
  assert.deepEqual(view.SummarizeJobs(jobs), {
    Running: 1,
    Queued: 1,
    Failed: 1,
    Succeeded: 1,
    Total: 4,
  });
  assert.deepEqual([...view.BusySerials(jobs)].sort(), ['A', 'B']);
});

test('Safe escapes the five significant entities and collapses null', () => {
  assert.equal(Safe(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(Safe(null), '');
  assert.equal(Safe(['<a>', 1]), '&lt;a&gt;,1');
});

test('formatting helpers', () => {
  assert.equal(FormatBytes(512), '512 B');
  assert.equal(FormatBytes(1536), '1.5 KB');
  assert.equal(FormatBytes(52428800), '50 MB');
  assert.equal(FormatAgo(1000, 31000), '30s ago');
  assert.equal(FormatAgo(0, 5 * 60000), '5m ago');
  assert.equal(FormatAgo(null), '');
  assert.equal(WithFullStop('connected to x'), 'connected to x.');
  assert.equal(WithFullStop('Done!'), 'Done!');
});
