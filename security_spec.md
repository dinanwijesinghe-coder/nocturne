# Security Specification — Nocturne Firestore Rules (Phase 0 TDD)

## 1. Data Invariants
1. **User Isolation**: `/users/{userId}`, `/users/{userId}/likedTracks/{trackId}`, and `/users/{userId}/followedArtists/{artistId}` are strictly scoped to `request.auth.uid == userId`. No blanket reads or collection listing on `/users`.
2. **No PII Exposure**: Raw email addresses, phone numbers, and street addresses are never stored inside shared documents or `/users/{userId}` docs.
3. **Collaborative Playlist Master Gate**: `/playlists/{playlistId}/items/{trackId}` reads the parent `/playlists/{playlistId}` document via `get()` and grants access only when `request.auth.uid == ownerUid` or `request.auth.uid in memberUids` (when `isCollaborative == true`).
4. **Playlist Membership Integrity**: Only the creator (`ownerUid == request.auth.uid`) can create or delete a playlist, toggle collaboration, or rename it. Collaborators in `memberUids` can only mutate `trackIds` and `updatedAt`. New collaborators joining a collaborative playlist can only append their own `request.auth.uid` to `memberUids` (capped at 50) without altering existing members or tracks.
5. **Invite Code Integrity**: `/playlistInvites/{inviteCode}` permits single-document `get` by exact invite code for signed-in users (`allow list: if false` prevents invite enumeration), and creation requires `exists(/databases/$(database)/documents/playlists/$(incoming().playlistId))` and matching `ownerUid`.
6. **Temporal & Schema Integrity**: Every create and update enforces `isValid[Entity](incoming())`, `hasOnly(...)` key allowlists, strict `.size()` bounds on every string and array, `createdAt == request.time` on create (immutable thereafter), and `updatedAt == request.time` on update.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated User Read**: Unauthenticated `get` on `/users/alice` -> Denied.
2. **Cross-User Profile Spoof**: Authenticated as `bob`, attempt `create` on `/users/alice` with `uid: "alice"` -> Denied.
3. **Shadow Field Injection on User Create**: Authenticated as `alice`, `create` `/users/alice` with extra ghost field `isAdmin: true` -> Denied (`hasOnly` check).
4. **Immortal Timestamp Tampering**: Authenticated as `alice`, `update` `/users/alice` modifying `createdAt` or `uid` -> Denied.
5. **Client-Forged Timestamp**: Authenticated as `alice`, `create` `/users/alice` with `updatedAt` != `request.time` -> Denied.
6. **ID Poisoning Attack**: Authenticated as `alice`, `create` `/playlists/invalid$id*overflow...` (bad chars or >128 chars) -> Denied (`isValidId`).
7. **Unbounded Array Exhaustion**: Authenticated as `alice`, `update` `/playlists/pl1` with 200 items in `memberUids` (> 50 cap) -> Denied.
8. **Playlist Ownership Hijack**: Authenticated collaborator `bob` attempts `update` on `/playlists/pl1` changing `ownerUid` to `"bob"` or renaming `name` -> Denied (`affectedKeys().hasOnly(['trackIds', 'updatedAt'])`).
9. **Unauthorized Subcollection Write (Master Gate)**: Authenticated `eve` (not in `memberUids`) attempts `setDoc` on `/playlists/pl1/items/t1` -> Denied.
10. **Collaborator Removal Spoof**: Authenticated `bob` attempts `joinCollab` action on `/playlists/pl1` while dropping `carol` from `memberUids` -> Denied (`hasAll(existing().memberUids)`).
11. **Invite Enumeration Scraping**: Authenticated `eve` runs `getDocs(collection(db, 'playlistInvites'))` (`list` query) -> Denied.
12. **Orphaned Invite Creation**: Authenticated `eve` creates `/playlistInvites/FAKE-1234` pointing to a non-existent or non-owned `playlistId` -> Denied (`exists()` + `get().data.ownerUid == request.auth.uid`).
