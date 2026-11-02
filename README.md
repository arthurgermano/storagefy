# 📦 storagefy

Keep the state of your **Pinia**, **Redux**, **Zustand**, **Jotai** or **Svelte** stores in **IndexedDB**,
**localStorage** or **sessionStorage** — with expiration, optional encryption and sync between the tabs of your app.

- 🔌 One storage adapter per kind of storage, the same interface for all three
- 🧠 Expiration per key, and per store
- 🔐 Optional encryption (AES-GCM) — makes the stored values hard to read in the browser (see [Encryption](#-encryption))
- 🪟 Optional sync between tabs (`BroadcastChannel`)
- 🧾 Writes land in the order they were made; a burst of changes is one write; failures are reported (`onError`)
- 🟦 Typed (TypeScript declarations generated from the sources)

Documentation and live demos: **https://arthurgermano.github.io/storagefy/** · Changes: [CHANGELOG.md](CHANGELOG.md)

---

## 📦 Installation

```bash
npm install storagefy
```

## 🛠️ Quick start (Pinia + IndexedDB)

```ts
import { IndexedDBAdapter, PiniaAdapter } from "storagefy";

const storage = new IndexedDBAdapter({ dbName: "my-app" });
const pinia = new PiniaAdapter(storage);

const cart = useCartStore();
await pinia.getFromStorage(cart, "cart"); // load what was kept (nothing the first time)
await pinia.setInStorage(cart, "cart", {   // keep every change from now on
  ignoreKeys: ["draft"],                   // memory only
  onError: (error) => console.error(error) // the state could not be saved (storage full…)
});
```

React (Redux, Zustand, or any store with `subscribe` and `getState`/`setState`) and Svelte (`writable`) work the
same way with `ReactAdapter` and `SvelteAdapter`.

---

## 🧱 Storage adapters

`IndexedDBAdapter`, `LocalStorageAdapter`, `SessionStorageAdapter` — or `startStoragefy({ adapter })`, which creates
one and keeps it for the other helpers.

### Options

| Option | Default | What it does |
|---|---|---|
| `dbName` | — | Namespace of the keys (the database name for IndexedDB) |
| `storeName` | `${dbName}_store` | IndexedDB only: the object store |
| `version` | `1` | Version of the stored schema |
| `encrypt` | `false` | Encrypt the values and obfuscate the key names (see [Encryption](#-encryption)) |
| `password` | — | The app's secret the encryption keys are derived from (with `encrypt`) |
| `keyDerivation` | `"hkdf"` | How the keys are derived from the password: `"hkdf"` or `"pbkdf2"` (see [Encryption](#-encryption)) |
| `channelName` | — | Name of the `BroadcastChannel` the tabs of your app talk on |
| `enableSyncTabs` | `false` | Tell the other tabs about every write and delete (needs `channelName`) |
| `expireCheckInterval` | `1000` | How often (ms) expired keys are removed; `0` turns the timer off (expired keys are still never read) |
| `description` | `""` | Kept with the metadata |

`startStoragefy` also takes `adapter` (`"indexedDB"` — the default —, `"localStorage"`, `"sessionStorage"`),
`fresh: true` (a new adapter, the one kept stays) and `forceRecreate: true` (a new adapter that replaces the one kept —
the old one is destroyed, and the store adapters kept over it stop keeping their stores: keep them again).

### Methods

| Method | Answers |
|---|---|
| `get(key, { onError }?)` | The value, or `null` when absent, expired or unreadable — `onError` tells the last case apart |
| `set(key, value, expire?)` | `true` saved, `false` failed, `null` removed (`value` null/undefined, or `expire` ≤ 0). `expire`: ms from now |
| `delete(key)` | Removes the key and its expiration |
| `has(key)` | Whether the key is stored and not expired — whether `get` would find a value |
| `list(prefix?)` | `[{ key, value }]` of the keys that start with `prefix` (every key without it) |
| `getAll(table?)` | `list(`${table}__`)` — every key without a table |
| `reset()` / `clear()` | Remove every key of the namespace and their expirations (`clear` also the metadata) — after the writes asked before them; the writes asked after wait for them |
| `setExpire(key, timestamp)` / `getExpire(key)` / `deleteExpire(key)` / `clearExpire()` | Expirations by hand |
| `onDataChanged(listener)` | Listens to the other tabs' changes; returns a function that stops |
| `destroy()` | Releases the adapter once the writes asked are done: the expiry timer, the channel and the IndexedDB connection. Call it when you stop using the adapter — it is not used after |
| `waitReadiness()` | IndexedDB only: resolves once the database is open (the other methods wait by themselves); rejects with the reason when it does not open |

Writes of a key are applied **in the order they were made** — even when encryption takes longer for one of them —
and a read (`get`, `has`) waits for the writes of its key asked before it. An expired key is removed only if it is
still expired when its turn comes: a write made meanwhile is never undone by an older expiration. With IndexedDB, a
write answers `true` only once its transaction is saved, and the value and its expiration are written in one
transaction.

#### IndexedDB: database, object store and version

The object store is created when the database is created or its `version` is raised. A database opened again with
another `storeName` at the same version has no such store: the adapter refuses it with the reason (every write answers
`false`, every read `null`, both through `onError`). Mind the defaults — `startStoragefy` uses `"storagefy_db"`, the
class `${dbName}_store`. When a tab opens a higher `version`, the tabs holding the older one close it and fail with
"upgraded by another tab — reload the page".

---

## 🪄 Store adapters

`PiniaAdapter`, `ReactAdapter`, `SvelteAdapter` — each created over a storage adapter.

A store may hold any JSON value: an object, an array, a number, a string, a boolean (a Pinia store's state is always
an object). What it holds is written, and loaded back as it was. A state set to **`null` or `undefined` removes the
stored key** — a store emptied on sign-out is not loaded back after a reload.

The state is always read from the store: `getState()` (Redux, Zustand) or `get()`; a React store with neither is read
from what it passes its listeners — a notification that passes nothing writes nothing (it is never taken for
`undefined`).

### `getFromStorage(store, key, { onError }?)`

Loads what was kept under `key` into the store. Answers `true` when a state was loaded, `undefined` when there was
none. A state that is there but cannot be read (another password, changed by hand — or, for Pinia, not an object) is
reported to `onError`; the store keeps its state.

### `setInStorage(store, key, options?)`

Writes the store's state now and on every change after. A burst of changes is written once after the write in
progress — the last state always wins. A change that leaves the stored part as it is (an `ignoreKeys` key alone)
writes nothing.

It first reads what is stored under `key`: a state already stored is not written again, and a state another tab wrote
after your `getFromStorage` is put in the store instead of being written over. Without `getFromStorage` before it, the
store's state is written over what is stored.

| Option | What it does |
|---|---|
| `ignoreKeys` | State left out of storage. Dot notation reaches nested keys: `["draft", "user.password"]` |
| `timeout` | ⚠️ **Expiration** of the stored state, in ms after each write — not a time limit: after it, the stored state is gone. A change of an `ignoreKeys` key alone writes nothing, so it does not renew it |
| `syncTabs` | Apply the changes of the other tabs to this store (see [Sync between tabs](#-sync-between-tabs)) |
| `onError` | Called with an `Error` when the state could not be saved, or a change from another tab could not be read or applied |

### `destroy(key)` / `destroyAll()`

Stops keeping the store of `key` (`destroyAll`: every store of the adapter): no more writes, no more changes from the
other tabs. What is stored stays, and the storage adapter goes on.

### Helpers

- `getPiniaAdapter(options?)`, `getReactAdapter(options?)`, `getSvelteAdapter(options?)` — a store adapter over
  `options.adapter`, over a new storage adapter (`options.adapterParams`), or over the one `startStoragefy` created.
  It is kept and returned again; `fresh: true` returns a new one, `forceRecreate: true` replaces it (the one replaced
  stops keeping its stores — keep them again).
- `setPiniaStorage(store, key, options?)`, `setReactStorage(…)`, `setSvelteStorage(…)` — `getFromStorage` then
  `setInStorage`, with the store adapter kept.

---

## 🔄 Sync between tabs

Three settings, each in its place:

```ts
const storage = new IndexedDBAdapter({
  dbName: "my-app",
  channelName: "my-app-tabs", // 1. the channel the tabs talk on
  enableSyncTabs: true,        // 2. this storage tells the other tabs about its writes
});
await pinia.setInStorage(cart, "cart", { syncTabs: true }); // 3. this store applies the other tabs' changes
```

Without all three, nothing is synced — and nothing warns you. A store chooses with `syncTabs` whether it follows the
other tabs; the stores that do not are still written. Several store adapters may share one storage adapter.

Good to know:

- A key **removed** in another tab (`delete`, `reset`) is not removed from this tab's store — what is in memory stays.
- With localStorage and sessionStorage the stored value is sent with the message — sessionStorage belongs to one tab,
  and a write to localStorage may reach the other tabs after the message does (Firefox). With sessionStorage the change
  is applied to the store, not to this tab's sessionStorage. IndexedDB is read again: a write is told once its
  transaction is saved.
- Every write has a revision, and a store applies only a state newer than the one it holds: a message heard late, or a
  state another tab wrote before it knew this one, never undoes a newer change. Two tabs changing a store at the same
  moment end with the same state — the one stored, the newer: a store is written whole, so the other change is lost.
  With localStorage, which orders no write of one tab with another's, the tab of the newer change writes it again when
  it hears the older one, or sees it reach storage (the `storage` event): storage may have saved the older last.
- With IndexedDB and localStorage, a tab shown again (back from the background, or from the browser's page cache)
  reads storage again: the changes it missed meanwhile are applied.
- A change whose state the store already holds (`ignoreKeys` left out) is not applied again.
- The changes are applied in the order they came — reading or decrypting one never lets an older change land last.
  Two objects are merged (what `ignoreKeys` left out stays in memory); an array or any other value replaces the state.
- A store follows only the changes of its own `dbName`: apps that share a channel name do not mix their states.
- Nothing is added to your state: other subscribers of the store see the other tab's state as it is.

---

## 🔐 Encryption

`encrypt: true` encrypts every value with AES-GCM (256-bit keys, a new random IV on every write) and obfuscates the
key names.

**What it is for:** it makes the stored values hard to read in the browser's tools. **What it is not:** a way to keep
a secret. Everything needed to decrypt ships with your app:

- Without `password`, a key is derived from the storage key's own name — anyone who knows this library can read the
  values.
- With `password`, reading also needs your app's secret — which is inside your app's JavaScript. Harder, never
  impossible.

**Never store a token, a password or personal data you must protect with Storagefy** — encrypted or not. Keep it for
what is fine to sit on the device: preferences, a cart, a draft, "signed in until".

### `keyDerivation`

How the encryption keys are derived from the password:

| | Cost | When |
|---|---|---|
| `"hkdf"` (default) | well under 1 ms per key | The password is a constant of your app. Slowing it down protects nothing: anyone who reads your app has it |
| `"pbkdf2"` | 100,000 rounds — tens of ms per key, more on a slow phone | The password is **typed by the person** (a PIN, a passphrase): guessing it must be slow |

Each key is derived once per adapter and kept in memory. Every stored value records how its key was derived and is
read that way — changing the option never makes stored values unreadable. Values written by 1.2.x (PBKDF2) are still
read, and written again in the 1.3.0 format on their next write.

Turning `password` on (or changing it) for existing values makes them unreadable: they read as `null`, `onError`
says why, and the store starts from its initial state.

---

## ⚠️ Errors and debugging

- Reads answer `null` and writes `false` instead of throwing — pass `onError` to `get` / `getFromStorage` /
  `setInStorage` to be told.
- `globalThis.storagefyDebug = true` (and `globalThis.storagefyDebugLevel = 0…3`) logs what Storagefy does to the
  console. **Debug logs show the values in plain text**, encrypted or not — never turn it on in production.

## 🟦 TypeScript

The package ships its declarations (`dist/types`). The option types are exported:

```ts
import type {
  StorageAdapterOptions, // the storage adapters' options
  SetInStorageOptions,   // setInStorage (and set*Storage)
  GetFromStorageOptions, // getFromStorage
  ReadOptions,           // get
  DataChange,            // what onDataChanged hears
  FrameworkAdapterOptions, // get*Adapter
} from "storagefy";
```

## ⬆️ Upgrading to 1.4.0

Nothing to change in your code. A change of an `ignoreKeys` key alone no longer writes — so it no longer renews the
`timeout` expiration — and `setInStorage` does not write a state that is already stored. Values stay readable both
ways between 1.3.0 and 1.4.0. See [CHANGELOG.md](CHANGELOG.md).

## ⬆️ Upgrading to 1.3.0

Read [CHANGELOG.md](CHANGELOG.md): the format of encrypted values changed (older versions cannot read values written
by 1.3.0), `list(prefix)` now filters, `ReactAdapter.setInStorage` resolves after the first write, `destroy()` is
async and releases everything, and `forceRecreate` ends what it replaces.

## 📜 License

MIT
