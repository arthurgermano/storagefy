// How an app in TypeScript uses Storagefy — compiled with `strict` against the published types (dist/types, through
// the package's own "exports"). Every line must compile; every @ts-expect-error must be an error. Up to 1.2.x the
// first lines below did not compile (a storage adapter refused by the store adapters, syncTabs unknown, onError
// without a type) and the factories returned untyped functions. Up to 1.4.x the internals (the kept stores, the
// adapters' state) were public in the declarations, and an app that read them broke on a refactor: from 1.5.0 they
// are private or protected.
import {
  IndexedDBAdapter,
  LocalStorageAdapter,
  PiniaAdapter,
  ReactAdapter,
  SessionStorageAdapter,
  SvelteAdapter,
  getPiniaAdapter,
  setPiniaStorage,
  startStoragefy,
} from "storagefy";
import type {
  DataChange,
  FrameworkAdapterOptions,
  GetFromStorageOptions,
  ReadOptions,
  SetInStorageOptions,
  StorageAdapterOptions,
} from "storagefy";

declare const piniaStore: object;

// The option types an app names — e.g. to wrap the library in a helper of its own
const storageOptions: StorageAdapterOptions = { dbName: "app", keyDerivation: "hkdf" };
const keepOptions: SetInStorageOptions = { ignoreKeys: ["draft"], timeout: 60_000, syncTabs: true };
const loadOptions: GetFromStorageOptions = { onError: (error: Error) => void error.message };
const readOptions: ReadOptions = { onError: (error: Error) => void error.message };
const factoryOptions: FrameworkAdapterOptions = { fresh: true };
const onChange = (change: DataChange): string => change.origin;
void [storageOptions, keepOptions, loadOptions, readOptions, factoryOptions, onChange];

const indexedDb = new IndexedDBAdapter({
  dbName: "app",
  encrypt: true,
  password: "app-secret",
  keyDerivation: "hkdf",
  channelName: "app-tabs",
  enableSyncTabs: true,
  expireCheckInterval: 0,
});
const pinia = new PiniaAdapter(indexedDb);
new ReactAdapter(new LocalStorageAdapter({ dbName: "app" }));
new SvelteAdapter(new SessionStorageAdapter({ dbName: "app", keyDerivation: "pbkdf2" }));

export async function keep(): Promise<void> {
  const loaded: true | undefined = await pinia.getFromStorage(piniaStore, "session", {
    onError: (error: Error) => void error.message,
  });
  void loaded;
  const kept: boolean = await pinia.setInStorage(piniaStore, "session", {
    ignoreKeys: ["draft"],
    timeout: 60_000,
    syncTabs: true,
    onError: (error) => void error.cause,
  });
  void kept;
  const stored: boolean = await pinia.flush("session");
  const everyStored: boolean = await pinia.flush();
  void [stored, everyStored];

  const value: unknown = await indexedDb.get("session", { onError: (error) => void error.message });
  void value;
  const written: boolean | null = await indexedDb.set("session", { validUntil: 1 });
  void written;
  const listed: Array<{ key: string; value: unknown }> = await indexedDb.list("users__");
  void listed;
  const stop: () => void = indexedDb.onDataChanged((change) => void change.key);
  stop();

  const started = startStoragefy({ adapter: "localStorage", keyDerivation: "pbkdf2", enableSyncTabs: true });
  void started;
  const { setInStorage, getFromStorage, flush, destroy, destroyAll } = getPiniaAdapter({ adapter: indexedDb, fresh: true });
  await getFromStorage(piniaStore, "theme");
  await setInStorage(piniaStore, "theme", { syncTabs: true });
  const themeStored: boolean = await flush("theme");
  void themeStored;
  destroy("theme");
  destroyAll();
  await setPiniaStorage(piniaStore, "theme", { onError: (error) => void error.message });
}

// @ts-expect-error — not a key derivation Storagefy knows
new IndexedDBAdapter({ dbName: "app", keyDerivation: "md5" });

// @ts-expect-error — a store adapter needs a storage adapter, not another store adapter
new PiniaAdapter(pinia);

// @ts-expect-error — onError receives an Error, not a string
void pinia.setInStorage(piniaStore, "k", { onError: (message: string) => message });

// @ts-expect-error — keys are strings
void indexedDb.get(42);

// @ts-expect-error — timeout is a number of milliseconds
const wrongTimeout: SetInStorageOptions = { timeout: "1h" };
void wrongTimeout;

// @ts-expect-error — the key of a store is a string
void pinia.flush(42);

// @ts-expect-error — the stores kept are internal: flush tells whether a store's state is stored
void pinia.stores;

// @ts-expect-error — the storage adapter under a store adapter is internal
void pinia.adapter;

// @ts-expect-error — the password is never read back
void indexedDb.password;

// @ts-expect-error — the channel between tabs is internal: onDataChanged listens to it
void indexedDb.channel;

// @ts-expect-error — the revisions of the writes are internal
void indexedDb.revisions;

// @ts-expect-error — the database connection is internal: waitReadiness waits for it
void indexedDb.dbPromise;

// @ts-expect-error — the writes in progress are internal
void indexedDb._pendingWrites;
