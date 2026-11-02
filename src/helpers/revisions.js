// ------------------------------------------------------------------------------------------------
// The revision of each write (1.4.0): the order of a write among every write of a key, in every tab of the app. A store
// applies another tab's state only when it is newer than the one it holds — an older message, or a stale state written
// late, never undoes a newer one.
// ------------------------------------------------------------------------------------------------

/**
 * The order of a write.
 * @typedef {Object} Revision
 * @property {number} at - When it was written (ms since the epoch) — or, when the clock gives no later time than the
 *   newest revision of the key known, one more than it: the revisions of a key always rise.
 * @property {string} by - The adapter that wrote it: of two writes at the same `at`, the one with the greater `by` is
 *   the newer, in every tab alike.
 */

/**
 * The revision of a new write, and the newest revision of the key known when it was made.
 * @typedef {Object} NextRevision
 * @property {Revision} revision
 * @property {Revision} [basis] - None when no revision of the key was known (stored or told).
 */

// ------------------------------------------------------------------------------------------------

/**
 * Whether a value is a revision — a record or a message may hold anything.
 * @param {unknown} value
 * @returns {value is Revision}
 */
export function isRevision(value) {
  return Number.isFinite(value?.at) && typeof value.by === "string";
}

// ------------------------------------------------------------------------------------------------

/**
 * Whether a revision is newer than another: a later `at`, or the same `at` and a greater `by`. Nothing is older than
 * any revision.
 * @param {Revision} revision
 * @param {Revision} [than]
 * @returns {boolean}
 */
export function isNewerRevision(revision, than) {
  if (!than) {
    return true;
  }
  return revision.at > than.at || (revision.at === than.at && revision.by > than.by);
}

// ------------------------------------------------------------------------------------------------

/**
 * The revisions a storage adapter knows: the newest of each key — written here or told by another tab — and its own
 * last write of each key. A new write is always newer than every revision known, even after the key was removed (and
 * its stored revision with it).
 */
export class RevisionBook {
  /**
   * @param {string} by - The adapter that writes (see Revision.by).
   */
  constructor(by) {
    this.by = by;
    /** @type {Map<string, Revision>} */
    this._newest = new Map();
    /** @type {Map<string, NextRevision>} */
    this._written = new Map();
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

// ------------------------------------------------------------------------------------------------
