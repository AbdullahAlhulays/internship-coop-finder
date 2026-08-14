import { useEffect, useState } from "react";
import { getCompanyLogo } from "../data/companyLogos.js";

export default function CompanyLogo({ company, eager = false, messages }) {
  const logo = getCompanyLogo(company);
  const logoName = logo.alt.replace(/ logo$/, "");
  const alt = messages ? messages.logo.alt(logoName) : logo.alt;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [logo.url]);

  return (
    <div className={`company-logo company-logo--${logo.key}`}>
      {logo.url && !imageFailed ? (
        <img
          src={logo.url}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span
          aria-label={
            messages
              ? messages.logo.unavailable(logoName)
              : `${logo.alt} unavailable`
          }
        >
          {logo.initials}
        </span>
      )}
    </div>
  );
}
