import { Fault, isStagedId, parseJournal, type Journal } from '../core/model';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const legacyRoots = [
  `(?:private/)?var/mobile/Containers/Data/Application/${uuid}/Library/Caches`,
  `Users/[^/%\\\\]+/Library/Developer/CoreSimulator/Devices/${uuid}/data/Containers/Data/Application/${uuid}/Library/Caches`,
  'data/(?:user(?:_de)?/[0-9]+|data)/[a-z0-9._]+/cache',
];
const legacyPath = new RegExp(
  `^file:///(?:${legacyRoots.join('|')})/statement-import/(${uuid}\\.bin)$`,
  'i',
);

/** Old paths are migration input only. No I/O ever uses their absolute prefix. */
export function migrateStoredJournal(raw: string): { journal: Journal; migrated: boolean } {
  try {
    const value = JSON.parse(raw);
    const file = value?.file;
    const migrated = !!file && typeof file === 'object' && 'uri' in file;
    if (migrated && file.stagedId === undefined) {
      if (typeof file.uri !== 'string' || /%|\\\\|\/(?:\.|\.\.)\//.test(file.uri)) {
        throw new Error();
      }
      const stagedId = legacyPath.exec(file.uri)?.[1];
      if (!isStagedId(stagedId)) {
        throw new Error();
      }
      file.stagedId = stagedId;
    }
    return { journal: parseJournal(JSON.stringify(value)), migrated };
  } catch {
    throw new Fault('storage-corrupt');
  }
}
