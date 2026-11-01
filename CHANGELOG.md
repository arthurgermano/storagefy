# Changelog

## 1.3.0

### Added

- **`keyDerivation`** option of the storage adapters (and `startStoragefy`): `"hkdf"` (the new default — fast) or
  `"pbkdf2"` (100,000 rounds, as before — for a password the person types). Every encrypted value now records how its
  key was derived, and is read that way whatever the option is now.
- **`onError` on reads**: `get(key, { onError })` and `getFromStorage(store, key, { onError })` tell a value that is
  stored but cannot be read (another password, changed by hand, not JSON) apart from a missing one. A change from
  another tab that cannot be read goes to the store's `setInStorage` `onError`.
- `onDataChanged(listener)` and `CrossTabChannel.subscribe(listener)` return a function that stops listening.
- The option types are exported: `import type { StorageAdapterOptions, SetInStorageOptions, GetFromStorageOptions,
  ReadOptions, DataChange, FrameworkAdapterOptions } from "storagefy"` (they existed, but no app could name them).
- `destroyAll()` on the store adapters: stops keeping every store.
- Tests of the published types: an app's use of the library compiled with `strict`.
- Tests in real browsers (Playwright — Chromium, Firefox, WebKit): the published package, the three storages with the
  real Web Crypto API, real tabs syncing Pinia, Svelte and Zustand stores, a reload, an IndexedDB upgrade between tabs,
  the expiry watcher on real timers. `npm run test:browser`.

### Fixed

- **Writes of a key landed out of order**: encryption runs before the value is stored, and two writes in a row could
  finish in the reverse order, leaving the older value stored. Writes of a key now run one after another, and a read
  (`get`, `has`) waits for the writes of its key asked before it.
- **An expired key could remove the value written just after it**: a read (or the expiry watcher) that saw the old
  expiration removed the key after a new write had stored it — `set` answered `true` and the value was gone. An
  expired key is now removed only if it is still expired when its turn comes (with IndexedDB, the check and the
  removal in one transaction).
- **IndexedDB reported a write as saved before it was**: it answered at the request, not at the end of the
  transaction — a write undone by the transaction (storage full) was reported saved, `onError` was not called, and the
  other tabs were told about a value that was not there.
- **IndexedDB used three transactions per write** (the value, then the expirations read and written again), and two
  writes at once could lose an expiration. The value and its expiration are now written in one transaction.
- **localStorage / sessionStorage rewrote the expirations record on every write**, even with no expiration involved.
- **Large values could not be encrypted**: the bytes were turned into text with one call taking every byte as an
  argument, which overflows past ~100 KB.
- **Svelte stores never synced between tabs**: `setInStorage` with `syncTabs` always failed
  (`ReferenceError: store is not defined`). A change applied from another tab also left a marker in the Svelte store.
- **A channel had a single listener**: each new listener replaced the last, so a second store adapter on one storage
  adapter silently stopped the first one's sync.
- **`list(prefix)` ignored the prefix** and **`getAll(table)` ignored the table**: both returned every key.
- **`setPiniaStorage` / `setReactStorage` / `setSvelteStorage` hid the real error**: their error path called a
  `logError` that was never imported, so every error became `ReferenceError: logError is not defined`.
- **`startStoragefy({ fresh: true })` returned the adapter already started** instead of a new one.
- **`has(key)` answered `true` for an expired key** until the watcher removed it — with the watcher off
  (`expireCheckInterval: 0`), forever. It now answers whether `get` would find a value.
