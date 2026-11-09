export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = "fursati-resumes-v1";
export const TEMPLATE_IDS = ["classic", "editorial", "corporate"];
export const canonicalTemplateId = (id) => id === "modern" ? "editorial" : id === "minimal" ? "corporate" : TEMPLATE_IDS.includes(id) ? id : "classic";
export const newId = () => globalThis.crypto?.randomUUID?.() ?? `cv-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const emptyData = () => ({
  personal: { fullName: "", title: "", email: "", phone: "", location: "", linkedin: "", website: "" },
  summary: "", education: [], experience: [], projects: [], skills: [],
  certifications: [], languages: [], additional: [], experienceOrder: "recent",
});

export const emptyEntry = (section) => ({
  education: { institution: "", degree: "", field: "", startDate: "", endDate: "", gpa: "", description: "" },
  experience: { title: "", company: "", location: "", startDate: "", endDate: "", current: false, bullets: [""] },
  projects: { name: "", role: "", description: "", technologies: "", link: "" },
  certifications: { name: "", issuer: "", date: "" },
  languages: { name: "", proficiency: "" },
  additional: { title: "", description: "" },
}[section]);

export function createResume(templateId = "classic") {
  const now = new Date().toISOString();
  return { id: newId(), title: "Untitled resume", templateId: canonicalTemplateId(templateId), paperSize: "A4", language: "en", data: emptyData(), createdAt: now, updatedAt: now, schemaVersion: SCHEMA_VERSION };
}

const string = (v) => typeof v === "string" ? v : "";
export function normalizeResume(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalidRecord");
  if (Number(value.schemaVersion ?? 0) > SCHEMA_VERSION) throw new Error("newerVersion");
  const original = value.data ?? value.content ?? {};
  const data = emptyData();
  for (const key of Object.keys(data.personal)) data.personal[key] = string(original.personal?.[key]);
  data.summary = string(original.summary);
  data.experienceOrder = original.experienceOrder === "custom" ? "custom" : "recent";
  data.skills = Array.isArray(original.skills) ? original.skills.filter((x) => typeof x === "string") : [];
  for (const section of ["education", "experience", "projects", "certifications", "languages", "additional"]) {
    data[section] = (Array.isArray(original[section]) ? original[section] : []).filter((x) => x && typeof x === "object").map((entry) => {
      const shape = emptyEntry(section);
      for (const key of Object.keys(shape)) shape[key] = key === "bullets"
        ? (Array.isArray(entry.bullets) ? entry.bullets.filter((x) => typeof x === "string") : [])
        : key === "current" ? entry.current === true : string(entry[key]);
      return { ...shape, id: string(entry.id) || newId() };
    });
  }
  const date = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : new Date().toISOString();
  return { ...value, id: string(value.id) || newId(), title: string(value.title) || "Untitled resume", templateId: canonicalTemplateId(value.templateId), paperSize: value.paperSize === "LETTER" ? "LETTER" : "A4", language: value.language === "ar" ? "ar" : "en", data, createdAt: date(value.createdAt), updatedAt: date(value.updatedAt), schemaVersion: SCHEMA_VERSION };
}

export function safeLink(value, email = false) {
  const input = value?.trim();
  if (!input) return null;
  if (email) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input) ? `mailto:${input}` : null;
  try {
    if (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^https?:/i.test(input)) return null;
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    return ["http:", "https:"].includes(url.protocol) && url.hostname.includes(".") ? url.href : null;
  } catch { return null; }
}

export function displayLink(value) {
  const href = safeLink(value);
  if (!href) return value;
  const url = new URL(href);
  const label = `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  // Keep lengthy tracking/query strings out of the visible CV. The complete
  // destination remains in the clickable annotation in both HTML and PDF.
  return label.length > 65 ? `${label.slice(0, 62)}…` : label;
}

const monthFormatters = new Map();
export function formatMonth(value, language = "en") {
  if (!/^\d{4}-\d{2}$/.test(value ?? "")) return value ?? "";
  const [year, month] = value.split("-").map(Number);
  if (month < 1 || month > 12) return value;
  const locale = language === "ar" ? "ar-SA-u-ca-gregory" : "en";
  if (!monthFormatters.has(locale)) monthFormatters.set(locale, new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }));
  return monthFormatters.get(locale).format(new Date(Date.UTC(year, month - 1, 15)));
}
