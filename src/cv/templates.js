import { canonicalTemplateId } from "./model.js";

const base = { family: "CvSerif", cssFamily: '"CvSerif", Georgia, serif', accent: "#161616", color: "#191919", align: "center", headingSize: 10.5, nameSize: 22, bodySize: 9.5, lineHeight: 1.28, border: "#555555", titleItalic: true };
export const TEMPLATES = [
  { ...base, id: "classic", name: "Classic Clear", bodySize: 9, lineHeight: 1.25, margin: 44, sectionGap: 8, ruleWidth: 1, sectionAlign: "start", entryGap: 4, paragraphGap: 2, listColumns: 2 },
  { ...base, id: "editorial", name: "Editorial Rule", margin: 48, sectionGap: 13, ruleWidth: .55, sectionAlign: "start", entryGap: 8, paragraphGap: 3, inlineEntries: true, listColumns: 1 },
  { ...base, id: "corporate", name: "Corporate", margin: 40, sectionGap: 12, ruleWidth: .6, sectionAlign: "center", entryGap: 7, paragraphGap: 3, doubleRule: true, companyFirst: true, listColumns: 3 },
];
export const getTemplate = (id) => TEMPLATES.find((t) => t.id === canonicalTemplateId(id)) ?? TEMPLATES[0];
export const PAPER = { A4: { width: 595.28, height: 841.89, label: "A4" }, LETTER: { width: 612, height: 792, label: "US Letter" } };
export const DOCUMENT_LABELS = {
  en: { summary: "Summary", education: "Education", experience: "Professional Experience", projects: "Projects", skills: "Skills", certifications: "Certificates", languages: "Languages", additional: "Additional Information", present: "Present", gpa: "GPA" },
  ar: { summary: "الملخص المهني", education: "التعليم", experience: "الخبرة العملية", projects: "المشاريع", skills: "المهارات", certifications: "الشهادات", languages: "اللغات", additional: "معلومات إضافية", present: "حتى الآن", gpa: "المعدل" },
};
