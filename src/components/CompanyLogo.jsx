import { useEffect, useState } from "react";
import { getCompanyLogo } from "../data/companyLogos.js";

export default function CompanyLogo({ company }) {
  const logo = getCompanyLogo(company);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [logo.url]);

  return (
    <div className={`company-logo company-logo--${logo.key}`}>
      {logo.url && !imageFailed ? (
        <img
          src={logo.url}
          alt={logo.alt}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-label={`${logo.alt} unavailable`}>{logo.initials}</span>
      )}
    </div>
  );
}
