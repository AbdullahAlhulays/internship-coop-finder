import { useRef, useState } from "react";
import { TEMPLATES } from "./templates.js";

export default function TemplateGallery({ resume, onSelect, onCancel, t, compact = false }) {
  const [selected, setSelected] = useState(resume?.templateId ?? "classic");
  const lastClick = useRef(null);
  const opening = useRef(false);
  const open = (id) => {
    if (opening.current) return;
    opening.current = true;
    onSelect(id);
  };
  const click = (id) => {
    const now = performance.now();
    if (lastClick.current?.id === id && now - lastClick.current.time < 500) open(id);
    else lastClick.current = { id, time: now };
  };
  return <div className={compact ? "cv-gallery cv-gallery-compact" : "cv-gallery"}>
    {!compact && <header className="cv-page-heading"><p className="cv-eyebrow">FURSATI / CV STUDIO</p><h1>{t.chooseTemplate}</h1></header>}
    <div className="cv-template-grid" role="radiogroup" aria-label={t.changeTemplate}>
      {TEMPLATES.map((template, index) => <label className={`cv-template-choice ${selected === template.id ? "is-selected" : ""}`} key={template.id} onDoubleClick={(event) => { event.preventDefault(); open(template.id); }}>
        <input type="radio" name="resume-template" aria-label={template.name} value={template.id} checked={selected === template.id} onChange={() => setSelected(template.id)} onClick={() => click(template.id)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); open(template.id); } }} />
        <div className="cv-template-paper"><picture><source srcSet={`/cv/templates/${template.id}.webp`} type="image/webp" /><img src={`/cv/templates/${template.id}.png`} alt={`${template.name} — ${t.templatePreview}`} width="1191" height="1684" loading={index === 0 ? "eager" : "lazy"} decoding="async" /></picture><span className="cv-template-check" aria-hidden="true">{selected === template.id ? "✓" : String(index + 1).padStart(2, "0")}</span></div>
        <div className="cv-template-caption"><strong>{template.name}</strong><span>{selected === template.id ? `✓ ${t.selected}` : t.select}</span></div>
      </label>)}
    </div>
    <div className="cv-gallery-actions"><button type="button" className="cv-button cv-button-secondary" onClick={onCancel}>{t.cancel}</button><button type="button" className="cv-button cv-button-primary" onClick={() => open(selected)}>{t.useTemplate} <span aria-hidden="true">→</span></button></div>
  </div>;
}
