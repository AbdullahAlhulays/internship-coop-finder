import { memo, useId, useState } from "react";
import { emptyEntry, newId, safeLink } from "./model.js";

function Field({ label, value = "", onChange, type = "text", placeholder, error, multiline = false, id: suppliedId }) {
  const autoId = useId();
  const id = suppliedId || autoId;
  const props = { id, value, onChange: (e) => onChange(e.target.value), placeholder, "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-error` : undefined, dir: "auto" };
  return <div className={`cv-field ${multiline ? "cv-field-wide" : ""}`}><label htmlFor={id}>{label}</label>{multiline ? <textarea {...props} rows={4} /> : <input {...props} type={type} />}{error && <span className="cv-field-error" id={`${id}-error`}>{error}</span>}</div>;
}

const entryFields = {
  education: [["institution", "institution"], ["degree", "degree"], ["field", "field"], ["gpa", "gpa"], ["startDate", "startDate", "month"], ["endDate", "endDate", "month"], ["description", "description", "textarea"]],
  experience: [["title", "jobTitle"], ["company", "company"], ["location", "location"], ["startDate", "startDate", "month"], ["endDate", "endDate", "month"]],
  projects: [["name", "projectName"], ["role", "role"], ["description", "description", "textarea"], ["technologies", "technologies"], ["link", "projectLink"]],
  certifications: [["name", "certificationName"], ["issuer", "issuer"], ["date", "issueDate", "month"]],
  languages: [["name", "language"], ["proficiency", "proficiency"]],
  additional: [["title", "additionalTitle"], ["description", "description", "textarea"]],
};

function EntryList({ section, entries, onChange, t }) {
  const update = (index, key, value) => onChange(entries.map((entry, i) => i === index ? { ...entry, [key]: value } : entry));
  function move(index, offset) {
    const next = [...entries];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next, true);
  }
  return <>
    {!entries.length && <p className="cv-section-empty">{t.noEntries}</p>}
    {entries.map((entry, index) => <fieldset className="cv-entry-form" key={entry.id}>
      <legend>{t[section]} {index + 1}</legend>
      <div className="cv-entry-actions"><button type="button" className="cv-icon-button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`${t.moveUp}: ${t[section]} ${index + 1}`}>↑</button><button type="button" className="cv-icon-button" onClick={() => move(index, 1)} disabled={index === entries.length - 1} aria-label={`${t.moveDown}: ${t[section]} ${index + 1}`}>↓</button><button type="button" className="cv-text-button cv-danger" onClick={() => onChange(entries.filter((_, i) => i !== index))}>{t.remove}</button></div>
      <div className="cv-field-grid">
        {entryFields[section].filter(([key]) => !(key === "endDate" && entry.current)).map(([key, label, type]) => <Field key={key} label={t[label]} value={entry[key]} onChange={(value) => update(index, key, value)} type={type === "month" ? "month" : "text"} multiline={type === "textarea"} placeholder={key === "proficiency" ? t.proficiencyPlaceholder : undefined} error={key === "link" && entry.link && !safeLink(entry.link) ? t.linkError : key === "endDate" && entry.startDate && entry.endDate && entry.startDate > entry.endDate ? t.dateError : undefined} />)}
      </div>
      {section === "experience" && <>
        <label className="cv-check"><input type="checkbox" checked={entry.current} onChange={(e) => update(index, "current", e.target.checked)} />{t.currentlyWorking}</label>
        <div className="cv-bullet-editor"><p className="cv-input-label">{t.achievements}</p>{entry.bullets.map((bullet, bulletIndex) => <div className="cv-bullet-field" key={bulletIndex}><label className="cv-sr-only" htmlFor={`${entry.id}-bullet-${bulletIndex}`}>{t.achievements} {bulletIndex + 1}</label><textarea id={`${entry.id}-bullet-${bulletIndex}`} value={bullet} rows={2} placeholder={t.bulletPlaceholder} onChange={(e) => update(index, "bullets", entry.bullets.map((text, i) => i === bulletIndex ? e.target.value : text))} dir="auto" /><button type="button" className="cv-icon-button" aria-label={`${t.remove}: ${t.achievements} ${bulletIndex + 1}`} onClick={() => update(index, "bullets", entry.bullets.filter((_, i) => i !== bulletIndex))}>×</button></div>)}<button type="button" className="cv-text-button" onClick={() => update(index, "bullets", [...entry.bullets, ""])}>+ {t.addBullet}</button></div>
      </>}
    </fieldset>)}
    <button type="button" className="cv-button cv-button-secondary cv-add-entry" onClick={() => onChange([...entries, { ...emptyEntry(section), id: newId() }])}>+ {t.addEntry}</button>
  </>;
}

