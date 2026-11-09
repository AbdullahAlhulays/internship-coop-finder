const cachedImport = (loader) => {
  let pending;
  return () => pending ??= loader().catch((error) => { pending = undefined; throw error; });
};

export const loadPublicApp = cachedImport(() => import("../PublicApp.jsx"));
export const loadBuildCvApp = cachedImport(() => import("../cv/BuildCvApp.jsx"));
export const loadCompanyPage = cachedImport(() => import("../components/CompanyPage.jsx"));
export const loadInformationPage = cachedImport(() => import("../components/InformationPage.jsx"));
export const isCvPath = (path) => /^\/(?:ar\/)?build-cv(?:\/|$)/.test(path);

const prefetchedDocuments = new Set();
const preparedCvDocuments = new Set();
export function preloadRoute(href) {
  if (navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType ?? "")) return;
  const url = new URL(href, window.location.origin);
  if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
  const privateRoute = isCvPath(url.pathname);
  const tasks = [privateRoute ? loadBuildCvApp() : loadPublicApp()];
  if (/^\/(?:ar\/)?companies\//.test(url.pathname)) tasks.push(loadCompanyPage());
  if (/^\/(?:ar\/)?contact\/?$/.test(url.pathname)) tasks.push(loadInformationPage());
  // Never prerender Opportunities while someone is working on their CV: that
  // would start public advertising/analytics too early. The private dashboard
  // can prepare a separate document without mounting/reading the resume store.
  if (privateRoute && !isCvPath(window.location.pathname) && /^\/(?:ar\/)?build-cv\/?$/.test(url.pathname) && HTMLScriptElement.supports?.("speculationrules") && !preparedCvDocuments.has(url.pathname)) {
    const rules = document.createElement("script");
    rules.type = "speculationrules";
    rules.textContent = JSON.stringify({ prerender: [{ source: "list", urls: [url.pathname], eagerness: "immediate" }] });
    document.head.appendChild(rules);
    preparedCvDocuments.add(url.pathname);
  }
  // Inert HTML prefetch is also a fallback for browsers without prerendering.
  if (privateRoute !== isCvPath(window.location.pathname) && !prefetchedDocuments.has(url.pathname)) {
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.as = "document";
    link.href = url.pathname;
    document.head.appendChild(link);
    prefetchedDocuments.add(url.pathname);
  }
  void Promise.all(tasks).catch(() => {}); // A failed preload must not block normal navigation.
}
