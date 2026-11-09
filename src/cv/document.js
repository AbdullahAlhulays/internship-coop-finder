import { displayLink, formatMonth, safeLink } from "./model.js";
import { DOCUMENT_LABELS, getTemplate } from "./templates.js";

const has = (value) => typeof value === "string" && Boolean(value.trim());
const join = (...values) => values.filter(has).map((s) => s.trim()).join(" | ");
const paragraphs = (value) => (value ?? "").split(/\n+/).map((s) => s.trim()).filter(Boolean);

// Both renderers consume this ordered, single-column content model.
export function buildDocument(resume) {
  const { data, language = "en" } = resume;
  const labels = DOCUMENT_LABELS[language] ?? DOCUMENT_LABELS.en;
  const template = getTemplate(resume.templateId);
  const personal = data.personal;
  const contacts = [
    { text: personal.location },
    { text: personal.email, href: safeLink(personal.email, true) },
    { text: personal.phone, href: /^\+?[\d\s().-]+$/.test(personal.phone) ? `tel:${personal.phone.replace(/[^+\d]/g, "")}` : null },
    { text: displayLink(personal.linkedin), href: safeLink(personal.linkedin) },
    { text: displayLink(personal.website), href: safeLink(personal.website) },
  ].filter((c) => has(c.text));
  const blocks = [{ id: "header", kind: "header", name: personal.fullName, title: personal.title, contacts }];
  let sequence = 0;
  const push = (block) => blocks.push({ ...block, id: `block-${sequence++}` });
  const section = (key) => push({ kind: "section", key, text: labels[key], keepNext: true });
  const paragraph = (text, props = {}) => paragraphs(text).forEach((text) => push({ kind: "paragraph", text, ...props }));
  const list = (values, columns = template.listColumns) => {
    if (columns === 1) { paragraph(values.join(" | "), { list: true }); return; }
    for (let i = 0; i < values.length; i += columns) push({ kind: "listRow", items: values.slice(i, i + columns), columns });
  };
  const dates = (entry) => [formatMonth(entry.startDate, language), entry.current ? labels.present : formatMonth(entry.endDate, language)].filter(Boolean).join(" - ");
  if (has(data.summary)) { section("summary"); paragraph(data.summary); }
  const education = data.education.filter((e) => [e.institution, e.degree, e.field, e.description, e.gpa].some(has));
  const addEducation = () => { if (education.length) {
    section("education");
    education.forEach((e) => {
      const degree = join(e.degree, e.field);
      const degreeFirst = template.id === "classic";
      push({ kind: "entry", text: degreeFirst ? degree || e.institution : e.institution || degree, detail: template.inlineEntries && e.institution ? degree : "", date: dates(e), keepNext: Boolean(!template.inlineEntries && e.institution && degree || e.description || e.gpa) });
      if (!template.inlineEntries && e.institution && degree) push({ kind: "sub", text: degreeFirst ? e.institution : degree });
      if (e.gpa) paragraph(`${labels.gpa}: ${e.gpa}`);
      paragraph(e.description);
    });
  } };
  let experience = data.experience.filter((e) => [e.title, e.company, e.location, ...e.bullets].some(has));
  if (data.experienceOrder !== "custom") experience = [...experience].sort((a, b) => (b.current ? "9999" : b.endDate || b.startDate).localeCompare(a.current ? "9999" : a.endDate || a.startDate));
  if (experience.length) {
    section("experience");
    experience.forEach((e) => {
      const companyFirst = template.companyFirst || template.inlineEntries;
      push({ kind: "entry", text: companyFirst ? e.company || e.title : e.title || e.company, detail: template.inlineEntries && e.company ? e.title : "", date: template.inlineEntries ? join(dates(e), e.location) : dates(e), keepNext: Boolean(e.company || e.location || e.bullets.some(has)) });
      if (!template.inlineEntries && (e.title && e.company || e.location)) push({ kind: "sub", text: e.title && e.company ? companyFirst ? e.title : e.company : "", meta: e.location });
      e.bullets.filter(has).forEach((text) => push({ kind: "bullet", text }));
    });
  }
  addEducation();
  const projects = data.projects.filter((e) => [e.name, e.role, e.description, e.technologies, e.link].some(has));
  if (projects.length) {
    section("projects");
    projects.forEach((e) => {
      push({ kind: "entry", text: e.name || e.role, date: "", href: safeLink(e.link), keepNext: Boolean(e.description || e.technologies || e.role) });
      if (e.name && e.role) push({ kind: "sub", text: e.role });
      paragraph(e.description);
      paragraph(e.technologies);
      if (has(e.link)) push({ kind: "paragraph", text: displayLink(e.link), href: safeLink(e.link) });
    });
  }
  if (data.skills.some(has)) { section("skills"); list(data.skills.filter(has)); }
  const certifications = data.certifications.filter((e) => [e.name, e.issuer].some(has));
  const addCertifications = () => { if (certifications.length) {
    section("certifications");
    list(certifications.map((e) => join(e.name, e.issuer, formatMonth(e.date, language))));
  } };
  if (template.id === "classic") addCertifications();
  const languages = data.languages.filter((e) => has(e.name));
  if (languages.length) { section("languages"); list(languages.map((e) => e.proficiency ? `${e.name} (${e.proficiency})` : e.name), template.id === "corporate" ? 2 : template.listColumns); }
  if (template.id !== "classic") addCertifications();
  const additional = data.additional.filter((e) => [e.title, e.description].some(has));
  if (additional.length) {
    section("additional");
    additional.forEach((e) => { if (has(e.title)) push({ kind: "entry", text: e.title }); paragraph(e.description); });
  }
  return blocks;
}