- **The published types refused correct code**: store adapters declared a store adapter as their argument (instead
  of a storage adapter), `syncTabs` was missing from `setInStorage`'s options, `onError` and the factories' methods
  were untyped (`Function`), `getFromStorage` was declared `Promise<boolean>` (it answers `true | undefined`), and the
  expiry timer was typed `NodeJS.Timeout` (an app without Node's types did not compile).
- **A store set to `null` came back after a reload** (Svelte, React): a falsy state was never written, so the state
  before it stayed stored — a store emptied on sign-out was loaded again. `null` and `undefined` now remove the stored
  key (as the storage adapters' `set` does); `0`, `false` and `""` are written. A React store is read with `getState`,
  or `get` (new: before, a store without `getState` was read from its listener's argument even when it had `get`); a
  store with neither is read from what it passes its listeners, and a notification that passes nothing writes nothing.
- **A store holding an array or another value than an object** (Svelte, React — a Jotai atom, `writable(0)`) did not
  work: an array came back as an object (`{ "0": … }`), a number or a string made `getFromStorage` throw, and the
  changes of another tab were ignored. Any JSON value is now written and loaded back as it was; another tab's array or
  value replaces the state, two objects are merged.
- **Firefox: a change in localStorage could miss the other tab**: the message could arrive before the other tab's
  localStorage showed the write (seen under load in a real Firefox, never in Chromium); read there, the change was the
  old state and was dropped as already held. A change in localStorage now carries the stored value, as sessionStorage
  already did.
- **Changes of another tab could land in the reverse order** (sessionStorage, encrypted: each one is decrypted, and a
  large one takes longer), leaving the older state in the store. They are now applied one after another.
- **A store followed the changes of any namespace on its channel**: two apps (or `dbName`s) sharing a channel name
  mixed their states. A change now carries its `dbName`, and a store follows only its own.
- **A write asked before `reset()` or `clear()` could survive it**: they now run after the writes asked before them,
  and the writes asked after wait for them. `reset()` also removes the expirations of the keys it removes (they were
  left behind, and the expiry watcher told the other tabs about removing keys that were gone).
- **Encrypted keys with a character outside the BMP collided**: the obfuscation of the key names dropped half of such
  a character, so `"fav-😀"` and `"fav-😁"` became one stored key — a value was lost and `list()` found neither. Key
  names are obfuscated by character now; names without such characters are stored under the same names as before.
- **IndexedDB could wait forever**: a database opened again with another `storeName` at the same version (the
  defaults of `startStoragefy` and of the class differ) threw inside the open, and every use waited for good. It is now
  refused with the reason (writes answer `false`, reads `null`, through `onError`). A tab holding an older version open
  closes it when another tab opens a higher one — it used to block that tab for good — and then fails with "upgraded
  by another tab — reload the page".
- **`destroy()` only stopped the expiry watcher**: the channel between tabs and the IndexedDB connection stayed open.
- **`forceRecreate` left what it replaced running**: `startStoragefy({ forceRecreate })` kept the old adapter's
  watcher, channel and connection alive, and the store adapters kept over it went on writing there;
  `get*Adapter({ forceRecreate })` left the old store adapter keeping its stores (a store kept again was written
  twice).
- A database that cannot open no longer causes an unhandled rejection; a missing storage no longer leaves a channel
  open.
- The options given to `setInStorage` are no longer modified.

### Changed

- **Format of encrypted values**: `{ v: 2, kdf, iv, data }` (standard base64 — smaller than before). Values written
  by 1.2.x are still read, and written again in the new format on their next write. **Versions before 1.3.0 cannot
  read values written by 1.3.0**: rolling back an app, or a tab still running the old version during an update,
  reads them as missing (the store starts from its initial state).
- `ReactAdapter.setInStorage` resolves after the first write (as Pinia and Svelte already did) — a store without
  `getState` is written on its first change, as before.
- A burst of changes to a store is written once after the write in progress (the last state wins), not once per
  change.
- A change from another tab whose state the store already holds (`ignoreKeys` left out) is not applied again.
- The adapters no longer listen to `beforeunload` (it only stopped a timer, and can keep the page out of the
  browser's back/forward cache). Call `destroy()` when you stop using an adapter.
- `destroy()` is async: it waits for the writes already asked, then stops the watcher, closes the channel and (IndexedDB)
  the connection. The adapter is not used after it.
- `forceRecreate` ends what it replaces: `startStoragefy` destroys the old adapter, and the store adapters kept over
  it stop keeping their stores and are forgotten (keep the stores again); `get*Adapter` stops the stores of the store
  adapter it replaces.
- An expiration timestamp of `0` set by hand means none for the expiry watcher too, as it already did for reads.
- A change from another tab is no longer marked inside the store's state (`STORAGEFY_SILENT_CHANNEL_UPDATE`): the
  store's other subscribers — and a Redux reducer's `STORAGEFY_UPDATE` payload — see the state as it is. A failure to
  apply it (a reducer that throws) goes to `onError` ("could not apply").
- `ReactAdapter` keeps a store with `subscribe` and one of `getState`, `setState`, `get`, `set`, `update` — the ways it
  reads and sets a store (`_getState` / `_setState` were accepted, and never used).
- `waitReadiness()` rejects with the reason the database did not open (refused, upgraded by another tab, destroyed).
- `localStorage` and `sessionStorage` adapters share one implementation (`WebStorageAdapter`).
- Documentation: `timeout` is the **expiration** of the stored state (not a time limit of the operation); sync between
  tabs needs `channelName`, `enableSyncTabs` and `syncTabs`; encryption makes reading harder and does not keep a
  secret — never store tokens or passwords.

## 1.2.0

- `misc-helpers` ^3.0.3; ESM published one file per module (`sideEffects: false`) with types generated from the
  JSDoc.
- The encryption key of each storage key is derived once; the documented `password` option works.
- `onError` on `setInStorage` (Pinia, React, Svelte); `set(key, null)` removes the key; cross-tab sync skips a store
  that already holds the same state; importing does nothing by itself.
