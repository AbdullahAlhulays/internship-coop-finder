import test from "node:test";
import assert from "node:assert/strict";
import { createResume, normalizeResume, safeLink, STORAGE_KEY } from "../src/cv/model.js";
import { ResumeRepository, parseLibrary } from "../src/cv/storage.js";
import { buildDocument } from "../src/cv/document.js";

class MemoryStorage {
  value = null; writes = 0;
  getItem() { return this.value; }
  setItem(key, value) { assert.equal(key, STORAGE_KEY); this.writes++; this.value = value; }
}
test("autosave batches changes and restores every record", () => {
  const storage = new MemoryStorage(), repo = new ResumeRepository(storage);
  const record = createResume(); record.data.personal.fullName = "Alex Morgan";
  repo.put(record); repo.put({ ...record, title: "Engineering" });
  assert.equal(storage.writes, 0); assert.equal(repo.getSnapshot().dirty, true);
  assert.equal(repo.flush(), true); assert.equal(storage.writes, 1);
  assert.equal(new ResumeRepository(storage).getSnapshot().records[0].title, "Engineering");
});
test("duplicates have independent IDs, dates and deep content", () => {
  const repo = new ResumeRepository(new MemoryStorage()); const record = repo.put(createResume());
  record.data.skills = ["React"]; repo.put(record); repo.flush();
  const duplicate = repo.duplicate(record); duplicate.data.skills.push("SQL"); repo.put(duplicate); repo.flush();
  assert.notEqual(duplicate.id, record.id);
  assert.deepEqual(repo.getSnapshot().records.find((r) => r.id === record.id).data.skills, ["React"]);
});
test("invalid JSON and future schemas are never overwritten", () => {
  for (const value of ["{bad-json", JSON.stringify({ schemaVersion: 99, resumes: [] })]) {
    const storage = new MemoryStorage(); storage.value = value; const repo = new ResumeRepository(storage);
    assert.ok(repo.getSnapshot().issue); repo.put(createResume()); assert.equal(repo.flush(), false);
    assert.equal(storage.value, value); assert.equal(storage.writes, 0);
  }
});
test("legacy data migration preserves known content", () => {
  const r = createResume(); delete r.schemaVersion; r.content = r.data; delete r.data;
  r.content.personal.fullName = "Legacy Name";
  assert.equal(parseLibrary(JSON.stringify({ version: 0, resumes: [r] }))[0].data.personal.fullName, "Legacy Name");
});
test("quota failure keeps work in memory with a visible failure state", () => {
  const storage = new MemoryStorage(); storage.setItem = () => { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; };
  const repo = new ResumeRepository(storage); repo.put({ ...createResume(), title: "Keep my work" });
  assert.equal(repo.flush(), false); assert.equal(repo.getSnapshot().issue, "quotaExceeded");
  assert.equal(repo.getSnapshot().records[0].title, "Keep my work"); assert.equal(repo.getSnapshot().dirty, true);
});
test("cross-tab changes merge independent records and protect conflicting edits", () => {
  const storage = new MemoryStorage(), a = new ResumeRepository(storage); const r = a.put(createResume()); a.flush();
  const b = new ResumeRepository(storage); a.put({ ...r, title: "Tab A", updatedAt: "2026-01-02T00:00:00Z" }, { touch: false }); a.flush();
  b.put({ ...r, title: "Tab B", updatedAt: "2026-01-03T00:00:00Z" }, { touch: false }); assert.equal(b.flush(), false); assert.equal(b.getSnapshot().issue, "conflict");
  assert.equal(parseLibrary(storage.value)[0].title, "Tab A"); assert.equal(b.flush(true), true); assert.equal(parseLibrary(storage.value)[0].title, "Tab B");
});
test("import adds new IDs without replacing originals; deletion removes only chosen record", () => {
  const repo = new ResumeRepository(new MemoryStorage()), record = repo.put(createResume()); repo.flush();
  repo.import(repo.backup()); assert.equal(repo.getSnapshot().records.length, 2);
  assert.notEqual(repo.getSnapshot().records[0].id, repo.getSnapshot().records[1].id);
  repo.remove(record.id); assert.equal(repo.getSnapshot().records.length, 1);
});
test("documents omit empty sections, retain reading order and sort experience", () => {
  const r = createResume(); assert.equal(buildDocument(r).length, 1);
  r.data.summary = "Professional introduction";
  r.data.experience = [{ id: "a", title: "Earlier", company: "A", startDate: "2020-01", endDate: "2021-01", bullets: [] }, { id: "b", title: "Recent", company: "B", startDate: "2024-01", current: true, bullets: ["Built useful software"] }];
  let blocks = buildDocument(r); assert.ok(blocks.findIndex((x) => x.text === "Recent") < blocks.findIndex((x) => x.text === "Earlier"));
  assert.ok(blocks.findIndex((x) => x.text === "Professional introduction") < blocks.findIndex((x) => x.text === "Professional Experience"));
  r.data.experienceOrder = "custom"; blocks = buildDocument(r); assert.ok(blocks.findIndex((x) => x.text === "Earlier") < blocks.findIndex((x) => x.text === "Recent"));
});
test("retired template IDs map to replacements without changing saved information", () => {
  for (const [oldId, newId] of [["modern", "editorial"], ["minimal", "corporate"]]) {
    const record = createResume(); record.templateId = oldId; record.data.personal.fullName = "Keep This Name"; record.data.skills = ["SQL", "Planning"];
    const migrated = normalizeResume(record);
    assert.equal(migrated.templateId, newId); assert.equal(migrated.id, record.id); assert.deepEqual(migrated.data, record.data);
  }
  for (const invalid of ["__proto__", "toString", null]) assert.equal(normalizeResume({ ...createResume(), templateId: invalid }).templateId, "classic");
});
test("links accept websites and reject executable or malformed schemes", () => {
  assert.equal(safeLink("example.com/me"), "https://example.com/me");
  for (const link of ["javascript:alert(1)", "data:text/html,hello", "ftp://example.com", "not a link"]) assert.equal(safeLink(link), null);
});
