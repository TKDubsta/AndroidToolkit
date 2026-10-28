const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('node:path');

const appleSignIdentity = process.env.APPLE_SIGN_IDENTITY;
const appleSigningKeychain = process.env.APPLE_KEYCHAIN_PATH;
const shouldSignMac = Boolean(appleSignIdentity);
const shouldNotarizeMac =
  shouldSignMac &&
  Boolean(
    process.env.APPLE_API_KEY_PATH &&
    process.env.APPLE_API_KEY_ID &&
    process.env.APPLE_API_ISSUER_ID
  );

module.exports = {
  packagerConfig: {
    asar: true,
    derefSymlinks: true,
    // Keep the asar lean: only dist/, production node_modules and package.json
    // are needed at runtime. Top-level dirs are anchored with a leading slash so
    // nothing inside node_modules is matched by accident.
    ignore: [
      /^\/src($|\/)/,
      /^\/scripts($|\/)/,
      /^\/build($|\/)/,
      /^\/test($|\/)/,
      /^\/test-support($|\/)/,
      /^\/dist-test($|\/)/,
      /^\/coverage($|\/)/,
      /^\/\.github($|\/)/,
      /^\/\.husky($|\/)/,
      /^\/\.vscode($|\/)/,
      /^\/\.claude($|\/)/,
      /^\/tsconfig.*\.json$/,
      /^\/eslint\.config\.mjs$/,
      /^\/\.prettier/,
      /^\/\.gitignore$/,
      /^\/(README|TODO)\.md$/,
      /^\/package-lock\.json$/,
      /\.map$/,
      /\.DS_Store$/,
    ],
    executableName: 'android-toolkit',
    // Extensionless so Electron Packager picks .icns on macOS and .ico on Windows.
    icon: './src/images/icon',
    ...(shouldSignMac
      ? {
          osxSign: {
            identity: appleSignIdentity,
            ...(appleSigningKeychain ? { keychain: appleSigningKeychain } : {}),
            hardenedRuntime: true,
            entitlements: path.resolve(__dirname, 'build/entitlements.mac.plist'),
            entitlementsInherit: path.resolve(__dirname, 'build/entitlements.mac.plist'),
            gatekeeperAssess: false,
            strictVerify: true,
          },
        }
      : {}),
    ...(shouldNotarizeMac
      ? {
          osxNotarize: {
            tool: 'notarytool',
            appleApiKey: process.env.APPLE_API_KEY_PATH,
            appleApiKeyId: process.env.APPLE_API_KEY_ID,
            appleApiIssuer: process.env.APPLE_API_ISSUER_ID,
          },
        }
      : {}),
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        // Control Panel > Programs and Features icon; must be a URL to an ICO.
        iconUrl:
          'https://raw.githubusercontent.com/TKDubsta/AndroidToolkit/main/src/images/icon.ico',
        setupIcon: './src/images/icon.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are applied at package time, before code signing.
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
