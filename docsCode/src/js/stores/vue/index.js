import { defineStore, createPinia } from "pinia";
// import * as Storagefy from "storagefy";
import * as Storagefy from "../../../../../dist/index.cjs";

// ------------------------------------------------------------------------------------------------

let LSAdapter = null;
let PiniaAdapter = null;

// ------------------------------------------------------------------------------------------------

function start() {
  LSAdapter = new Storagefy.LocalStorageAdapter({
    dbName: "storagefy_vue_test",
    storeName: "storagefy_vue_test_db",
    description: "Storagefy Vue database",
    adapter: "localStorage",
    channelName: "storagefy_vue_test_channel",
    version: 1,
    encrypt: false,
    enableSyncTabs: true,
  });

  PiniaAdapter = new Storagefy.getPiniaAdapter({
    adapter: LSAdapter,
    fresh: true
  });
}
start();

// ------------------------------------------------------------------------------------------------

const useCartStore = defineStore("Vue_CartStore_App", {
  state: () => ({
    items: [],
  }),
  actions: {
    addItem(item) {
      const existing = this.items.find((i) => i.id === item.id);
      if (existing) existing.qty++;
      else this.items.push({ ...item, qty: 1 });
    },
    removeItem(id) {
      this.items = this.items.filter((i) => i.id !== id);
    },
    clear() {
      this.items = [];
    },
  },
});

// ------------------------------------------------------------------------------------------------

const pinia = createPinia();
const cartStore = useCartStore(pinia);
let isReady = false;

// ------------------------------------------------------------------------------------------------

async function loadStores() {
  try {
    if (!isReady) {
      await PiniaAdapter.getFromStorage(cartStore, cartStore.$id);
      await PiniaAdapter.setInStorage(cartStore, cartStore.$id, {
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
