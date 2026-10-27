# 📦 storagefy

**Framework-agnostic, pluggable storage adapter library** for syncing your app state across localStorage, sessionStorage, and IndexedDB—with first-class support for **Pinia**, **React**, and **Svelte** stores.

---

## 🚀 Features

- 🔌 Plug-and-play storage: IndexedDB, localStorage, or sessionStorage
- 🧠 Built-in expiration + encryption support
- 🪄 Works out-of-the-box with **Pinia**, **Redux/Zustand/Jotai/custom React**, and **Svelte stores**
- 🪟 Optional multi-tab sync via `BroadcastChannel`
- 🔁 Easily switch or upgrade your storage backend without touching app logic

---

## 📦 Installation

```bash
npm install storagefy
```

## 🛠️ Quick Start

### 1. Initialize a storage adapter
Create your storage instance by configuring the adapter type (IndexedDB, localStorage, or sessionStorage), database name, and optional features like encryption and multi-tab sync.

```ts
import { startStoragefy } from 'storagefy';

const adapter = startStoragefy({
  dbName: 'my-app',
  adapter: 'indexedDB', // or 'localStorage', 'sessionStorage'
  encrypt: true,
  channelName: 'my-app-channel',
});
```

### 2. Use with a framework adapter
Connect to your preferred framework (Pinia/Vue, React, or Svelte) using the appropriate adapter methods for getting and setting storage values.

```ts
import { getPiniaAdapter } from 'storagefy';

const { setInStorage, getFromStorage } = getPiniaAdapter();

await getFromStorage(useUserStore(), 'user');
await setInStorage(useUserStore(), 'user', {
  ignoreKeys: ['draft'],
  // Every write that fails (storage full, private mode, encryption failure) — the store keeps working,
  // but its state was not saved. Without it, a failed write is only logged in debug mode.
  onError: (error) => reportToMyApp(error),
});
```

## 🧱 Storage Adapters

### `startStoragefy(config)`

Initializes the storage adapter. If called multiple times, reuses the same adapter unless `fresh: true` or `forceRecreate: true` is passed.

#### Parameters:

- **adapter**: `'indexedDB' | 'localStorage' | 'sessionStorage'`  
  *(default: `'indexedDB'`)*

- **dbName**: `string`  
  Name of the database (only used for IndexedDB)

- **storeName**: `string`  
  Store name (default: `'storagefy_db'`)

- **encrypt**: `boolean`  
  Enable encryption (default: `false`)

- **password**: `string`  
  The app's secret the encryption key is derived from (only with `encrypt: true`). See *Encryption* below

- **channelName**: `string`  
  Name for `BroadcastChannel` to sync across tabs

- **expireCheckInterval**: `number`  
  Interval (in ms) to check for expired values

- **description**: `string`  
  Description for IndexedDB metadata

- **fresh**: `boolean`  
  Always return a new instance (default: `false`)

- **forceRecreate**: `boolean`  
  Force recreate the singleton instance (default: `false`)

#### Example:

```ts
import { startStoragefy } from 'storagefy';

const adapter = startStoragefy({
  adapter: 'localStorage',
  encrypt: true,
});
```

### 🔄 Multi-Tab Sync (Optional)
Enable by configuring `channelName` during initialization. Automatically synchronizes state updates between:

- Browser tabs  
- Windows  
- iFrames  

```ts
const adapter = startStoragefy({
  channelName: 'my-app-sync',
});
```

Uses the BroadcastChannel API for real-time communication.

### 🔐 Encryption (Optional)
Enable by setting `encrypt: true`. Values are encrypted with AES-GCM (Web Crypto) and key names are obfuscated.

**What it protects — and what it does not.** Everything needed to decrypt lives in the browser:

- **Without `password`**, the AES key is derived from the storage key's own name. Anyone who knows this library can
  read the values (e.g. from DevTools). It hides data from casual inspection only.
- **With `password`**, the AES key is derived (PBKDF2) from your app's secret, with the storage key as salt. Reading
  the values then also needs that secret, which ships inside your app's JavaScript — much harder to read, never
  impossible.

**Never store tokens, passwords or anything secret with Storagefy** — encrypted or not. Keep it for data that is fine
to sit on the device (preferences, cached state, "signed in until").

**Cost:** PBKDF2 is slow on purpose (100,000 rounds), so each adapter derives the key of a storage key once and keeps
it in memory — a store that writes on every change does not pay it again.

Values written without `password` stay readable by adapters without `password` (the format is unchanged across
versions). Turning `password` on for existing data makes it unreadable: the adapter answers `null` and the app starts
from its initial state.

```ts
startStoragefy({
  encrypt: true,
  password: 'my-app-secret',
});
```

### 🧪 Example Use Cases
Common implementation scenarios:

- Persistent shopping carts  
- Authentication token storage  
- Cross-tab UI preference synchronization  
- Offline application state management  
- User session preservation  

### 📜 License
MIT License