function Skills({ skills, onChange, t }) {
  const [draft, setDraft] = useState("");
  const id = useId();
  const add = (e) => {
    e.preventDefault();
    const known = new Set(skills.map((x) => x.toLowerCase()));
    const next = [...skills];
    for (const text of draft.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean)) if (!known.has(text.toLowerCase())) { next.push(text); known.add(text.toLowerCase()); }
    onChange(next); setDraft("");
  };
  return <><form className="cv-skill-entry" onSubmit={add}><label className="cv-sr-only" htmlFor={id}>{t.skills}</label><input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t.skillPlaceholder} dir="auto" /><button className="cv-button cv-button-secondary" disabled={!draft.trim()}>{t.add}</button></form><div className="cv-skill-list">{skills.map((skill, index) => <span className="cv-skill" key={`${skill}-${index}`} dir="auto">{skill}<button type="button" aria-label={`${t.deleteSkill}: ${skill}`} onClick={() => onChange(skills.filter((_, i) => i !== index))}>×</button></span>)}</div></>;
}

export default memo(function ResumeForm({ resume, onChange, t, nameError }) {
  const { data } = resume;
  const [renderedSections, setRenderedSections] = useState(() => new Set(["personal"]));
  const setData = (key, value, customOrder) => onChange({ ...resume, data: { ...data, [key]: value, ...(key === "experience" && customOrder ? { experienceOrder: "custom" } : {}) } });
  const setPersonal = (key, value) => setData("personal", { ...data.personal, [key]: value });
  return <div className="cv-form-sections">
    <p className="cv-form-hint">{t.contentHint}</p>
    {["personal", "summary", "education", "experience", "projects", "skills", "certifications", "languages", "additional"].map((section, index) => <details className="cv-form-section" key={section} open={section === "personal" || undefined} onToggle={(event) => { if (event.currentTarget.open) setRenderedSections((current) => current.has(section) ? current : new Set([...current, section])); }}>
      <summary><span className="cv-section-number">{String(index + 1).padStart(2, "0")}</span><span>{t[section]}</span><span className="cv-section-chevron" aria-hidden="true">⌄</span></summary>
      {renderedSections.has(section) && <div className="cv-section-body">
        {section === "personal" ? <div className="cv-field-grid">{[["fullName", "fullName"], ["title", "professionalTitle"], ["email", "email"], ["phone", "phone"], ["location", "location"], ["linkedin", "linkedin"], ["website", "website"]].map(([key, label]) => <Field key={key} id={key === "fullName" ? "cv-full-name" : undefined} label={t[label]} value={data.personal[key]} onChange={(value) => setPersonal(key, value)} type={key === "email" ? "email" : key === "phone" ? "tel" : "text"} error={key === "fullName" && nameError ? t.nameRequired : key === "email" && data.personal.email && !safeLink(data.personal.email, true) ? t.emailError : ["website", "linkedin"].includes(key) && data.personal[key] && !safeLink(data.personal[key]) ? t.linkError : undefined} />)}</div>
          : section === "summary" ? <><p className="cv-section-help">{t.summaryHelp}</p><Field label={t.summary} value={data.summary} onChange={(value) => setData("summary", value)} multiline placeholder={t.summaryPlaceholder} /></>
          : section === "skills" ? <Skills skills={data.skills} onChange={(value) => setData("skills", value)} t={t} />
          : <>
            {section === "experience" && <div className="cv-order-hint"><span>{data.experienceOrder === "custom" ? t.orderCustom : t.orderRecent}</span>{data.experienceOrder === "custom" && <button type="button" className="cv-text-button" onClick={() => setData("experienceOrder", "recent")}>{t.restoreRecent}</button>}</div>}
            {section === "additional" && <p className="cv-section-help">{t.additionalHelp}</p>}
            <EntryList section={section} entries={data[section]} onChange={(value, customOrder) => setData(section, value, customOrder)} t={t} />
          </>}
      </div>}
    </details>)}
  </div>;
});
