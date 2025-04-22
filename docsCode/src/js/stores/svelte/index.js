import { writable } from "svelte/store";
// import * as Storagefy from "storagefy";
import * as Storagefy from "../../../../../dist/index.cjs";

// ------------------------------------------------------------------------------------------------

let LSAdapter = null;
let SvelteAdapter = null;

// ------------------------------------------------------------------------------------------------

function start() {
  LSAdapter = new Storagefy.LocalStorageAdapter({
    dbName: "storagefy_svelte_test",
    storeName: "storagefy_svelte_test_db",
    description: "Storagefy Svelte database",
    adapter: "localStorage",
    channelName: "storagefy_svelte_test_channel",
    version: 1,
    encrypt: false,
    enableSyncTabs: true,
  });

  SvelteAdapter = new Storagefy.getSvelteAdapter({
    adapter: LSAdapter,
    fresh: true,
  });
}
start();

// ------------------------------------------------------------------------------------------------

const cartStore = writable({
  items: [],
});
cartStore.$id = "Svelte_CartStore_App";

let isReady = false;

// ------------------------------------------------------------------------------------------------

async function loadStores() {
  try {
    if (!isReady) {
      await SvelteAdapter.getFromStorage(cartStore, cartStore.$id);
      await SvelteAdapter.setInStorage(cartStore, cartStore.$id, {
        syncTabs: true,
      });
      isReady = true;
    }
    return { cartStore, loadStores };
  } catch (error) {
    console.error(error);
  }
}

loadStores();

// ------------------------------------------------------------------------------------------------

export { cartStore, loadStores };

// ------------------------------------------------------------------------------------------------
