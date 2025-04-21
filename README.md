# 📦 storagefy

**Framework-agnostic, pluggable storage adapter library** for syncing your app state across localStorage, sessionStorage, and IndexedDB—with first-class support for **Pinia**, **React**, and **Svelte** stores.

---

## 🚀 Features

- 🔌 Plug-and-play storage: IndexedDB, localStorage, or sessionStorage
- 🧠 Built-in expiration + encryption support
- 🪄 Works out-of-the-box with **Pinia**, **Redux/Zustand/custom React**, and **Svelte stores**
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

## 🧩 Framework Adapters

Each adapter uses the same storage backend logic under the hood, with a thin layer for interacting with the store APIs.

---

### 📦 `getPiniaAdapter()`
Provides methods for working with Pinia/Vue stores including getting and setting storage values with optional configuration.
- `getFromStorage(store, key)`
- `setInStorage(store, key, options?)`

```ts
import { getPiniaAdapter } from 'storagefy';

const { getFromStorage, setInStorage } = getPiniaAdapter();
```


### ⚛️ `getReactAdapter()`
Provides:
- `getFromStorage(store, key)`
- `setInStorage(store, key, options?)`

```ts
import { getReactAdapter } from 'storagefy';

const adapter = getReactAdapter();
adapter.getFromStorage(store, key);
adapter.setInStorage(store, key, options);
```

Supports:
- `Redux`
- `Zustand`
- `Jotai`
- `Custom`


### 🔷 `getSvelteAdapter()`
Provides:
- `getFromStorage(store, key)`
- `setInStorage(store, key, options?)`

```ts
import { getSvelteAdapter } from 'storagefy';

const adapter = getSvelteAdapter();
adapter.getFromStorage(store, key);
adapter.setInStorage(store, key, options);
```

### 🛠 Utility Setters
Includes:
- `setPiniaStorage(store, key)`
- `setReactStorage(store, key, options)`
- `setSvelteStorage(store, key)

```ts
import {
  setPiniaStorage,
  setReactStorage,
  setSvelteStorage
} from 'storagefy';

await setPiniaStorage(store, 'cart');
await setReactStorage(store, 'user', { encrypt: true });
await setSvelteStorage(store, 'session');
```

### 🚨 Error Handling
All operations (`getFromStorage`, `setInStorage`, etc.) throw errors if improperly configured. Recommended to wrap in try/catch blocks.

```ts
try {
  await setPiniaStorage(myStore, 'settings');
} catch (e) {
  console.error('Storage error:', e);
}
```

### 📘 API Reference
Core Storage Methods:
- `getItem(key)`
- `setItem(key, value)`
- `removeItem(key)`
- `clear()`
- `keys()`

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

### 🔐 Basic Encryption (Optional)
Enable by setting `encrypt: true` in configuration. Provides:

- Simple encryption layer for stored data  
- Helps obscure values from casual inspection  
- Uses basic client-side encryption mechanism  

Important Security Notes:
- Consider additional server-side protection for sensitive data  
- Mainly prevents accidental exposure of stored values

```ts
startStoragefy({
  encrypt: true,
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
