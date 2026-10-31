import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';
import { HttpApi } from '../core/api';
import { ImportController, type Files, type Store } from '../core/controller';
import { Fault, isStagedId, MAX_BYTES, type LocalFile } from '../core/model';
import { inspectFile } from '../core/validation';
import { migrateStoredJournal } from './journal';
import { parsePendingCancellations, type PendingCancellationStore } from '../core/cancellations';
import { createServerSettings } from './settings';

const STORAGE_KEY = 'synthetic-import-journal-v1';
const CANCELLATIONS_KEY = 'synthetic-import-cancellations-v1';
export const serverSettings = createServerSettings(AsyncStorage);
const staging = new Directory(Paths.cache, 'statement-import');
function ensureStaging(): void {
  staging.create({ idempotent: true, intermediates: true });
}
function stagedFile(local: LocalFile): File {
  if (!isStagedId(local.stagedId)) {
    throw new Fault('file-missing');
  }
  return new File(staging, local.stagedId);
}

function clearPickerCopies(): void {
  const pickerCache = new Directory(Paths.cache, 'DocumentPicker');
  if (pickerCache.exists) {
    pickerCache.delete();
  }
  if (Platform.OS === 'ios') {
    // UIDocumentPicker(asCopy: true) also imports into our app's tmp/*-Inbox.
    // Only touch app-owned Inbox directories, never the external provider URL.
    const temporary = new Directory(Paths.document.parentDirectory, 'tmp');
    if (temporary.exists) {
      for (const entry of temporary.list()) {
        if (entry instanceof Directory && entry.name.endsWith('-Inbox')) {
          entry.delete();
        }
      }
    }
    const inbox = new Directory(Paths.document, 'Inbox');
    if (inbox.exists) {
      inbox.delete();
    }
  }
}

async function inspect(file: File, declaredSize?: number) {
  if (!file.exists) {
    throw new Fault('file-missing');
  }
  const handle = file.open();
  return inspectFile(
    { read: async count => handle.readBytes(count), close: () => handle.close() },
    declaredSize ?? file.size,
  );
}

export const nativeFiles: Files = {
  async remove(local) {
    const file = stagedFile(local);
    if (file.exists) {
      file.delete();
    }
  },
  async sweep(keepId) {
    if (keepId !== undefined && !isStagedId(keepId)) {
      throw new Fault('cleanup');
    }
    ensureStaging();
    for (const file of staging.list()) {
      if (file.name !== keepId) {
        file.delete();
      }
    }
    // Expo's copied picker URLs are ours, never the provider's original document.
    clearPickerCopies();
  },
  async verify(local) {
    const file = stagedFile(local);
    const result = await inspect(file);
    if (result.size !== local.size || result.format !== local.format) {
      throw new Fault('file-changed');
    }
  },
};

export async function pickAndStage(): Promise<LocalFile | null> {
  ensureStaging();
  let picked: DocumentPicker.DocumentPickerResult;
  try {
    picked = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: false,
      copyToCacheDirectory: true,
    });
  } catch {
    clearPickerCopies();
    throw new Fault('picker');
  }
  if (picked.canceled) {
    clearPickerCopies();
    return null;
  }
  const asset = picked.assets[0];
  if (!asset) {
    throw new Fault('picker');
  }
  const copy = new File(asset.uri);
  // Fail closed if an unexpected picker implementation did not return its promised cache copy.
  if (!copy.uri.startsWith(Paths.cache.uri)) {
    throw new Fault('picker');
  }
  let staged: File | undefined;
  try {
    const result = await inspect(copy, asset.size);
    staged = new File(staging, `${randomUUID()}.bin`);
    copy.move(staged);
    clearPickerCopies();
    return { stagedId: staged.name, name: asset.name || `statement.${result.format}`, ...result };
  } catch (error) {
    try {
      if (copy.exists) {
        copy.delete();
      }
      if (staged?.exists) {
        staged.delete();
      }
      clearPickerCopies();
    } catch {
      throw new Fault('cleanup');
    }
    if (error instanceof Fault) {
      throw error;
    }
    throw new Fault('picker');
  }
}

const store: Store = {
  async load() {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    const { journal, migrated } = migrateStoredJournal(raw);
    // Commit the portable reference before bootstrap is allowed to sweep anything.
    if (migrated) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(journal));
    }
    return journal;
  },
  async save(journal) {
    if (journal === null) {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } else {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(journal));
    }
  },
};
const cancellations: PendingCancellationStore = {
  async load() {
    const raw = await AsyncStorage.getItem(CANCELLATIONS_KEY);
    return raw === null ? [] : parsePendingCancellations(raw);
  },
  async save(entries) {
    await AsyncStorage.setItem(CANCELLATIONS_KEY, JSON.stringify({ version: 1, entries }));
  },
};

export function makeController(): ImportController {
  const api = new HttpApi(
    (url, options) => expoFetch(url, options as Parameters<typeof expoFetch>[1]),
    async local => {
      const file = stagedFile(local);
      if (!file.exists) {
        throw new Fault('file-missing');
      }
      if (file.size !== local.size || file.size > MAX_BYTES) {
        throw new Fault('file-changed');
      }
      // Expo buffers File bodies and replaces Content-Type with the file's inferred MIME.
      // Bounded bytes preserve application/octet-stream, without base64 or multipart.
      const bytes = await file.bytes();
      if (bytes.length !== local.size) {
        throw new Fault('file-changed');
      }
      return bytes;
    },
  );
  return new ImportController(store, nativeFiles, api, randomUUID, cancellations);
}
