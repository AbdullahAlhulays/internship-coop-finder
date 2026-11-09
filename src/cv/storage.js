import { STORAGE_KEY, SCHEMA_VERSION, normalizeResume, newId } from "./model.js";

export function parseLibrary(raw) {
  if (raw === null || raw === "") return [];
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error("corruptStorage"); }
  if (Number(value?.schemaVersion ?? value?.version ?? 0) > SCHEMA_VERSION) throw new Error("newerVersion");
  const records = Array.isArray(value) ? value : value?.resumes;
  if (!Array.isArray(records)) throw new Error("corruptStorage");
  const ids = new Set();
  return records.map((record) => {
    const normalized = normalizeResume(record);
    if (ids.has(normalized.id)) throw new Error("corruptStorage");
    ids.add(normalized.id);
    return normalized;
  });
}

export class ResumeRepository {
  constructor(storage) {
    this.storage = storage;
    this.listeners = new Set();
    this.pending = new Map();
    this.timer = null;
    this.snapshot = { records: [], issue: null, dirty: false, savedAt: null };
    this.refresh();
  }
  subscribe = (listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = () => this.snapshot;
  emit(patch) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach((fn) => fn()); }
  read() {
    if (!this.storage) throw new Error("storageUnavailable");
    return parseLibrary(this.storage.getItem(STORAGE_KEY));
  }
  refresh = () => {
    try {
      const remote = this.read();
      const merged = new Map(remote.map((r) => [r.id, r]));
      for (const [id, op] of this.pending) {
        if (op.record) merged.set(id, op.record); else merged.delete(id);
      }
      this.emit({ records: [...merged.values()], issue: this.pending.size ? this.snapshot.issue : null });
    } catch (e) { this.emit({ issue: this.errorCode(e) }); }
  };
  errorCode(error) {
    return error?.name === "QuotaExceededError" || error?.code === 22 || error?.code === 1014 ? "quotaExceeded"
      : ["corruptStorage", "newerVersion", "conflict"].includes(error?.message) ? error.message : "storageUnavailable";
  }
  put = (record, { touch = true } = {}) => {
    const previous = this.snapshot.records.find((r) => r.id === record.id);
    const saved = { ...record, updatedAt: touch ? new Date().toISOString() : record.updatedAt };
    const expected = this.pending.has(saved.id) ? this.pending.get(saved.id).expected : previous?.updatedAt ?? null;
    this.pending.set(saved.id, { record: saved, expected });
    this.emit({ records: [...this.snapshot.records.filter((r) => r.id !== saved.id), saved], dirty: true });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 750);
    return saved;
  };
  remove = (id) => {
    const previous = this.snapshot.records.find((r) => r.id === id);
    const expected = this.pending.has(id) ? this.pending.get(id).expected : previous?.updatedAt ?? null;
    this.pending.set(id, { record: null, expected });
    this.emit({ records: this.snapshot.records.filter((r) => r.id !== id), dirty: true });
    return this.flush();
  };
  flush = (force = false) => {
    clearTimeout(this.timer);
    if (!this.pending.size) return !this.snapshot.issue;
    try {
      const latest = new Map(this.read().map((r) => [r.id, r]));
      for (const [id, op] of this.pending) {
        const remote = latest.get(id);
        if (!force && !remote && op.expected !== null) throw new Error("conflict");
        if (!force && remote && remote.updatedAt !== op.expected && remote.updatedAt !== op.record?.updatedAt) throw new Error("conflict");
        if (op.record) latest.set(id, op.record); else latest.delete(id);
      }
      this.storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, resumes: [...latest.values()] }));
      this.pending.clear();
      this.emit({ issue: null, dirty: false, savedAt: new Date().toISOString(), records: [...latest.values()] });
      return true;
    } catch (e) { this.emit({ issue: this.errorCode(e), dirty: true }); return false; }
  };
  discardPending = () => { clearTimeout(this.timer); this.pending.clear(); this.emit({ dirty: false }); this.refresh(); };
  duplicate = (record, suffix = "copy") => {
    const now = new Date().toISOString();
    return this.put({ ...structuredClone(record), id: newId(), title: `${record.title} (${suffix})`, createdAt: now, updatedAt: now }, { touch: false });
  };
  import = (raw) => {
    if (raw.length > 5_000_000) throw new Error("backupTooLarge");
    const records = parseLibrary(raw);
    if (records.length > 100) throw new Error("backupTooLarge");
    for (const record of records) this.put({ ...record, id: newId() });
    this.flush();
    return records.length;
  };
  backup = () => JSON.stringify({ schemaVersion: SCHEMA_VERSION, resumes: this.snapshot.records }, null, 2);
  rawBackup = () => this.storage?.getItem(STORAGE_KEY) ?? this.backup();
}

// A session singleton also retains unsaved work when storage is blocked and the
// visitor switches between this feature and Opportunities without reloading.
let repository;
export function getResumeRepository() {
  if (!repository) {
    let storage;
    try { storage = window.localStorage; } catch { /* Memory-only mode reports a visible warning. */ }
    repository = new ResumeRepository(storage);
  }
  return repository;
}
