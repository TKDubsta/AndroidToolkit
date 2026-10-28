// Pure parsers for adb's text output. Nothing here touches a process or the
// filesystem, so every format assumption is pinned by test/adb-parse.test.js
// and can be corrected there once real devices are on hand.
import type {
  DeviceAdmin,
  DeviceAdminRole,
  DeviceState,
  DiscoveredService,
  DiscoveredServiceType,
  Transport,
} from '../../shared/types';

const DEVICE_STATES: DeviceState[] = [
  'device',
  'offline',
  'unauthorized',
  'authorizing',
  'connecting',
  'recovery',
  'rescue',
  'sideload',
  'bootloader',
  'no permissions',
];

export interface ParsedDeviceLine {
  Serial: string;
  State: DeviceState;
  Transport: Transport;
  Address: string | null;
  Product: string | null;
  Model: string | null;
  Device: string | null;
  TransportId: string | null;
}

/** Classify a serial: host:port and mDNS instance names are network, emulator-N is an emulator. */
export function ClassifyTransport(serial: string): Transport {
  if (/^emulator-\d+$/i.test(serial)) return 'emulator';
  if (/^\[?[0-9a-f:.]+\]?:\d+$/i.test(serial)) return 'network';
  if (/_adb(-tls-connect)?\._tcp/i.test(serial)) return 'network';
  if (/^adb-.+-[A-Za-z0-9]{6}$/.test(serial)) return 'network';
  return 'usb';
}

/**
 * `adb devices -l`:
 *   List of devices attached
 *   R58M12345AB   device usb:1-2 product:beyond1q model:SM_G973F device:beyond1 transport_id:1
 *   192.168.1.20:5555   device product:x model:y device:z transport_id:3
 *   0123456789   unauthorized transport_id:4
 *   XYZ   no permissions (user in plugdev group; are your udev rules wrong?); see [...]
 */
export function ParseDevicesList(output: string): ParsedDeviceLine[] {
  const Devices: ParsedDeviceLine[] = [];
  for (const RawLine of output.split(/\r?\n/)) {
    const Line = RawLine.trim();
    if (!Line || /^List of devices/i.test(Line) || Line.startsWith('*')) continue;
    const Match = /^(\S+)\s+(.+)$/.exec(Line);
    if (!Match) continue;
    const Serial = Match[1] as string;
    const Rest = (Match[2] as string).trim();

    let State: DeviceState = 'unknown';
    let Fields = Rest;
    if (/^no permissions/i.test(Rest)) {
      State = 'no permissions';
      Fields = '';
    } else {
      const StateToken = Rest.split(/\s+/)[0] as string;
      const Known = DEVICE_STATES.find((s) => s === StateToken.toLowerCase());
      State = Known ?? 'unknown';
      Fields = Rest.slice(StateToken.length).trim();
    }

    const KeyValues: Record<string, string> = {};
    for (const Token of Fields.split(/\s+/)) {
      const Index = Token.indexOf(':');
      if (Index <= 0) continue;
      KeyValues[Token.slice(0, Index)] = Token.slice(Index + 1);
    }

    const Transport = ClassifyTransport(Serial);
    Devices.push({
      Serial,
      State,
      Transport,
      Address: Transport === 'network' && /:\d+$/.test(Serial) ? Serial : null,
      Product: KeyValues.product ?? null,
      Model: KeyValues.model ? KeyValues.model.replace(/_/g, ' ') : null,
      Device: KeyValues.device ?? null,
      TransportId: KeyValues.transport_id ?? null,
    });
  }
  return Devices;
}

/** `getprop` output: `[ro.product.model]: [Pixel 6]` per line. */
export function ParseGetProp(output: string): Record<string, string> {
  const Props: Record<string, string> = {};
  const Pattern = /^\[([^\]]+)\]:\s*\[([^\]]*)\]\s*$/;
  for (const Line of output.split(/\r?\n/)) {
    const Match = Pattern.exec(Line.trim());
    if (Match) Props[Match[1] as string] = Match[2] as string;
  }
  return Props;
}

