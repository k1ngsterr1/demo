import { makeController, nativeFiles, pickAndStage, serverSettings } from '../native/runtime';
import type { ImportServices } from '../features/import/services';

// Exactly one mounted import feature uses this journal namespace.
export const importServices: ImportServices = {
  createController: makeController,
  pickFile: pickAndStage,
  removeFile: file => nativeFiles.remove(file),
  serverSettings,
  initialBaseUrl: process.env.EXPO_PUBLIC_MOCK_URL || 'http://127.0.0.1:8787',
};
