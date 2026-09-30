import test from 'node:test';
import assert from 'node:assert/strict';
import { planEntryIdMigration, ENTRY_ID, LEGACY_ENTRY_IDS, MODULE_NAME } from '../tools/entry-id-migration.mjs';

test('this package inserts exactly one row under its own stable entry id', () => {
  assert.equal(ENTRY_ID, 'whale-maid');
  assert.equal(MODULE_NAME, 'dsh-plugin-whale-maid');
  assert.ok(LEGACY_ENTRY_IDS.every(id => id !== ENTRY_ID));
});

for (const legacy of LEGACY_ENTRY_IDS) {
  test(`entry-ID migration preserves enabled and disabled overrides from ${legacy} without mutating input`, () => {
    for (const disabled of [true, false]) {
      const before = [{ id: 'unrelated', disabled: true }, { id: legacy, name: MODULE_NAME, disabled,
        config: { label: legacy, nested: { keep: true } } }];
      const snapshot = structuredClone(before);
      const after = planEntryIdMigration(before);
      assert.deepEqual(before, snapshot);
      assert.deepEqual(after, [before[0], { ...before[1], id: ENTRY_ID }]);
      assert.notEqual(after[1].config, before[1].config);
    }
  });
}
test('entry-ID migration preserves override order and is idempotent', () => {
  const before = [{ id: LEGACY_ENTRY_IDS[0], disabled: true }, { id: LEGACY_ENTRY_IDS[0], disabled: false }];
  const after = planEntryIdMigration(before);
  assert.deepEqual(after.map(p => [p.id, p.disabled]), [[ENTRY_ID, true], [ENTRY_ID, false]]);
  assert.deepEqual(planEntryIdMigration(after), after);
  assert.deepEqual(planEntryIdMigration([]), []);
});
test('entry-ID migration refuses existing new-ID overrides or insertions', () => {
  assert.throws(() => planEntryIdMigration([{ id: LEGACY_ENTRY_IDS[0] }, { id: ENTRY_ID }]), /Both entry IDs/);
  assert.throws(() => planEntryIdMigration([{ id: LEGACY_ENTRY_IDS[0] }, { insert: [{ id: 'group', group: true,
    config: [{ id: ENTRY_ID, name: 'another-plugin' }] }] }]), /Both entry IDs/);
});
test('entry-ID migration refuses custom ownership or inserted legacy rows', () => {
  assert.throws(() => planEntryIdMigration([{ id: LEGACY_ENTRY_IDS[0], name: 'another-plugin' }]), /manual review/);
  assert.throws(() => planEntryIdMigration([{ id: LEGACY_ENTRY_IDS[0], insert: [] }]), /manual review/);
  assert.throws(() => planEntryIdMigration([{ insert: [{ id: LEGACY_ENTRY_IDS[0], name: MODULE_NAME }] }]), /manual review/);
  assert.throws(() => planEntryIdMigration(null), /patch list/);
  assert.throws(() => planEntryIdMigration([null]), /patch list/);
});
