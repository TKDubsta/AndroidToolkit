const test = require('node:test');
const assert = require('node:assert/strict');

// Pins the format assumptions in src/Modules/Adb/parse.ts. These were written
// without a device on hand; correct the fixtures here first when real output
// turns out to differ.
const parse = require('../dist/Modules/Adb/parse');

test('ParseDevicesList reads every state and the key:value columns', () => {
  const output = [
    'List of devices attached',
    'R58M12345AB            device usb:1-2 product:beyond1qlteue model:SM_G973F device:beyond1 transport_id:1',
    '192.168.1.20:5555      device product:x model:Pixel_6 device:oriole transport_id:3',
    'emulator-5554          device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64 device:emu64x transport_id:2',
    '0123456789ABCDEF       unauthorized transport_id:4',
    'ZZZZ                   offline',
    'YYYY                   no permissions (user in plugdev group; are your udev rules wrong?); see [http://developer.android.com/tools/device.html]',
    'adb-R58M12345AB-AbCdEf._adb-tls-connect._tcp device product:x model:y device:z transport_id:5',
    '',
  ].join('\n');
  const devices = parse.ParseDevicesList(output);
  assert.equal(devices.length, 7);

  assert.deepEqual(devices[0], {
    Serial: 'R58M12345AB',
    State: 'device',
    Transport: 'usb',
    Address: null,
    Product: 'beyond1qlteue',
    Model: 'SM G973F',
    Device: 'beyond1',
    TransportId: '1',
  });
  assert.equal(devices[1].Transport, 'network');
  assert.equal(devices[1].Address, '192.168.1.20:5555');
  assert.equal(devices[1].Model, 'Pixel 6');
  assert.equal(devices[2].Transport, 'emulator');
  assert.equal(devices[3].State, 'unauthorized');
  assert.equal(devices[4].State, 'offline');
  assert.equal(devices[5].State, 'no permissions');
  assert.equal(devices[6].Transport, 'network');
  assert.equal(devices[6].Address, null, 'an mDNS instance serial carries no host:port');
});

test('ParseDevicesList ignores the header, blank lines and daemon chatter', () => {
  const output =
    '* daemon not running; starting now at tcp:5037\n* daemon started successfully\nList of devices attached\n\n';
  assert.deepEqual(parse.ParseDevicesList(output), []);
});

test('ClassifyTransport', () => {
  assert.equal(parse.ClassifyTransport('emulator-5556'), 'emulator');
  assert.equal(parse.ClassifyTransport('10.0.0.5:5555'), 'network');
  assert.equal(parse.ClassifyTransport('adb-ABC123-xYz123'), 'network');
  assert.equal(parse.ClassifyTransport('R58M12345AB'), 'usb');
});

test('ParseGetProp and EnrichmentFromProps', () => {
  const props = parse.ParseGetProp(
    '[ro.product.manufacturer]: [samsung]\n[ro.product.model]: [SM-G973F]\n[ro.build.version.release]: [12]\n[ro.build.version.sdk]: [31]\n[ro.serialno]: [R58M12345AB]\n[weird line without brackets]\n'
  );
  assert.equal(props['ro.product.model'], 'SM-G973F');
  assert.equal(props['ro.build.version.sdk'], '31');
  assert.equal(Object.keys(props).length, 5);

  const { EnrichmentFromProps } = require('../dist/Modules/DeviceManager');
  const data = EnrichmentFromProps(
    props,
    'Current Battery Service state:\n  AC powered: false\n  level: 87\n  scale: 100\n'
  );
  assert.deepEqual(data, {
    Manufacturer: 'samsung',
    AndroidVersion: '12',
    SdkVersion: 31,
    HardwareSerial: 'R58M12345AB',
    Model: 'SM-G973F',
    BatteryLevel: 87,
  });
});

test('ParseBatteryLevel clamps and tolerates missing output', () => {
  assert.equal(parse.ParseBatteryLevel('  level: 250\n'), 100);
  assert.equal(parse.ParseBatteryLevel(''), null);
  assert.equal(parse.ParseBatteryLevel('level: abc'), null);
});

test('ParseDeviceIPv4 reads `ip addr` and falls back to `ip route`', () => {
  assert.equal(
    parse.ParseDeviceIPv4(
      '30: wlan0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500\n    inet 192.168.1.42/24 brd 192.168.1.255 scope global wlan0\n'
    ),
    '192.168.1.42'
  );
  assert.equal(
    parse.ParseDeviceIPv4('192.168.1.0/24 dev wlan0 proto kernel scope link src 192.168.1.42\n'),
    '192.168.1.42'
  );
  assert.equal(parse.ParseDeviceIPv4('Device "wlan0" does not exist.'), null);
});

test('ParseInstallOutput', () => {
  assert.deepEqual(parse.ParseInstallOutput('Performing Streamed Install\nSuccess\n', ''), {
    Success: true,
    FailureCode: null,
    Message: 'Success',
  });
  const failed = parse.ParseInstallOutput(
    'Performing Streamed Install\n',
    'adb: failed to install app.apk: Failure [INSTALL_FAILED_VERSION_DOWNGRADE: Package Verification Result]\n'
  );
  assert.equal(failed.Success, false);
  assert.equal(failed.FailureCode, 'INSTALL_FAILED_VERSION_DOWNGRADE');
  assert.match(failed.Message, /Package Verification Result/);
  const silent = parse.ParseInstallOutput('', 'error: device offline');
  assert.equal(silent.Success, false);
  assert.equal(silent.Message, 'error: device offline');
});

