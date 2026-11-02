import { isNewerRevision, isRevision } from "../helpers/revisions.js";
function onTabShown(adapter, callback) {
  const doc = globalThis.document;
  if (!adapter.sharedBetweenTabs || !doc) {
    return () => {
    };
  }
  const onVisibility = () => {
    if (doc.visibilityState === "visible") {
      callback();
    }
  };
  const onPageShow = (event) => {
    if (event.persisted) {
      callback();
    }
  };
  doc.addEventListener("visibilitychange", onVisibility);
  doc.defaultView.addEventListener("pageshow", onPageShow);
  return () => {
    doc.removeEventListener("visibilitychange", onVisibility);
    doc.defaultView.removeEventListener("pageshow", onPageShow);
  };
}
class TabFollower {
  /**
   * Starts listening.
   * @param {import("./KeptStore.js").default} kept
   */
  constructor(kept) {
    this.kept = kept;
    const { adapter, key } = kept;
    const stopChannel = adapter.onDataChanged((change) => {
      if (!change?.origin || change.key !== key || change.dbName !== adapter.dbName) {
        return;
      }
      adapter.revisions.note(key, change.revision);
      this._follow(change);
    });
    const stopShown = onTabShown(adapter, () => this._follow(null));
    const stopStored = adapter._onStoredChange(key, () => {
      if (kept.holdsOwnWrite()) {
        this._follow(null);
      }
    });
    this._stop = () => {
      stopChannel();
      stopShown();
      stopStored();
    };
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Stops listening to the other tabs.
   */
  stop() {
    this._stop();
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Queues a change of another tab, or a read of storage.
   * @private
   * @param {DataChange | null} change - null: read storage again.
   */
  _follow(change) {
    this.kept.queue(() => this._applyChange(change));
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Applies one change of another tab, or what storage holds — only when it is newer than the state the store holds
   * (see Revision): a message heard late, or a state another tab wrote before it knew this one, never undoes a newer
   * state (when it may have reached storage after the store's own write, that state is written again, see
   * _writeAgainIfOverwritten). A state the store already holds (ignoreKeys left out, as stored) is not applied again;
   * a key removed in the other tab leaves this store's state as it is. A change of 1.3.x (no revision) is applied as
   * then: when the state differs. Never rejects: a failure is told through onError.
   * @private
   * @param {DataChange | null} change - null: read storage again.
   * @returns {Promise<void>}
   */
  async _applyChange(change) {
    const { kept } = this;
    const options = { onError: kept.options.onError };
    let incoming;
    let revision;
    let fromStorage;
    try {
      do {
        await kept.ownWritesDone();
        ({ value: incoming, revision, fromStorage } = change === null ? { ...await kept.adapter._read(kept.key, options), fromStorage: true } : await kept.adapter._readChange(change, options));
      } while (kept.writing);
    } catch (error) {
      kept.report("read", error);
      return;
    }
    if (!kept.active || incoming === null) {
      return;
    }
    const ordered = isRevision(revision);
    if (ordered && !isNewerRevision(revision, kept.revision)) {
      await this._writeAgainIfOverwritten(revision, JSON.stringify(incoming), fromStorage);
      return;
    }
    kept.adopt(incoming, ordered ? revision : void 0);
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Writes the store's state again when another tab's write, older than the store's own last write, may have reached
   * storage after it — between tabs, localStorage orders no write of one with another's, and storage would keep the
   * state every tab left for the newer:
   *   - read from storage (the storage event, a tab shown again): it is there, it did;
   *   - told by its message: when it was not known as the store wrote, both were made at the same time and it may
   *     have — its write may even be on its way still. The storage event tells when it lands, but not always: Chromium
   *     leaves it out while this tab's own write is on its way.
   * Written again, storage ends with what the tabs hold — unless the older state is the store's (ignoreKeys left out):
   * storage holds it, whichever was saved last. Only with a storage the tabs share; with IndexedDB a write reads the
   * writes saved before it in its transaction, and none lands after a newer one. Never rejects: a failure is told
   * through onError (see KeptStore.persist).
   * @private
   * @param {Revision} revision - Of the other write: not newer than the store's.
   * @param {string} incomingForm - The other write's state, as JSON.
   * @param {boolean} fromStorage - Read from storage, not told by a message.
   * @returns {Promise<void>}
   */
  async _writeAgainIfOverwritten(revision, incomingForm, fromStorage) {
    const { kept } = this;
    const { adapter } = kept;
    if (!adapter.sharedBetweenTabs || !kept.holdsOwnWrite() || !isNewerRevision(kept.revision, revision)) {
      return;
    }
    if (!fromStorage && !isNewerRevision(revision, adapter.revisions.writtenAfter(kept.key))) {
      return;
    }
    const state = kept.current();
    if (kept.storedForm(state) !== incomingForm) {
      await kept.persist(state).catch(() => {
      });
    }
  }
}
var TabFollower_default = TabFollower;
export {
  TabFollower_default as default
};
//# sourceMappingURL=TabFollower.js.map