import type { AppConfig } from '../../shared/types';

const Package = require('../../../package.json') as { version?: string; productName?: string };

export const Config: AppConfig = {
  Application: {
    Version: Package.version || '0.0.0',
    Name: Package.productName || 'AndroidToolkit',
    Platform: process.platform,
  },
};
