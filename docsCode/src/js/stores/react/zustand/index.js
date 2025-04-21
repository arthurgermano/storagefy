import { createStore } from "zustand";
import * as Storagefy from "../../../../../../src/index.js";

// ------------------------------------------------------------------------------------------------

let LSAdapter = null;
let ReactAdapter = null;

function start() {
  LSAdapter = new Storagefy.LocalStorageAdapter({
    dbName: "storagefy_zustand_test",
    storeName: "storagefy_zustand_test_db",
    description: "Storagefy Zustand database",
    adapter: "localStorage",
    channelName: "storagefy_zustand_test_channel",
    version: 1,
    encrypt: false,
    enableSyncTabs: true,
  });

  ReactAdapter = new Storagefy.ReactAdapter(LSAdapter);
}
start();

// ------------------------------------------------------------------------------------------------

function createCartStore() {
  return createStore((set, get) => ({
    items: [],
    
    // Add custom logic to manipulate the store state
    addItem: (item) => {
      const state = get();
      const existing = state.items.find(i => i.id === item.id);
      const updatedItems = existing
        ? state.items.map(i =>
            i.id === item.id ? { ...i, qty: i.qty + 1 } : i
          )
        : [...state.items, { ...item, qty: 1 }];
      set({ items: updatedItems });
    },

    removeItem: (id) => {
      const state = get();
      const updatedItems = state.items
        .map(i => i.id === id ? { ...i, qty: i.qty - 1 } : i)
        .filter(i => i.qty > 0);
      set({ items: updatedItems });
    },

    clear: () => {
      set({ items: [] });
    },

    getTotal: () => {
      return get().items.reduce((sum, item) => sum + item.price * item.qty, 0);
    },
  }));
}

// ------------------------------------------------------------------------------------------------

const cartStore = createCartStore();
const CART_STORE_ID = "React_CartStore_App";
let isReady = false;

async function loadStores() {
  try {
    if (!isReady) {
      await ReactAdapter.getFromStorage(cartStore, CART_STORE_ID);
      await ReactAdapter.setInStorage(cartStore, CART_STORE_ID, {
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