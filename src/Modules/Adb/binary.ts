// Locates the adb executable.
//
// Order: the explicit settings path, then ADB_PATH / ANDROID_HOME /
// ANDROID_SDK_ROOT, then the well-known SDK and package-manager locations, and
// finally a PATH search. The last matters more than it looks: a packaged macOS
// app launched from Finder inherits a minimal PATH without /opt/homebrew/bin,
// so the known-location list is what finds a Homebrew install.
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { AdbStatus } from '../../shared/types';

export interface AdbCandidate {
  Path: string;
  Source: NonNullable<AdbStatus['Source']>;
}

export interface CandidateEnvironment {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  home: string;
}

function platformToolsBinary(root: string, platform: NodeJS.Platform): string {
  return path.join(root, 'platform-tools', platform === 'win32' ? 'adb.exe' : 'adb');
}

/** Every path worth checking, most specific first. Pure: no filesystem access. */
export function CandidateAdbPaths(
  settingsPath: string,
  { platform, env, home }: CandidateEnvironment
): AdbCandidate[] {
  const Out: AdbCandidate[] = [];
  const push = (p: string | undefined | null, Source: AdbCandidate['Source']) => {
    if (!p) return;
    const Normalized = p.trim();
    if (!Normalized || Out.some((c) => c.Path === Normalized)) return;
    Out.push({ Path: Normalized, Source });
  };

  push(settingsPath, 'settings');
  push(env.ADB_PATH, 'environment');
  for (const Root of [env.ANDROID_HOME, env.ANDROID_SDK_ROOT]) {
    if (Root) push(platformToolsBinary(Root, platform), 'environment');
  }

  if (platform === 'win32') {
    const LocalAppData = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    push(
      platformToolsBinary(path.join(LocalAppData, 'Android', 'Sdk'), platform),
      'known-location'
    );
    push(path.join(LocalAppData, 'Android', 'platform-tools', 'adb.exe'), 'known-location');
    push('C:\\platform-tools\\adb.exe', 'known-location');
    push('C:\\adb\\adb.exe', 'known-location');
    if (env.ProgramFiles) {
      push(path.join(env.ProgramFiles, 'Android', 'platform-tools', 'adb.exe'), 'known-location');
    }
  } else if (platform === 'darwin') {
    push(
      platformToolsBinary(path.join(home, 'Library', 'Android', 'sdk'), platform),
      'known-location'
    );
    push('/opt/homebrew/bin/adb', 'known-location');
    push('/usr/local/bin/adb', 'known-location');
    push(path.join(home, 'platform-tools', 'adb'), 'known-location');
  } else {
    push(platformToolsBinary(path.join(home, 'Android', 'Sdk'), platform), 'known-location');
    push('/usr/bin/adb', 'known-location');
    push('/usr/local/bin/adb', 'known-location');
    push(path.join(home, 'platform-tools', 'adb'), 'known-location');
  }

  const PathEntries = (env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  const Names = platform === 'win32' ? ['adb.exe', 'adb'] : ['adb'];
  for (const Dir of PathEntries) {
    for (const Name of Names) push(path.join(Dir, Name), 'path');
  }
  return Out;
}

function isExecutableFile(p: string): boolean {
  try {
    const Stat = fs.statSync(p);
    if (!Stat.isFile()) return false;
    if (process.platform !== 'win32') fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** The first candidate that exists on disk, or null. */
export function ResolveAdbPath(settingsPath: string): AdbCandidate | null {
  const Candidates = CandidateAdbPaths(settingsPath, {
    platform: process.platform,
    env: process.env,
    home: process.env.HOME || os.homedir(),
  });
  for (const Candidate of Candidates) {
    if (isExecutableFile(Candidate.Path)) return Candidate;
  }
  return null;
}