/** `dumpsys battery`: the `level: NN` line, or null. */
export function ParseBatteryLevel(output: string): number | null {
  const Match = /^\s*level:\s*(\d+)\s*$/m.exec(output);
  if (!Match) return null;
  const Level = Number(Match[1]);
  return Number.isFinite(Level) ? Math.min(100, Math.max(0, Level)) : null;
}

/** First IPv4 address from `ip -f inet addr show wlan0` or `ip route`, or null. */
export function ParseDeviceIPv4(output: string): string | null {
  const Inet = /\binet\s+(\d{1,3}(?:\.\d{1,3}){3})\/\d+/.exec(output);
  if (Inet) return Inet[1] as string;
  const Src = /\bsrc\s+(\d{1,3}(?:\.\d{1,3}){3})\b/.exec(output);
  if (Src) return Src[1] as string;
  return null;
}

export interface InstallOutcome {
  Success: boolean;
  /** INSTALL_FAILED_* code when adb reported one. */
  FailureCode: string | null;
  Message: string;
}

/** `adb install`: `Success`, or `Failure [INSTALL_FAILED_X: detail]` on stdout or stderr. */
export function ParseInstallOutput(stdout: string, stderr: string): InstallOutcome {
  const Combined = `${stdout}\n${stderr}`;
  if (/^\s*Success\s*$/m.test(Combined)) {
    return { Success: true, FailureCode: null, Message: 'Success' };
  }
  const Failure = /Failure\s*\[([^\]]+)\]/.exec(Combined);
  if (Failure) {
    const Body = (Failure[1] as string).trim();
    const Code = /^([A-Z_]+)/.exec(Body);
    return { Success: false, FailureCode: Code ? (Code[1] as string) : null, Message: Body };
  }
  const Lines = Combined.split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^Performing .* Install/i.test(l));
  return {
    Success: false,
    FailureCode: null,
    Message: Lines[Lines.length - 1] || 'Install produced no output',
  };
}

export interface ConnectOutcome {
  Success: boolean;
  AlreadyConnected: boolean;
  Message: string;
}

/** `adb connect host:port`. */
export function ParseConnectOutput(stdout: string, stderr: string): ConnectOutcome {
  const Text = `${stdout}\n${stderr}`.trim();
  if (/^already connected to/im.test(Text)) {
    return { Success: true, AlreadyConnected: true, Message: Text };
  }
  if (/^connected to/im.test(Text)) {
    return { Success: true, AlreadyConnected: false, Message: Text };
  }
  return { Success: false, AlreadyConnected: false, Message: Text || 'No response from adb' };
}

/** `adb pair host:port code`. */
export function ParsePairOutput(
  stdout: string,
  stderr: string
): { Success: boolean; Message: string } {
  const Text = `${stdout}\n${stderr}`.trim();
  return { Success: /Successfully paired/i.test(Text), Message: Text || 'No response from adb' };
}

/** `adb tcpip N`: `restarting in TCP mode port: N`. */
export function ParseTcpipOutput(
  stdout: string,
  stderr: string
): { Success: boolean; Port: number | null; Message: string } {
  const Text = `${stdout}\n${stderr}`.trim();
  const Match = /restarting in TCP mode port:\s*(\d+)/i.exec(Text);
  return {
    Success: Boolean(Match),
    Port: Match ? Number(Match[1]) : null,
    Message: Text || 'No response from adb',
  };
}

const MDNS_TYPE_MAP: Record<string, DiscoveredServiceType> = {
  '_adb-tls-connect._tcp': 'connect',
  '_adb-tls-pairing._tcp': 'pairing',
  '_adb._tcp': 'legacy',
};

/** Map an mDNS service type (with or without a trailing dot/domain) to the discovery type. */
export function ClassifyMdnsType(type: string): DiscoveredServiceType | null {
  const Key = type
    .trim()
    .replace(/\.(local\.?)?$/i, '')
    .replace(/\.$/, '');
  return MDNS_TYPE_MAP[Key] ?? null;
}

/**
 * `adb mdns services`:
 *   List of discovered mdns services
 *   adb-R58M12345AB-AbCdEf	_adb-tls-connect._tcp	192.168.1.20:37099
 */
