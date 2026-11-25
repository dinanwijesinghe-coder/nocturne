import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
const rulesText = fs.readFileSync(rulesPath, 'utf8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));

test('firestore.rules includes rules_version 2 and default-deny catch-all', () => {
  assert.match(rulesText, /rules_version\s*=\s*'2';/);
  assert.match(rulesText, /match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);
});

test('every collection in firebase-blueprint.json has an explicit match block in firestore.rules', () => {
  const paths = Object.keys(blueprint.firestore || {});
  assert.ok(paths.length >= 6);
  for (const colPath of paths) {
    const leaf = colPath.split('/').slice(-2).join('/');
    assert.ok(rulesText.includes(leaf), `Missing rules block for ${colPath}`);
  }
});

test('Dirty Dozen security guards block spoofing, shadow fields, tampering, and scraping', () => {
  // 1 & 2: User isolation & no user listing
  assert.match(rulesText, /match \/users\/\{userId\}[\s\S]*allow list: if false;/);
  assert.match(rulesText, /function isOwner\(userId\)\s*\{\s*return isSignedIn\(\) && request\.auth\.uid == userId;/);

  // 3: Strict keys allowlist preventing shadow fields
  assert.match(rulesText, /data\.keys\(\)\.hasOnly\(/);
  assert.match(rulesText, /affectedKeys\(\)\.hasOnly\(/);

  // 4 & 5: Immortal fields & server timestamp enforcement
  assert.match(rulesText, /incoming\(\)\.uid == existing\(\)\.uid/);
  assert.match(rulesText, /incoming\(\)\.createdAt == existing\(\)\.createdAt/);
  assert.match(rulesText, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesText, /incoming\(\)\.updatedAt == request\.time/);

  // 6 & 7: ID poisoning & bounded arrays
  assert.match(rulesText, /id\.matches\('\^\[a-zA-Z0-9_\\\\-\]\+\$'\)/);
  assert.match(rulesText, /data\.memberUids\.size\(\) <= 50/);
  assert.match(rulesText, /data\.trackIds\.size\(\) <= 150/);

  // 8 & 9: Playlist ownership immutability & Master Gate get() on subcollection items
  assert.match(rulesText, /incoming\(\)\.ownerUid == existing\(\)\.ownerUid/);
  assert.match(rulesText, /match \/items\/\{trackId\}[\s\S]*get\(\/databases\/\$\(database\)\/documents\/playlists\/\$\(playlistId\)\)/);

  // 10: Self-only join invariant prevents dropping or adding third parties
  assert.match(rulesText, /!\(request\.auth\.uid in existing\(\)\.memberUids\)/);
  assert.match(rulesText, /incoming\(\)\.memberUids\.hasAll\(existing\(\)\.memberUids\)/);
  assert.match(rulesText, /incoming\(\)\.memberUids\.size\(\) == existing\(\)\.memberUids\.size\(\) \+ 1/);

  // 11 & 12: Invite enumeration blocked & parent playlist existence verified on create
  assert.match(rulesText, /match \/playlistInvites\/\{inviteCode\}[\s\S]*allow list: if false;/);
  assert.match(rulesText, /exists\(\/databases\/\$\(database\)\/documents\/playlists\/\$\(incoming\(\)\.playlistId\)\)/);
});
