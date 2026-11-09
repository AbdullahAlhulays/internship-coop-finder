import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useState } from "react";
import Header from "./components/Header.jsx";
import useClientRoute from "./hooks/useClientRoute.js";
import useDocumentMetadata from "./hooks/useDocumentMetadata.js";
import { getMessages } from "./locales/messages.js";
import { getHomePath, getLanguageSwitchPath, getLocaleFromPathname, normalizePathname } from "./utils/locale.js";
import { isCvPath, loadBuildCvApp, loadPublicApp } from "./services/routeModules.js";

const PublicApp = lazy(loadPublicApp);
const BuildCvApp = lazy(loadBuildCvApp);
const THEME_STORAGE_KEY = "internship-coop-theme";
function getSavedTheme() {
  try { return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light"; }
  catch { return "light"; }
}

function CvMetadata({ locale }) {
  useDocumentMetadata({
    title: locale === "ar" ? "إنشاء سيرة ذاتية | فرصتي" : "Build CV | Fursati",
    description: locale === "ar" ? "أنشئ سيرتك الذاتية واحفظها وحمّلها من متصفحك." : "Create, save, and download a professional resume in your browser.",
    canonicalUrl: `https://internship-coop-finder.vercel.app${locale === "ar" ? "/ar" : ""}/build-cv`,
    alternateUrls: null,
    noIndex: true,
  });
  return null;
}

export default function App() {
  const { pathname, navigate, returnTo, isPending } = useClientRoute();
  const locale = getLocaleFromPathname(pathname);
  const messages = getMessages(locale);
  const homeHref = getHomePath(locale);
  const languageHref = getLanguageSwitchPath(pathname);
  const privateRoute = isCvPath(pathname);
  const [theme, setTheme] = useState(getSavedTheme);
  const [activeDocument, setActiveDocument] = useState(() => !document.prerendering);
  const [cvReady, setCvReady] = useState(false);
  const onCvReady = useCallback(() => setCvReady(true), []);
  const onThemeToggle = useCallback(() => setTheme((current) => current === "dark" ? "light" : "dark"), []);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.body.classList.toggle("has-detail-page", normalizePathname(pathname) !== homeHref);
  }, [theme, locale, pathname, homeHref]);
  useEffect(() => {
    if (!activeDocument) return;
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Theme works without persistence. */ }
  }, [theme, activeDocument]);
  useEffect(() => {
    const activate = () => { setTheme(getSavedTheme()); setActiveDocument(true); };
    // Activation can occur between the initial render and effect setup.
    if (!document.prerendering) { if (!activeDocument) activate(); return undefined; }
    document.addEventListener("prerenderingchange", activate, { once: true });
    return () => document.removeEventListener("prerenderingchange", activate);
  }, []);
  useEffect(() => {
    if (navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType ?? "")) return undefined;
    if (privateRoute) {
      if (!activeDocument) { void loadBuildCvApp().catch(() => {}); return undefined; }
      if (!cvReady) return undefined;
      // After the CV interface is usable, quietly warm public code for the
      // return trip. Importing definitions does not mount analytics, poll the
      // company API, read CV data, or execute the advertising HTML script.
      let idleId;
      const timer = window.setTimeout(() => {
        if (document.hidden) return;
        const warmPublic = () => { void loadPublicApp().catch(() => {}); };
        if ("requestIdleCallback" in window) idleId = window.requestIdleCallback(warmPublic, { timeout: 3000 });
        else warmPublic();
      }, 1500);
      return () => { window.clearTimeout(timer); if (idleId !== undefined) window.cancelIdleCallback(idleId); };
    }
    // Warm the small CV interface after the public page has painted. PDF code
    // and resume data are untouched until the visitor opens that workspace.
    const warm = () => { void loadBuildCvApp().catch(() => {}); };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(warm, { timeout: 1800 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(warm, 1200);
    return () => window.clearTimeout(id);
  }, [privateRoute, activeDocument, cvReady]);
  const shared = { pathname, navigate, locale, theme, onThemeToggle, messages, homeHref, languageHref };
  const loading = <><Header {...shared} brandHeading={!privateRoute} /><main className="route-loading" role="status"><span className="route-loading-spinner" aria-hidden="true" />{locale === "ar" ? "جارٍ التحميل…" : "Loading…"}</main></>;
  return <>
    {privateRoute && <CvMetadata locale={locale} />}
    {isPending && <div className="route-progress" role="status" aria-label={locale === "ar" ? "جارٍ التحميل" : "Loading"} />}
    <Suspense fallback={loading}>
      {privateRoute ? activeDocument ? <BuildCvApp {...shared} onReady={onCvReady} /> : loading : <PublicApp {...shared} returnTo={returnTo} />}
    </Suspense>
  </>;
}
