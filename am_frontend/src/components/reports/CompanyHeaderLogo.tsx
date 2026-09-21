import React from "react";

export interface CompanyDetails {
  isEagle: boolean;
  companyName: string;
  companyShortName: string;
  logoSrc: string;
}

/**
 * Resolves the authoritative company details (UDF vs Eagle/EISPL)
 * based on backend company metadata, company ID, or officer affiliation.
 */
export function resolveCompanyDetails(reportOrOfficer?: any): CompanyDetails {
  if (!reportOrOfficer) {
    return {
      isEagle: false,
      companyName: "Unique Delta Force Security Pvt. Ltd.",
      companyShortName: "UDF",
      logoSrc: "/udf_logo.png",
    };
  }

  // Check explicit boolean
  if (reportOrOfficer.is_eagle === true || reportOrOfficer.isEagle === true) {
    return {
      isEagle: true,
      companyName: reportOrOfficer.company_name || reportOrOfficer.companyName || "Eagle Industrial Services Pvt. Ltd.",
      companyShortName: "EISPL",
      logoSrc: "/eagle_logo.png",
    };
  }

  // Check company ID (4 = Eagle/EISPL, 1 = UDF)
  const compId = Number(
    reportOrOfficer.company_id ??
    reportOrOfficer.companyId ??
    reportOrOfficer.COMPANY ??
    reportOrOfficer.officer?.company_id ??
    reportOrOfficer.officer?.companyId
  );
  if (compId === 4) {
    return {
      isEagle: true,
      companyName: "Eagle Industrial Services Pvt. Ltd.",
      companyShortName: "EISPL",
      logoSrc: "/eagle_logo.png",
    };
  }

  // Check strings in company name or officer name
  const compName = String(
    reportOrOfficer.company_name ||
    reportOrOfficer.companyName ||
    reportOrOfficer.company ||
    reportOrOfficer.officer?.company_name ||
    ""
  ).toLowerCase();

  const officerName = String(
    reportOrOfficer.officer ||
    reportOrOfficer.officer_name ||
    reportOrOfficer.officerName ||
    reportOrOfficer.officer?.officer ||
    reportOrOfficer.name ||
    ""
  ).toLowerCase();

  const isEagle = (
    compId === 4 ||
    compName.includes("eagle") ||
    compName.includes("eispl") ||
    officerName.includes("kenjale") ||
    officerName.includes("bhosale")
  );

  return {
    isEagle,
    companyName: isEagle
      ? "Eagle Industrial Services Pvt. Ltd."
      : "Unique Delta Force Security Pvt. Ltd.",
    companyShortName: isEagle ? "EISPL" : "UDF",
    logoSrc: isEagle ? "/eagle_logo.png" : "/udf_logo.png",
  };
}

interface CompanyHeaderLogoProps {
  reportOrOfficer?: any;
  className?: string;
  imgClassName?: string;
  titleClassName?: string;
  hideText?: boolean;
}

export function CompanyHeaderLogo({
  reportOrOfficer,
  className = "flex items-center gap-3 mb-4",
  imgClassName = "h-10 w-auto object-contain max-w-[130px]",
  titleClassName = "text-base font-black tracking-tight text-slate-900 leading-none",
  hideText = false,
}: CompanyHeaderLogoProps) {
  const details = resolveCompanyDetails(reportOrOfficer);

  return (
    <div className={className}>
      <div className="shrink-0 flex items-center">
        <img
          src={details.logoSrc}
          alt={`${details.companyShortName} Logo`}
          className={imgClassName}
          onError={(e) => {
            // Fallback if public folder image path fails in custom print context
            const target = e.currentTarget;
            if (details.isEagle) {
              target.src = "/assets/images/eagle_logo.png";
            } else {
              target.src = "/assets/images/udf_logo.png";
            }
          }}
        />
      </div>
      {!hideText && (
        <div>
          <h2 className={titleClassName}>
            {details.companyName}
          </h2>
        </div>
      )}
    </div>
  );
}
