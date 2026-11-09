import { useEffect, useRef, useState, useSyncExternalStore, useCallback, useMemo } from "react";
import Header from "../components/Header.jsx";
import InternalLink from "../components/InternalLink.jsx";
import { localizePathname, stripLocaleFromPathname } from "../utils/locale.js";
import { createResume } from "./model.js";
import { getResumeRepository } from "./storage.js";
import { cvMessages } from "./messages.js";
import { getTemplate } from "./templates.js";
import ResumePreview, { ResumeThumbnail } from "./ResumePreview.jsx";
import ResumeForm from "./ResumeForm.jsx";
import TemplateGallery from "./TemplateGallery.jsx";
import Dialog from "./Dialog.jsx";
import "./cv.css";

function downloadText(text, name) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ResumeMenu({ resume, onAction, t }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null), trigger = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    ref.current.querySelector('[role="menuitem"]')?.focus();
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return <div className="cv-menu" ref={ref} onKeyDown={(e) => {
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); trigger.current?.focus(); }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) && open) {
      e.preventDefault(); const items = [...ref.current.querySelectorAll('[role="menuitem"]')]; const index = items.indexOf(document.activeElement); items[e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (index + (e.key === "ArrowUp" ? -1 : 1) + items.length) % items.length]?.focus();
    }
  }}><button type="button" ref={trigger} className="cv-icon-button" aria-label={`${t.more}: ${resume.title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); } }}>⋯</button>{open && <div className="cv-dropdown" role="menu" aria-label={t.more}>{["edit", "rename", "duplicate", "download", "delete"].map((action) => <button key={action} role="menuitem" type="button" className={action === "delete" ? "cv-danger" : ""} onClick={() => { setOpen(false); trigger.current?.focus(); onAction(action, resume); }}>{t[action]}</button>)}</div>}</div>;
}

function ManageDialog({ action, record, onConfirm, onClose, t }) {
  const [title, setTitle] = useState(record.title);
  const [error, setError] = useState(false);
  return <Dialog title={action === "delete" ? t.deleteTitle : t.renameTitle} onClose={onClose} closeLabel={t.close}>
    <form onSubmit={(e) => { e.preventDefault(); if (action !== "delete" && !title.trim()) { setError(true); return; } onConfirm(title.trim()); }}>
      {action === "delete" ? <p>{t.deleteText}</p> : <div className="cv-field"><label htmlFor="cv-rename">{t.resumeTitle}</label><input id="cv-rename" data-autofocus value={title} onChange={(e) => { setTitle(e.target.value); setError(false); }} maxLength={150} aria-invalid={error} />{error && <p className="cv-field-error">{t.titleRequired}</p>}</div>}
      <div className="cv-dialog-actions"><button type="button" className="cv-button cv-button-secondary" onClick={onClose} data-autofocus={action === "delete" || undefined}>{t.cancel}</button><button type="submit" className={`cv-button ${action === "delete" ? "cv-button-danger" : "cv-button-primary"}`}>{action === "delete" ? t.delete : t.save}</button></div>
    </form>
  </Dialog>;
}

export default function BuildCvApp({ pathname, navigate, locale, onReady, ...headerProps }) {
  const t = cvMessages(locale);
  useEffect(() => { onReady?.(); }, [onReady]);
  const resumeDateFormatter = useMemo(() => new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en", { dateStyle: "medium", timeStyle: "short" }), [locale]);
  const [repo] = useState(getResumeRepository);
  const library = useSyncExternalStore(repo.subscribe, repo.getSnapshot);
  const [management, setManagement] = useState(null);
  const [changeTemplate, setChangeTemplate] = useState(false);
  const [mobileTab, setMobileTab] = useState("form");
  const [notice, setNotice] = useState("");
  const [pdfBusy, setPdfBusy] = useState(null);
  const [nameError, setNameError] = useState(false);
  const allowUnload = useRef(false);
  const route = stripLocaleFromPathname(pathname).replace(/\/$/, "");
  const base = localizePathname("/build-cv", locale);
  const editorId = route.match(/^\/build-cv\/resume\/([^/]+)$/)?.[1];
  const record = editorId && library.records.find((r) => r.id === editorId);
  const isGallery = route === "/build-cv/templates";
  const dashboard = route === "/build-cv";
  const update = useCallback((resume) => repo.put(resume), [repo]);
  useEffect(() => { setManagement(null); setNotice(""); setNameError(false); setMobileTab("form"); }, [pathname]);
  useEffect(() => {
    const save = () => repo.flush();
    const visibility = () => { if (document.visibilityState === "hidden") save(); };
    const beforeUnload = (event) => { if (!allowUnload.current && !repo.flush() && repo.getSnapshot().dirty) { event.preventDefault(); event.returnValue = ""; } };
    const navigation = (event) => {
      const inWorkspace = /^\/(?:ar\/)?build-cv(?:\/|$)/.test(event.detail?.pathname ?? "");
      if (!repo.flush() && repo.getSnapshot().dirty && !inWorkspace) {
        setNotice(t.unsavedLeave);
        if (!window.confirm(`${t.unsavedLeave}\n\n${t.leaveAnyway}`)) event.preventDefault();
        else allowUnload.current = true;
      }
    };
    const storage = (e) => { if (e.key === "fursati-resumes-v1" || e.key === null) repo.refresh(); };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pagehide", save);
    window.addEventListener("storage", storage);
    window.addEventListener("fursati:before-navigate", navigation);
    document.addEventListener("visibilitychange", visibility);
    return () => { repo.flush(); window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("pagehide", save); window.removeEventListener("storage", storage); window.removeEventListener("fursati:before-navigate", navigation); document.removeEventListener("visibilitychange", visibility); };
  }, [repo, t]);

  function focusName() {
    setNameError(true); setMobileTab("form");
    setTimeout(() => { const field = document.getElementById("cv-full-name"); if (field) { field.closest("details").open = true; field.focus(); field.scrollIntoView({ block: "center" }); } }, 50);
  }
  async function exportPdf(resume) {
    repo.flush();
    if (!resume.data.personal.fullName.trim()) { if (record?.id !== resume.id) navigate(`${base}/resume/${resume.id}`); setTimeout(focusName, 50); return; }
    if (pdfBusy) return;
    setPdfBusy(resume.id); setNotice("");
    try { await new Promise((r) => setTimeout(r, 0)); const { downloadResumePdf } = await import("./pdf/export.jsx"); await downloadResumePdf(resume); }
    catch { setNotice(t.downloadFailed); }
    finally { setPdfBusy(null); }
  }
  function action(action, resume) {
    if (action === "edit") navigate(`${base}/resume/${resume.id}`);
    else if (action === "duplicate") { repo.duplicate(resume, t.copy); repo.flush(); }
    else if (action === "download") exportPdf(resume);
    else setManagement({ action, record: resume });
  }
  const backup = () => downloadText(repo.backup(), "Fursati_Resumes_Backup.json");
  return <div className="cv-feature">
    <Header {...headerProps} navigate={navigate} locale={locale} brandHeading={false} />
    <main className={`cv-shell ${record ? "cv-shell-editor" : ""}`}>
      {library.issue && <section className="cv-storage-warning" role="alert"><strong>{t.warning}</strong><p>{t[library.issue] ?? t.storageUnavailable}</p><div className="cv-inline-actions"><button type="button" className="cv-text-button" onClick={backup}>{t.backup}</button>{["corruptStorage", "newerVersion"].includes(library.issue) ? <button type="button" className="cv-text-button" onClick={() => { try { downloadText(repo.rawBackup(), "Fursati_Original_Storage.json"); } catch { setNotice(t.storageUnavailable); } }}>{t.originalBackup}</button> : library.issue === "conflict" ? <><button type="button" className="cv-text-button" onClick={() => repo.flush(true)}>{t.keepMine}</button><button type="button" className="cv-text-button" onClick={repo.discardPending}>{t.loadSaved}</button></> : <button type="button" className="cv-text-button" onClick={() => repo.flush()}>{t.retry}</button>}</div></section>}
      {notice && <p className="cv-notice" role="status">{notice}<button type="button" className="cv-icon-button" aria-label={t.close} onClick={() => setNotice("")}>×</button></p>}
      {pdfBusy && !record && <p className="cv-notice" role="status">{t.downloading}</p>}
      {dashboard ? <>
        <header className="cv-dashboard-heading"><div><p className="cv-eyebrow">FURSATI / CV STUDIO</p><h1>{t.myResumes}</h1><p>{t.subtitle}</p></div></header>
        <div className="cv-resume-grid">
          <button type="button" className="cv-new-resume" onClick={() => navigate(`${base}/templates`)}><span className="cv-new-plus" aria-hidden="true">+</span><strong>{t.newResume}</strong><span>A4 / US Letter</span></button>
          {[...library.records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((resume) => <article className="cv-resume-card" key={resume.id}><button type="button" className="cv-resume-preview-button" onClick={() => action("edit", resume)} aria-label={`${t.edit}: ${resume.title}`}><ResumeThumbnail resume={resume} /><span className="cv-open-resume">{t.edit} →</span></button><div className="cv-resume-card-footer"><button type="button" className="cv-resume-title" onClick={() => action("edit", resume)} title={resume.title}>{resume.title}</button><ResumeMenu resume={resume} t={t} onAction={action} /><p><time dateTime={resume.updatedAt}>{t.edited} {resumeDateFormatter.format(new Date(resume.updatedAt))}</time><span>{resume.paperSize === "LETTER" ? "US Letter" : "A4"}</span></p></div></article>)}
        </div>
      </> : isGallery ? <><InternalLink className="cv-back-link" href={base} navigate={navigate}>← {t.allResumes}</InternalLink><TemplateGallery t={t} onCancel={() => navigate(base)} onSelect={(templateId) => { const next = createResume(templateId); next.title = t.untitled; repo.put(next, { touch: false }); repo.flush(); navigate(`${base}/resume/${next.id}`); }} /></> : record ? <>
        <header className="cv-editor-heading"><div className="cv-editor-title"><InternalLink className="cv-back-link" href={base} navigate={navigate}>← {t.allResumes}</InternalLink><label className="cv-sr-only" htmlFor="cv-title">{t.resumeTitle}</label><input id="cv-title" value={record.title} onChange={(e) => update({ ...record, title: e.target.value })} onBlur={() => { if (!record.title.trim()) update({ ...record, title: t.untitled }); }} maxLength={150} /><span className={`cv-save-state ${library.issue ? "is-error" : ""}`} role="status">{library.issue ? `! ${t.notSaved}` : library.dirty ? t.saving : `✓ ${t.saved}`}</span></div><div className="cv-editor-actions"><button type="button" className="cv-button cv-button-secondary" onClick={() => setChangeTemplate(true)}>{t.changeTemplate}</button><button type="button" className="cv-button cv-button-primary" onClick={() => exportPdf(record)} disabled={Boolean(pdfBusy)}>{pdfBusy ? t.downloading : t.download} <span aria-hidden="true">↓</span></button></div></header>
        <div className="cv-editor-settings"><span className="cv-current-template">{getTemplate(record.templateId).name}</span><label>{t.paperSize}<select aria-label={t.paperSize} value={record.paperSize} onChange={(e) => update({ ...record, paperSize: e.target.value })}><option value="A4">A4</option><option value="LETTER">US Letter</option></select></label><label>{t.documentLanguage}<select aria-label={t.documentLanguage} value={record.language} onChange={(e) => update({ ...record, language: e.target.value })}><option value="en">{t.languageEnglish}</option><option value="ar">{t.languageArabic}</option></select></label></div>
        <div className="cv-mobile-tabs" role="tablist" aria-label={t.editor} onKeyDown={(e) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); const next = e.key === "Home" ? "form" : e.key === "End" ? "preview" : mobileTab === "form" ? "preview" : "form"; setMobileTab(next); document.getElementById(`cv-tab-${next}`)?.focus(); } }}><button type="button" id="cv-tab-form" role="tab" tabIndex={mobileTab === "form" ? 0 : -1} aria-selected={mobileTab === "form"} aria-controls="cv-form-panel" onClick={() => setMobileTab("form")}>{t.content}</button><button type="button" id="cv-tab-preview" role="tab" tabIndex={mobileTab === "preview" ? 0 : -1} aria-selected={mobileTab === "preview"} aria-controls="cv-preview-panel" onClick={() => setMobileTab("preview")}>{t.preview}</button></div>
        <div className={`cv-editor-layout cv-mobile-${mobileTab}`}><section className="cv-form-panel" id="cv-form-panel" aria-label={t.content}><ResumeForm resume={record} onChange={update} t={t} nameError={nameError && !record.data.personal.fullName.trim()} /></section><div className="cv-preview-panel" id="cv-preview-panel"><ResumePreview resume={record} t={t} /></div></div>
        {changeTemplate && <Dialog title={t.changeTemplate} onClose={() => setChangeTemplate(false)} closeLabel={t.close} wide><TemplateGallery resume={record} t={t} compact onCancel={() => setChangeTemplate(false)} onSelect={(templateId) => { update({ ...record, templateId }); setChangeTemplate(false); setNotice(t.templateChanged); }} /></Dialog>}
      </> : <section className="cv-welcome"><h1>{t.invalidRoute}</h1><InternalLink className="cv-button cv-button-primary" href={base} navigate={navigate}>{t.back}</InternalLink></section>}
    </main>
    {management && <ManageDialog {...management} t={t} onClose={() => setManagement(null)} onConfirm={(title) => { if (management.action === "delete") repo.remove(management.record.id); else { repo.put({ ...management.record, title }); repo.flush(); } setManagement(null); }} />}
  </div>;
}
