import Footer from "./Footer.jsx";
import InternalLink from "./InternalLink.jsx";
import PageHeader from "./PageHeader.jsx";

export default function NotFoundPage({
  theme,
  onThemeToggle,
  navigate,
  locale,
  messages,
  homeHref,
  languageHref,
}) {
  return (
    <div className="company-page">
      <PageHeader
        theme={theme}
        onThemeToggle={onThemeToggle}
        navigate={navigate}
        locale={locale}
        messages={messages}
        homeHref={homeHref}
        languageHref={languageHref}
      />

      <main className="company-detail-shell">
        <section className="company-not-found">
          <p className="detail-eyebrow">404</p>
          <h1>{messages.notFound.title}</h1>
          <p>{messages.notFound.body}</p>
          <InternalLink
            className="detail-apply-button"
            href={homeHref}
            navigate={navigate}
          >
            {messages.notFound.action}
          </InternalLink>
        </section>
      </main>

      <Footer messages={messages} />
    </div>
  );
}