test('ParseConnectOutput distinguishes connected, already connected and failures', () => {
  assert.deepEqual(parse.ParseConnectOutput('connected to 192.168.1.20:5555\n', ''), {
    Success: true,
    AlreadyConnected: false,
    Message: 'connected to 192.168.1.20:5555',
  });
  assert.equal(
    parse.ParseConnectOutput('already connected to 192.168.1.20:5555', '').AlreadyConnected,
    true
  );
  const failed = parse.ParseConnectOutput(
    'failed to connect to 192.168.1.20:5555: Connection refused\n',
    ''
  );
  assert.equal(failed.Success, false);
  assert.equal(
    parse.ParseConnectOutput('', 'cannot connect to 1.2.3.4:5555: No route to host').Success,
    false
  );
});

test('ParsePairOutput and ParseTcpipOutput', () => {
  assert.equal(
    parse.ParsePairOutput('Successfully paired to 192.168.1.20:37123 [guid=adb-R58M-AbCdEf]', '')
      .Success,
    true
  );
  assert.equal(
    parse.ParsePairOutput('Failed: Wrong password or connection was dropped.', '').Success,
    false
  );
  assert.deepEqual(parse.ParseTcpipOutput('restarting in TCP mode port: 5555\n', ''), {
    Success: true,
    Port: 5555,
    Message: 'restarting in TCP mode port: 5555',
  });
  assert.equal(parse.ParseTcpipOutput('', 'error: no devices/emulators found').Success, false);
});

test('ParseMdnsServices and ClassifyMdnsType', () => {
  const now = 1000;
  const services = parse.ParseMdnsServices(
    'List of discovered mdns services\nadb-R58M12345AB-AbCdEf\t_adb-tls-connect._tcp\t192.168.1.20:37099\nadb-R58M12345AB-AbCdEf\t_adb-tls-pairing._tcp\t192.168.1.20:41000\nlegacy-box\t_adb._tcp\t192.168.1.30:5555\nbogus\t_http._tcp\t192.168.1.9:80\n',
    now
  );
  assert.equal(services.length, 3);
  assert.deepEqual(services[0], {
    Name: 'adb-R58M12345AB-AbCdEf',
    Type: 'connect',
    Host: '192.168.1.20',
    Port: 37099,
    Address: '192.168.1.20:37099',
    Source: 'adb',
    FirstSeen: now,
    LastSeen: now,
  });
  assert.equal(services[1].Type, 'pairing');
  assert.equal(services[2].Type, 'legacy');
  assert.equal(parse.ClassifyMdnsType('_adb-tls-connect._tcp.local.'), 'connect');
  assert.equal(parse.ClassifyMdnsType('_adb._tcp'), 'legacy');
  assert.equal(parse.ClassifyMdnsType('_ssh._tcp'), null);
});

test('ParseDeviceAdmins reads owners and active admins across sections', () => {
  const dump = [
    'Current Device Policy Manager state:',
    '  Device Owner: ',
    '    admin=ComponentInfo{com.example.kiosk/com.example.kiosk.AdminReceiver}',
    '    name=Kiosk',
    '    package=com.example.kiosk',
    '  Profile Owner (User 10): ',
    '    admin=ComponentInfo{com.work.profile/.Receiver}',
    '  Enabled Device Admins (User 0, provisioningState: 3):',
    '    com.example.kiosk/com.example.kiosk.AdminReceiver:',
    '      uid=10123',
    '      policies:',
    '    com.google.android.apps.work.clouddpc/.receivers.CloudDeviceAdminReceiver:',
    '      uid=10100',
    '  Password Policy:',
    '    com.should.not/.Match',
    '',
  ].join('\n');
  const admins = parse.ParseDeviceAdmins(dump);
  assert.deepEqual(
    admins.map((a) => [a.Component, a.Role, a.UserId]),
    [
      ['com.example.kiosk/com.example.kiosk.AdminReceiver', 'device-owner', 0],
      ['com.work.profile/.Receiver', 'profile-owner', 10],
      [
        'com.google.android.apps.work.clouddpc/.receivers.CloudDeviceAdminReceiver',
        'active-admin',
        0,
      ],
    ]
  );
});

test('ParseRemoveAdminOutput and ParseBroadcastOutput', () => {
  assert.equal(
    parse.ParseRemoveAdminOutput('Success: Admin removed ComponentInfo{a/.B}', '').Success,
    true
  );
  assert.equal(
    parse.ParseRemoveAdminOutput(
      '',
      'java.lang.SecurityException: Attempt to remove non-test admin'
    ).Success,
    false
  );
  assert.deepEqual(
    parse.ParseBroadcastOutput(
      'Broadcasting: Intent { act=android.intent.action.FACTORY_RESET }\nBroadcast completed: result=0\n',
      ''
    ),
    {
      Delivered: true,
      Denied: false,
      Message:
        'Broadcasting: Intent { act=android.intent.action.FACTORY_RESET }\nBroadcast completed: result=0',
    }
  );
  const denied = parse.ParseBroadcastOutput(
    '',
    'java.lang.SecurityException: Permission Denial: not allowed to send broadcast android.intent.action.MASTER_CLEAR from pid=1 uid=2000'
  );
  assert.equal(denied.Delivered, false);
  assert.equal(denied.Denied, true);
});

test('ParseAdbVersion', () => {
  assert.equal(
    parse.ParseAdbVersion('Android Debug Bridge version 1.0.41\nVersion 35.0.2-12147458\n'),
    '1.0.41'
  );
  assert.equal(parse.ParseAdbVersion('garbage'), null);
});
