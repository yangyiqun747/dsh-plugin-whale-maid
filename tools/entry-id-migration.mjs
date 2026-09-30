/** Offline planning helper only: no file access, install hook, or live profile mutation. */
export const MODULE_NAME = 'dsh-plugin-whale-maid';
/** This package's own profile entry id, as inserted by cordis.patch.yml. */
export const ENTRY_ID = 'whale-maid';
/** Profile entry ids this helper migrates away from, oldest first. */
export const LEGACY_ENTRY_IDS = Object.freeze(['dsh-plugin-whale-maid', 'whalePet']);

/** Plan migration of ordinary ID-targeted overrides, preserving all other values.
 * The caller must review and explicitly apply the resulting configuration.
 * Conflicting/custom insertions require manual review rather than guessing precedence.
 */
export function planEntryIdMigration(patches) {
  if (!Array.isArray(patches) || patches.some(p => !p || typeof p !== 'object' || Array.isArray(p))) {
    throw new TypeError('Expected a profile patch list');
  }
  const result = structuredClone(patches);
  const insertedIds = [];
  const visit = rows => {
    for (const row of rows ?? []) {
      insertedIds.push(row.id);
      if (row.group && Array.isArray(row.config)) visit(row.config);
    }
  };
  for (const patch of result) visit(patch.insert);
  if (insertedIds.some(id => LEGACY_ENTRY_IDS.includes(id))) {
    throw new Error('Custom legacy-ID insertion requires manual review');
  }
  const legacy = result.filter(p => LEGACY_ENTRY_IDS.includes(p.id));
  if (!legacy.length) return result;
  if (result.some(p => p.id === ENTRY_ID) || insertedIds.includes(ENTRY_ID)) {
    throw new Error('Both entry IDs are present; review conflicting settings manually');
  }
  for (const patch of legacy) {
    if (patch.insert !== undefined || (patch.name !== undefined && patch.name !== MODULE_NAME)) {
      throw new Error('Unexpected legacy-ID target requires manual review');
    }
    patch.id = ENTRY_ID;
  }
  return result;
}
