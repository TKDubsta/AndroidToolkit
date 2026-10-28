const test = require('node:test');
const assert = require('node:assert/strict');

const { Commands, FACTORY_RESET_RECEIVER } = require('../dist/Modules/Adb/commands');
const { BroadcastSteps, RecoverySteps } = require('../dist/Modules/Actions/factory-reset');
const { FormatCommand } = require('../dist/Modules/Adb/runner');

test('every per-device command targets the serial with -s', () => {
  for (const args of [
    Commands.GetProp('S1'),
    Commands.Battery('S1'),
    Commands.Tcpip('S1', 5555),
    Commands.Reboot('S1', 'system'),
    Commands.Install('S1', '/a.apk', {
      Reinstall: false,
      GrantPermissions: false,
      AllowDowngrade: false,
      AllowTestPackages: false,
    }),
    Commands.DumpDevicePolicy('S1'),
    Commands.RemoveActiveAdmin('S1', 'a/.B', 0),
    Commands.FactoryResetBroadcast('S1'),
  ]) {
    assert.deepEqual(args.slice(0, 2), ['-s', 'S1']);
  }
});

test('Install maps every option to its adb flag, in a stable order', () => {
  assert.deepEqual(
    Commands.Install('S1', 'C:\\apps\\my app.apk', {
      Reinstall: true,
      GrantPermissions: true,
      AllowDowngrade: true,
      AllowTestPackages: true,
    }),
    ['-s', 'S1', 'install', '-r', '-g', '-d', '-t', 'C:\\apps\\my app.apk']
  );
  assert.deepEqual(
    Commands.Install('S1', 'a.apk', {
      Reinstall: false,
      GrantPermissions: false,
      AllowDowngrade: false,
      AllowTestPackages: false,
    }),
    ['-s', 'S1', 'install', 'a.apk']
  );
});

test('Reboot modes', () => {
  assert.deepEqual(Commands.Reboot('S1', 'system'), ['-s', 'S1', 'reboot']);
  assert.deepEqual(Commands.Reboot('S1', 'recovery'), ['-s', 'S1', 'reboot', 'recovery']);
  assert.deepEqual(Commands.Reboot('S1', 'bootloader'), ['-s', 'S1', 'reboot', 'bootloader']);
});

test('RemoveActiveAdmin passes --user only when a user id is known', () => {
  assert.deepEqual(Commands.RemoveActiveAdmin('S1', 'com.x/.Admin', 10), [
    '-s',
    'S1',
    'shell',
    'dpm',
    'remove-active-admin',
    '--user',
    '10',
    'com.x/.Admin',
  ]);
  assert.deepEqual(Commands.RemoveActiveAdmin('S1', 'com.x/.Admin', null), [
    '-s',
    'S1',
    'shell',
    'dpm',
    'remove-active-admin',
    'com.x/.Admin',
  ]);
});

test('factory reset broadcasts target the system MasterClearReceiver', () => {
  const factory = Commands.FactoryResetBroadcast('S1');
  assert.ok(factory.includes('android.intent.action.FACTORY_RESET'));
  assert.equal(factory[factory.length - 1], FACTORY_RESET_RECEIVER);
  const master = Commands.MasterClearBroadcast('S1');
  assert.ok(master.includes('android.intent.action.MASTER_CLEAR'));
});

test('factory reset strategies run their steps in order', () => {
  assert.deepEqual(
    BroadcastSteps('S1').map((s) => s.Args[2]),
    ['root', 'shell', 'shell']
  );
  assert.deepEqual(
    RecoverySteps('S1').map((s) => s.Args.slice(2).join(' ')),
    ['reboot recovery', 'wait-for-recovery', 'shell recovery --wipe_data']
  );
});

test('connection commands', () => {
  assert.deepEqual(Commands.Connect('10.0.0.2:5555'), ['connect', '10.0.0.2:5555']);
  assert.deepEqual(Commands.Pair('10.0.0.2:41000', '123456'), ['pair', '10.0.0.2:41000', '123456']);
  assert.deepEqual(Commands.Devices(), ['devices', '-l']);
  assert.deepEqual(Commands.MdnsServices(), ['mdns', 'services']);
});

test('FormatCommand quotes only what needs quoting', () => {
  assert.equal(
    FormatCommand('adb', ['-s', 'S1', 'install', 'C:\\my app.apk']),
    'adb -s S1 install "C:\\my app.apk"'
  );
});
