const test = require('node:test');
const assert = require('node:assert/strict');
const { installModuleMocks, matchesModule } = require('./helpers/main-mocks');

// The registrars validate renderer input before any manager runs. Electron is
// stubbed; the managers are real but never reached by the invalid cases.
test('device and action handlers reject malformed renderer input', async () => {
  const handlers = new Map();
  const electronStub = {
    ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
    app: { quit() {} },
    shell: { openExternal: async () => {} },
    dialog: {},
  };
  const restore = installModuleMocks([
    { match: matchesModule('electron/main'), value: electronStub },
    { match: matchesModule('electron'), value: electronStub },
  ]);
  try {
    const { RegisterAllHandlers } = require('../dist/main/registrars');
    RegisterAllHandlers();

    assert.deepEqual(await handlers.get('Devices:Reboot')({}, 'not-a-list', 'system'), [
      'No devices selected',
      null,
    ]);
    assert.deepEqual(await handlers.get('Devices:Reboot')({}, [], 'system'), [
      'No devices selected',
      null,
    ]);
    assert.deepEqual(await handlers.get('Devices:Connect')({}, 42), ['Invalid address', null]);
    assert.deepEqual(await handlers.get('Devices:Pair')({}, '1.2.3.4:1', 7), [
      'Invalid pairing request',
      null,
    ]);
    assert.deepEqual(await handlers.get('FactoryReset:Run')({}, [''], 'auto'), [
      'No devices selected',
      null,
    ]);
    assert.deepEqual(await handlers.get('Apk:Install')({}, ['S1'], '', {}), [
      'No APK chosen',
      null,
    ]);
    assert.deepEqual(await handlers.get('DeviceAdmin:List')({}, null), ['Invalid device', null]);
    assert.deepEqual(await handlers.get('Settings:Set')({}, 'nope'), [
      'Invalid settings payload',
      null,
    ]);

    const { ValidateSerials } = require('../dist/main/registrars/devices');
    assert.deepEqual(ValidateSerials(['a', 'a', '', 3, 'b']), ['a', 'b']);
    assert.equal(ValidateSerials('a'), null);

    const { NormalizeInstallOptions } = require('../dist/main/registrars/actions');
    const defaults = {
      Reinstall: true,
      GrantPermissions: true,
      AllowDowngrade: false,
      AllowTestPackages: false,
    };
    assert.deepEqual(
      NormalizeInstallOptions({ AllowDowngrade: true, Reinstall: 'yes' }, defaults),
      {
        ...defaults,
        AllowDowngrade: true,
      }
    );
  } finally {
    restore();
  }
});
