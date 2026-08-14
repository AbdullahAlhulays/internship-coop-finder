import InternalLink from "./InternalLink.jsx";

export default function LanguageSwitcher({
  href,
  locale,
  messages,
  navigate,
}) {
  const targetLocale = locale === "ar" ? "en" : "ar";

  return (
    <InternalLink
      className="language-switcher"
      href={href}
      navigate={navigate}
      hrefLang={targetLocale}
      lang={targetLocale}
      dir={targetLocale === "ar" ? "rtl" : "ltr"}
      aria-label={messages.languageSwitchLabel}
    >
      {messages.languageSwitch}
    </InternalLink>
  );
}
