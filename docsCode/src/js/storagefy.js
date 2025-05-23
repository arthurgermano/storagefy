// import * as Storagefy from "storagefy";
import * as Storagefy from "../../../dist/index.cjs";

const storageAdapter = new Storagefy.startStoragefy({
  dbName: "storagefy",
  storeName: "storagefy_db",
  version: 1,
  encrypt: false,
  description: "Storagefy database",
  adapter: "localStorage",
  channelName: "storagefy_channel",
  enableSyncTabs: true
});

export { storageAdapter, Storagefy };