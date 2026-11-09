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
  return <nav className="primary-nav" aria-label={locale === "ar" ? "التنقل الرئيسي" : "Primary navigation"}>{links.map((link) => <InternalLink key={link.href} href={link.href} navigate={navigate} className={link.active ? "active" : undefined} aria-current={link.active ? "page" : undefined}>{link.label}</InternalLink>)}</nav>;
}