export function ParseMdnsServices(output: string, now: number): DiscoveredService[] {
  const Services: DiscoveredService[] = [];
  for (const RawLine of output.split(/\r?\n/)) {
    const Line = RawLine.trim();
    if (!Line || /^List of/i.test(Line)) continue;
    const Parts = Line.split(/\t+|\s{2,}|\s+/).filter(Boolean);
    if (Parts.length < 3) continue;
    const [Name, TypeRaw, Address] = Parts as [string, string, string];
    const Type = ClassifyMdnsType(TypeRaw);
    const Match = /^(.+):(\d+)$/.exec(Address);
    if (!Type || !Match) continue;
    Services.push({
      Name,
      Type,
      Host: Match[1] as string,
      Port: Number(Match[2]),
      Address,
      Source: 'adb',
      FirstSeen: now,
      LastSeen: now,
    });
  }
  return Services;
}

const COMPONENT_PATTERN = /([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+)\/(\.?[A-Za-z_][\w.$]*)/;

/**
 * `dumpsys device_policy`. The format varies by Android version, so this walks
 * the text tracking which section it is in (Device Owner / Profile Owner /
 * Enabled Device Admins) and pulls every package/class component it finds.
 * A component seen under several sections keeps its most privileged role.
 */
export function ParseDeviceAdmins(output: string): DeviceAdmin[] {
  const Found = new Map<string, DeviceAdmin>();
  const Rank: Record<DeviceAdminRole, number> = {
    'device-owner': 3,
    'profile-owner': 2,
    'active-admin': 1,
  };
  let Role: DeviceAdminRole | null = null;
  let RoleIndent = 0;
  let UserId: number | null = null;

  for (const RawLine of output.split(/\r?\n/)) {
    const Line = RawLine.trim();
    if (!Line) continue;
    const Indent = RawLine.length - RawLine.trimStart().length;

    // A section header starts a role; anything at or above its indentation
    // that is not itself a header ends it, so nested "policies:" blocks and
    // sibling sections cannot leak components into the wrong role.
    let Header: DeviceAdminRole | null = null;
    if (/^Device Owner\b/i.test(Line)) Header = 'device-owner';
    else if (/^Profile Owner\b/i.test(Line)) Header = 'profile-owner';
    else if (/^(Enabled Device Admins|Active admins|Admins)\b/i.test(Line)) Header = 'active-admin';

    if (Header) {
      Role = Header;
      RoleIndent = Indent;
      const User = /\(User\s+(\d+)/i.exec(Line);
      UserId = User ? Number(User[1]) : Header === 'device-owner' ? 0 : null;
    } else if (Role && Indent <= RoleIndent) {
      Role = null;
    }

    if (!Role) continue;
    const Match = COMPONENT_PATTERN.exec(Line);
    if (!Match) continue;
    const Package = Match[1] as string;
    const Cls = Match[2] as string;
    const Component = `${Package}/${Cls}`;
    const Existing = Found.get(Component);
    if (Existing && Rank[Existing.Role] >= Rank[Role]) continue;
    Found.set(Component, { Component, Package, Role, UserId });
  }
  return [...Found.values()];
}

/** `dpm remove-active-admin`: `Success: Admin removed ...` on success. */
export function ParseRemoveAdminOutput(
  stdout: string,
  stderr: string
): { Success: boolean; Message: string } {
  const Text = `${stdout}\n${stderr}`.trim();
  return { Success: /^Success/im.test(Text), Message: Text || 'No response from adb' };
}

/** `am broadcast`: delivered when `Broadcast completed` appears; permission denials are explicit. */
export function ParseBroadcastOutput(
  stdout: string,
  stderr: string
): { Delivered: boolean; Denied: boolean; Message: string } {
  const Text = `${stdout}\n${stderr}`.trim();
  const Denied = /Permission Denial|SecurityException/i.test(Text);
  return { Delivered: !Denied && /Broadcast completed/i.test(Text), Denied, Message: Text };
}

/** `adb version` first line, e.g. `Android Debug Bridge version 1.0.41`. */
export function ParseAdbVersion(output: string): string | null {
  const Match = /Android Debug Bridge version\s+([\d.]+)/i.exec(output);
  if (Match) return Match[1] as string;
  const Build = /Version\s+([\w.-]+)/i.exec(output);
  return Build ? (Build[1] as string) : null;
}
