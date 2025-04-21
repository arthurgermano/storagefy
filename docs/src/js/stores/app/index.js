import { init } from "astro/virtual-modules/prefetch.js";
import { Storagefy } from "../../storagefy.js";
import { defineStore, createPinia } from "pinia";;

// ------------------------------------------------------------------------------------------------

const useAppStore = defineStore("Storagefy_App", {
  state: () => ({
    mode: "dark",
    debugMode: false,
    debugLevel: 2,
  }),
  actions: {
    setDebugMode(mode) {
      this.debugMode = mode;
    },
    setDebugLevel(level) {
      this.debugLevel = level;
    },
  },
});

// ------------------------------------------------------------------------------------------------

const pinia = createPinia();
const appStore = useAppStore(pinia);
let isReady = false;

// ------------------------------------------------------------------------------------------------

async function loadStores() {
  try {
    if (!isReady) {
      await Storagefy.setPiniaStorage(appStore, appStore.$id, {
        syncTabs: true,
      });
    }
    isReady = true;

    globalThis.storagefyDebug = appStore.debugMode;
    globalThis.storagefyDebugLevel = appStore.debugLevel;
    return { appStore, loadStores };
  } catch (error) {
    console.error(error);
  }
}

loadStores();

// ------------------------------------------------------------------------------------------------

export { appStore, loadStores };
