import InternalLink from "./InternalLink.jsx";
import { getHomePath, localizePathname, stripLocaleFromPathname } from "../utils/locale.js";

export default function PrimaryNav({ locale, navigate }) {
  const path = stripLocaleFromPathname(window.location.pathname);
  const cvActive = path.startsWith("/build-cv");
  const links = [
    { href: getHomePath(locale), label: locale === "ar" ? "فرص التدريب التعاوني" : "CO-OP Training Opportunities", active: path === "/" || path.startsWith("/companies/") },
    { href: localizePathname("/build-cv", locale), label: locale === "ar" ? "إنشاء سيرة ذاتية" : "Build CV", active: cvActive },
    { href: localizePathname("/contact", locale), label: locale === "ar" ? "تواصل معنا" : "Contact Us", active: path === "/contact" },
  ];
  const icons = [
    <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v3h4v-3" /></>,
    <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 13h8M8 17h6" /></>,
    <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  ];
  return <nav className="primary-nav" aria-label={locale === "ar" ? "التنقل الرئيسي" : "Primary navigation"}>{links.map((link, index) => <InternalLink key={link.href} href={link.href} navigate={navigate} className={link.active ? "active" : undefined} aria-current={link.active ? "page" : undefined}><svg className="primary-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{icons[index]}</svg><span>{link.label}</span></InternalLink>)}</nav>;
}
