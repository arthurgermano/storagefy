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
/**
 * Whether a value is a revision — a record or a message may hold anything.
 * @param {unknown} value
 * @returns {value is Revision}
 */
export function isRevision(value: unknown): value is Revision;
/**
 * Whether a revision is newer than another: a later `at`, or the same `at` and a greater `by`. Nothing is older than
 * any revision.
 * @param {Revision} revision
 * @param {Revision} [than]
 * @returns {boolean}
 */
export function isNewerRevision(revision: Revision, than?: Revision): boolean;
/**
 * The revisions a storage adapter knows: the newest of each key — written here or told by another tab — and its own
 * last write of each key. A new write is always newer than every revision known, even after the key was removed (and
 * its stored revision with it).
 */
export class RevisionBook {
    /**
     * @param {string} by - The adapter that writes (see Revision.by).
     */
    constructor(by: string);
    by: string;
    /** @type {Map<string, Revision>} */
    _newest: Map<string, Revision>;
    /** @type {Map<string, NextRevision>} */
    _written: Map<string, NextRevision>;
    /**
     * Knows a revision of a key when it is newer than the one known.
     * @param {string} key - The storage key.
     * @param {unknown} revision - Anything that is not a revision is left out.
     */
    note(key: string, revision: unknown): void;
    /**
     * The revision of a new write of a key: newer than the one stored and than every one known.
     * @param {string} key - The storage key.
     * @param {unknown} stored - The revision stored with the key now (read with the write, so no write lands between).
     * @returns {NextRevision}
     */
    next(key: string, stored: unknown): NextRevision;
    /**
     * Keeps a write saved by this adapter, and what it was written after.
     * @param {string} key - The storage key.
     * @param {NextRevision} next - As next() gave it.
     */
    wrote(key: string, next: NextRevision): void;
    /**
     * The revision of this adapter's last write of a key.
     * @param {string} key - The storage key.
     * @returns {Revision|undefined}
     */
    written(key: string): Revision | undefined;
    /**
     * The newest revision of a key known when this adapter saved its last write of it — none when it knew none. A write
     * of another tab newer than it was not known: made at the same time, it may have landed after this one.
     * @param {string} key - The storage key.
     * @returns {Revision|undefined}
     */
    writtenAfter(key: string): Revision | undefined;
}
/**
 * The order of a write.
 */
export type Revision = {
    /**
     * - When it was written (ms since the epoch) — or, when the clock gives no later time than the
     * newest revision of the key known, one more than it: the revisions of a key always rise.
     */
    at: number;
    /**
     * - The adapter that wrote it: of two writes at the same `at`, the one with the greater `by` is
     * the newer, in every tab alike.
     */
    by: string;
};
/**
 * The revision of a new write, and the newest revision of the key known when it was made.
 */
export type NextRevision = {
    revision: Revision;
    /**
     * - None when no revision of the key was known (stored or told).
     */
    basis?: Revision;
};
