function isRevision(value) {
  return Number.isFinite(value?.at) && typeof value.by === "string";
}
function isNewerRevision(revision, than) {
  if (!than) {
    return true;
  }
  return revision.at > than.at || revision.at === than.at && revision.by > than.by;
}
class RevisionBook {
  /**
   * @param {string} by - The adapter that writes (see Revision.by).
   */
  constructor(by) {
    this.by = by;
    this._newest = /* @__PURE__ */ new Map();
    this._written = /* @__PURE__ */ new Map();
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Knows a revision of a key when it is newer than the one known.
   * @param {string} key - The storage key.
   * @param {unknown} revision - Anything that is not a revision is left out.
   */
  note(key, revision) {
    if (isRevision(revision) && isNewerRevision(revision, this._newest.get(key))) {
      this._newest.set(key, revision);
    }
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * The revision of a new write of a key: newer than the one stored and than every one known.
   * @param {string} key - The storage key.
   * @param {unknown} stored - The revision stored with the key now (read with the write, so no write lands between).
   * @returns {NextRevision}
   */
  next(key, stored) {
    const known = this._newest.get(key);
    const basis = isRevision(stored) && isNewerRevision(stored, known) ? stored : known;
    return { revision: { at: Math.max(Date.now(), (basis?.at ?? 0) + 1), by: this.by }, basis };
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Keeps a write saved by this adapter, and what it was written after.
   * @param {string} key - The storage key.
   * @param {NextRevision} next - As next() gave it.
   */
  wrote(key, next) {
    this._written.set(key, next);
    this.note(key, next.revision);
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * The revision of this adapter's last write of a key.
   * @param {string} key - The storage key.
   * @returns {Revision|undefined}
   */
  written(key) {
    return this._written.get(key)?.revision;
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * The newest revision of a key known when this adapter saved its last write of it — none when it knew none. A write
   * of another tab newer than it was not known: made at the same time, it may have landed after this one.
   * @param {string} key - The storage key.
   * @returns {Revision|undefined}
   */
  writtenAfter(key) {
    return this._written.get(key)?.basis;
  }
}
export {
  RevisionBook,
  isNewerRevision,
  isRevision
};
//# sourceMappingURL=revisions.js.map