import React from "react";
import { Document, Page, View, Text, Link, Font, pdf } from "@react-pdf/renderer";
import { buildDocument } from "../document.js";
import { getTemplate } from "../templates.js";

let registered = false;
function registerFonts() {
  if (registered) return;
  for (const family of ["CvSans", "CvSerif", "CvArabic"]) {
    const extension = family === "CvArabic" ? "ttf" : "woff";
    const normal = [400, 700].map((weight) => ({ src: `${window.location.origin}/fonts/cv/${family}-${weight}.${extension}`, fontWeight: weight }));
    const italic = [400, 700].map((weight) => ({ src: `${window.location.origin}/fonts/cv/${family}-${weight}${family === "CvSerif" ? "-italic" : ""}.${extension}`, fontWeight: weight, fontStyle: "italic" }));
    Font.register({ family, fonts: [...normal, ...italic] });
  }
  Font.registerHyphenationCallback((word) => {
    if (Array.from(word).length <= 40) return [word];
    // Ordinary resume words are never hyphenated. Unusually long identifiers
    // still need legal break points so they cannot overflow the paper.
    const characters = Array.from(word), pieces = [];
    for (let i = 0; i < characters.length; i += 16) pieces.push(characters.slice(i, i + 16).join(""));
    return pieces;
  });
  registered = true;
}

// Keep logical Unicode input intact. Font changes are inline runs, never
// reversed strings or Arabic presentation-form substitutions.
function Runs({ text, family }) {
  return String(text ?? "").split(/([\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff][\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\s\d.,!?():;/-]*)/).filter(Boolean).map((part, index) => <Text key={index} style={{ fontFamily: /[\u0600-\u08ff]/.test(part) ? "CvArabic" : family }}>{part}</Text>);
}

function PdfBlock({ block, t, rtl }) {
  const runs = (text) => <Runs text={text} family={t.family} />;
  const base = { fontSize: t.bodySize, lineHeight: t.lineHeight, color: t.color };
  if (block.kind === "header") return <View style={{ paddingBottom: 9, textAlign: t.align === "center" ? "center" : rtl ? "right" : t.align }}>
    <Text style={{ fontSize: t.nameSize, lineHeight: 1.18, fontWeight: 700, color: t.accent }} orphans={2} widows={2}>{runs(block.name)}</Text>
    {block.title && <Text style={{ fontSize: 11, marginTop: 4, lineHeight: 1.35, fontStyle: "italic" }}>{runs(block.title)}</Text>}
    {!!block.contacts.length && <Text style={{ fontSize: 8.3, lineHeight: 1.5, marginTop: 5 }}>{block.contacts.map((contact, index) => <React.Fragment key={index}>{index > 0 && " | "}{contact.href ? <Link src={contact.href} style={{ color: t.color, textDecoration: "none" }}>{runs(contact.text)}</Link> : runs(contact.text)}</React.Fragment>)}</Text>}
  </View>;
  if (block.kind === "section") return <View minPresenceAhead={34} style={{ paddingTop: t.sectionGap, paddingBottom: 4 }}><Text style={{ fontSize: t.headingSize, fontWeight: 700, color: t.accent, lineHeight: 1.35, textAlign: t.sectionAlign === "center" ? "center" : rtl ? "right" : "left", textTransform: "uppercase", borderBottomWidth: t.ruleWidth, borderTopWidth: t.doubleRule ? t.ruleWidth : 0, borderColor: t.border, paddingTop: t.doubleRule ? 3 : 0, paddingBottom: 3 }}>{runs(block.text)}</Text></View>;
  if (block.kind === "entry") return <View minPresenceAhead={block.keepNext ? 20 : 0} style={{ paddingTop: t.entryGap, paddingBottom: 1, flexDirection: rtl ? "row-reverse" : "row", justifyContent: "space-between", gap: 12 }}><Text style={{ ...base, flex: 1 }}><Text style={{ fontWeight: 700 }}>{runs(block.text)}</Text>{block.detail && <Text style={{ fontStyle: "italic" }}>, {runs(block.detail)}</Text>}</Text>{block.date && <Text style={{ ...base, fontSize: 8.5, maxWidth: "37%", textAlign: rtl ? "left" : "right" }}>{runs(block.date)}</Text>}</View>;
  if (block.kind === "sub") return <View minPresenceAhead={14} style={{ flexDirection: rtl ? "row-reverse" : "row", justifyContent: "space-between", gap: 12, paddingBottom: 2 }}><Text style={{ ...base, fontStyle: "italic", flex: 1 }}>{runs(block.text)}</Text>{block.meta && <Text style={{ ...base, fontSize: 8.5, maxWidth: "37%", textAlign: rtl ? "left" : "right" }}>{runs(block.meta)}</Text>}</View>;
  if (block.kind === "listRow") return <View style={{ flexDirection: rtl ? "row-reverse" : "row", paddingBottom: t.paragraphGap }}>{block.items.map((text, i) => <Text key={i} style={{ ...base, width: `${100 / block.columns}%`, paddingRight: rtl ? 0 : 10, paddingLeft: rtl ? 10 : 0 }} orphans={2} widows={2}>• {runs(text)}</Text>)}</View>;
  return <Text style={{ ...base, paddingBottom: block.list ? 10 : t.paragraphGap, ...(block.kind === "bullet" ? { paddingLeft: rtl ? 0 : 10, paddingRight: rtl ? 10 : 0 } : {}) }} orphans={2} widows={2}>{block.kind === "bullet" && "• "}{block.href ? <Link src={block.href} style={{ color: t.color, textDecoration: "underline" }}>{runs(block.text)}</Link> : runs(block.text)}</Text>;
}

export function ResumePdfDocument({ resume }) {
  const template = getTemplate(resume.templateId);
  const rtl = resume.language === "ar";
  return <Document title={resume.title || "Resume"} author={resume.data.personal.fullName} subject="Professional resume" language={resume.language} creator="Fursati CV Studio">
    <Page size={resume.paperSize === "LETTER" ? "LETTER" : "A4"} wrap style={{ padding: template.margin, fontFamily: template.family, fontSize: template.bodySize, color: template.color, lineHeight: template.lineHeight, textAlign: rtl ? "right" : "left", direction: rtl ? "rtl" : "ltr", backgroundColor: "#ffffff" }}>
      {buildDocument(resume).map((block) => <PdfBlock key={block.id} block={block} t={template} rtl={rtl} />)}
    </Page>
  </Document>;
}

export async function createResumeBlob(resume) {
  registerFonts();
  return pdf(<ResumePdfDocument resume={resume} />).toBlob();
}

export async function downloadResumePdf(resume) {
  const blob = await createResumeBlob(resume);
  const url = URL.createObjectURL(blob);
  const filename = resume.data.personal.fullName.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\s+/g, "_").slice(0, 100) || "Professional";
  const link = document.createElement("a");
  link.href = url; link.download = `${filename}_Resume.pdf`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
