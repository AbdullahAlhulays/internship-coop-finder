import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { buildDocument } from "./document.js";
import { getTemplate, PAPER } from "./templates.js";

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function documentStyle(resume) {
  const t = getTemplate(resume.templateId);
  return { "--cv-font": t.cssFamily, "--cv-color": t.color, "--cv-accent": t.accent, "--cv-rule": t.border, "--cv-rule-width": `${t.ruleWidth}pt`, "--cv-section-align": t.sectionAlign, "--cv-align": t.align === "center" ? "center" : resume.language === "ar" ? "right" : t.align, "--cv-name-size": `${t.nameSize}pt`, "--cv-body-size": `${t.bodySize}pt`, "--cv-heading-size": `${t.headingSize}pt`, "--cv-leading": t.lineHeight, "--cv-section-gap": `${t.sectionGap}pt`, "--cv-entry-gap": `${t.entryGap}pt`, "--cv-paragraph-gap": `${t.paragraphGap}pt` };
}

export function DocumentBlock({ block }) {
  if (block.kind === "header") return (
    <div className="cv-doc-header">
      {block.name && <div className="cv-doc-name" dir="auto">{block.name}</div>}
      {block.title && <div className="cv-doc-title" dir="auto">{block.title}</div>}
      {block.contacts.length > 0 && <div className="cv-doc-contacts" dir="auto">{block.contacts.map((c, i) => <span key={`${i}-${c.text}`}>{i > 0 && " | "}{c.href ? <a href={c.href} tabIndex={-1}>{c.text}</a> : c.text}</span>)}</div>}
    </div>
  );
  if (block.kind === "section") return <div className="cv-doc-section">{block.text}</div>;
  if (block.kind === "entry") return <div className="cv-doc-entry"><div className="cv-doc-entry-main" dir="auto"><strong>{block.text}</strong>{block.detail && <>, <em>{block.detail}</em></>}</div>{block.date && <span className="cv-doc-date">{block.date}</span>}</div>;
  if (block.kind === "sub") return <div className="cv-doc-sub"><em dir="auto">{block.text}</em>{block.meta && <span className="cv-doc-date">{block.meta}</span>}</div>;
  if (block.kind === "listRow") return <div className="cv-doc-list-row" style={{ gridTemplateColumns: `repeat(${block.columns}, minmax(0, 1fr))` }}>{block.items.map((text, i) => <div key={i} className="cv-doc-list-item" dir="auto"><span aria-hidden="true">•</span><span>{text}</span></div>)}</div>;
  return <div className={`cv-doc-paragraph ${block.kind === "bullet" ? "cv-doc-bullet" : ""} ${block.list ? "cv-doc-inline-list" : ""} ${block.continued ? "cv-doc-continued" : ""}`} dir="auto">{block.kind === "bullet" && <span className="cv-doc-bullet-dot">•</span>}<span>{block.href ? <a href={block.href} tabIndex={-1}>{block.text}</a> : block.text}</span></div>;
}

export function packBlocks(blocks, heights, capacity) {
  const pages = [];
  let page = [], used = 0;
  blocks.forEach((block, index) => {
    const height = heights[index] ?? 0;
    const following = block.keepNext ? Math.min(heights[index + 1] ?? 0, 48) : 0;
    if (page.length && used + height + following > capacity) { pages.push(page); page = []; used = 0; }
    page.push(block); used += height;
  });
  if (page.length) pages.push(page);
  return pages.length ? pages : [[]];
}

export const ResumeThumbnail = memo(function ResumeThumbnail({ resume }) {
  const ref = useRef(null);
  const width = useWidth(ref);
  const paper = PAPER[resume.paperSize] ?? PAPER.A4;
  const template = getTemplate(resume.templateId);
  const blocks = useMemo(() => buildDocument(resume), [resume.data, resume.language, resume.templateId]);
  return (
    <div className="cv-thumbnail" ref={ref} style={{ aspectRatio: `${paper.width} / ${paper.height}` }} aria-hidden="true">
      <div className={`cv-document cv-template-${resume.templateId}`} dir={resume.language === "ar" ? "rtl" : "ltr"} style={{ ...documentStyle(resume), width: `${paper.width}pt`, minHeight: `${paper.height}pt`, padding: `${template.margin}pt`, transform: `scale(${width / (paper.width * 4 / 3)})` }}>
        {blocks.map((block) => <DocumentBlock key={block.id} block={block} />)}
      </div>
    </div>
  );
});

