import { atom, createStore as createJotaiInternalStore } from "jotai";
import * as Storagefy from "storagefy";

// ------------------------------------------------------------------------------------------------

let LSAdapter = null;
let ReactAdapter = null;

function start() {
  LSAdapter = new Storagefy.LocalStorageAdapter({
    dbName: "storagefy_jotai_test",
    storeName: "storagefy_jotai_test_db",
    description: "Storagefy Jotai database",
    adapter: "localStorage",
    channelName: "storagefy_jotai_test_channel",
    version: 1,
    encrypt: false,
    enableSyncTabs: true,
  });

  ReactAdapter = new Storagefy.ReactAdapter(LSAdapter);
}
start();

// ------------------------------------------------------------------------------------------------

function getJotaiStore() {
  const jotaiStore = createJotaiInternalStore();

  const stateAtom = atom({
    items: [],
  });

  const getState = () => jotaiStore.get(stateAtom);

  const setState = (newState) => {
    jotaiStore.set(stateAtom, {
      ...jotaiStore.get(stateAtom),
      ...newState,
    });
  };

  const subscribe = (callback) => {
    return jotaiStore.sub(stateAtom, () => {
      callback(jotaiStore.get(stateAtom));
    });
  };

  // Add custom logic to manipulate the store state
  const addItem = (item) => {
    const state = getState();
    const existing = state.items.find(i => i.id === item.id);
    const updatedItems = existing
      ? state.items.map(i =>
          i.id === item.id ? { ...i, qty: i.qty + 1 } : i
        )
      : [...state.items, { ...item, qty: 1 }];
    setState({ items: updatedItems });
  };

  const removeItem = (id) => {
    const state = getState();
    const updatedItems = state.items
      .map(i => i.id === id ? { ...i, qty: i.qty - 1 } : i)
      .filter(i => i.qty > 0);
    setState({ items: updatedItems });
  };

  const clear = () => {
    setState({ items: [] });
  };

  const getTotal = () => {
    return getState().items.reduce((sum, item) => sum + item.price * item.qty, 0);
  };

  return {
    getState,
    setState,
    subscribe,
    addItem,
    removeItem,
    clear,
    getTotal
  };
}

// ------------------------------------------------------------------------------------------------

const cartStore = getJotaiStore();
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
