// import * as Storagefy from "storagefy";
import * as Storagefy from "../../../../../../dist/index.cjs";
import store from "./store.js";

// ------------------------------------------------------------------------------------------------

let LSAdapter = null;
let ReactAdapter = null;
let isReady = false;

// ------------------------------------------------------------------------------------------------

function start() {
  LSAdapter = new Storagefy.LocalStorageAdapter({
    dbName: "storagefy_redux_test",
    storeName: "storagefy_redux_test_db",
    description: "Storagefy Redux database",
    adapter: "localStorage",
    channelName: "storagefy_redux_test_channel",
    version: 1,
    encrypt: false,
    enableSyncTabs: true,
  });

  ReactAdapter = new Storagefy.getReactAdapter({
    adapter: LSAdapter,
    fresh: true,
  });
}
start();

// ------------------------------------------------------------------------------------------------

const cartStore = store;
cartStore.$id = "React_Redux_CartStore_App";

// ------------------------------------------------------------------------------------------------

async function loadStores() {
  try {
    if (!isReady) {
      await ReactAdapter.getFromStorage(cartStore, cartStore.$id);
      await ReactAdapter.setInStorage(cartStore, cartStore.$id, {
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