export default memo(function ResumePreview({ resume, t }) {
  const deferred = useDeferredValue(resume);
  const container = useRef(null);
  const measure = useRef(null);
  const width = useWidth(container);
  const [zoom, setZoom] = useState("fit");
  const [pages, setPages] = useState([[]]);
  const [fontRevision, setFontRevision] = useState(0);
  const blocks = useMemo(() => buildDocument(deferred), [deferred.data, deferred.language, deferred.templateId]);
  const template = getTemplate(deferred.templateId);
  const paper = PAPER[deferred.paperSize] ?? PAPER.A4;
  useEffect(() => {
    let active = true;
    const update = () => { if (active) setFontRevision((x) => x + 1); };
    document.fonts.ready.then(update);
    document.fonts.addEventListener("loadingdone", update);
    return () => { active = false; document.fonts.removeEventListener("loadingdone", update); };
  }, [deferred.templateId]);
  useLayoutEffect(() => {
    if (!measure.current || width <= 0) return;
    const capacity = (paper.height - template.margin * 2) * 4 / 3 - 2;
    const children = [...measure.current.children];
    const expanded = [], heights = [];
    children.forEach((node, index) => {
      const block = blocks[index];
      const height = node.getBoundingClientRect().height;
      if (height <= capacity || !["paragraph", "bullet"].includes(block.kind)) { expanded.push(block); heights.push(height); return; }
      // Extremely long text is split at word boundaries for the HTML preview.
      // PDF Text nodes independently wrap across pages without clipping.
      const words = block.text.split(/\s+/);
      const clone = node.cloneNode(true);
      measure.current.appendChild(clone);
      const textNode = clone.querySelector("span:last-child") ?? clone;
      let cursor = 0, part = 0;
      while (cursor < words.length) {
        let low = cursor + 1, high = words.length, end = low;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          textNode.textContent = words.slice(cursor, middle).join(" ");
          if (clone.getBoundingClientRect().height <= capacity - 20) { end = middle; low = middle + 1; } else high = middle - 1;
        }
        textNode.textContent = words.slice(cursor, end).join(" ");
        expanded.push({ ...block, id: `${block.id}-${part}`, text: textNode.textContent, kind: part && block.kind === "bullet" ? "paragraph" : block.kind, continued: part > 0 });
        heights.push(clone.getBoundingClientRect().height);
        cursor = end; part += 1;
      }
      clone.remove();
    });
    setPages(packBlocks(expanded, heights, capacity));
  }, [blocks, paper, template, fontRevision, width]);
  const scale = zoom === "fit" ? Math.min(1, Math.max(0.1, (width - 32) / (paper.width * 4 / 3))) : Number(zoom);
  const style = { ...documentStyle(deferred), width: `${paper.width}pt`, height: `${paper.height}pt`, padding: `${template.margin}pt` };
  return (
    <section className="cv-live-preview" aria-label={t.previewTitle}>
      <div className="cv-preview-toolbar"><span>{t.previewTitle}</span><label>{t.zoom}<select aria-label={t.zoom} value={zoom} onChange={(e) => setZoom(e.target.value)}><option value="fit">{t.fit}</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option></select></label></div>
      <div className="cv-preview-scroll" ref={container}>
        <div className={`cv-measure cv-document cv-template-${deferred.templateId}`} dir={deferred.language === "ar" ? "rtl" : "ltr"} style={{ ...documentStyle(deferred), width: `${paper.width - template.margin * 2}pt` }} ref={measure} aria-hidden="true">{blocks.map((block) => <DocumentBlock key={block.id} block={block} />)}</div>
        {!deferred.data.personal.fullName && <p className="cv-preview-empty">{t.previewEmpty}</p>}
        {pages.map((page, index) => <div className="cv-preview-sheet" key={index}>
          <span className="cv-page-label">{t.page} {index + 1} {t.of} {pages.length}</span>
          <div className="cv-page-slot" style={{ width: paper.width * 4 / 3 * scale, height: paper.height * 4 / 3 * scale }}>
            <div className={`cv-document cv-template-${deferred.templateId}`} dir={deferred.language === "ar" ? "rtl" : "ltr"} style={{ ...style, transform: `scale(${scale})` }}>{page.map((block) => <DocumentBlock key={block.id} block={block} />)}</div>
          </div>
        </div>)}
      </div>
      <small className="cv-preview-note">{t.previewPdfNote}</small>
    </section>
  );
});
