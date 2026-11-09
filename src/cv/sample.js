import { createResume } from "./model.js";

// Gallery fixtures only. A newly created resume always starts with emptyData().
const experience = (title, company, location, startDate, endDate, bullets) => ({ title, company, location, startDate, endDate, current: !endDate, bullets });
const education = (institution, degree, startDate, endDate) => ({ institution, degree, field: "", startDate, endDate, gpa: "", description: "" });
const certificate = (name) => ({ name, issuer: "", date: "" });
const language = (name, proficiency = "") => ({ name, proficiency });

const profiles = {
  classic: {
    personal: { fullName: "Emily Carter", title: "Project Manager", email: "emily.carter@example.com", phone: "+1 416 555 2847", location: "Toronto, Canada", linkedin: "linkedin.com/in/emily-carter", website: "" },
    summary: "Project manager with six years of experience coordinating cross-functional initiatives in technology and business operations. Skilled in stakeholder communication, project planning, risk tracking, and delivery governance across complex environments. Known for building practical workflows, improving team alignment, and keeping priorities moving under tight deadlines.",
    experience: [
      experience("Project Manager", "Northbridge Digital", "Toronto, Canada", "2022-03", "", ["Managed release plans across product, engineering, and operations teams.", "Coordinated stakeholder updates, risk reviews, and milestone reporting.", "Improved delivery tracking, reducing gaps across concurrent workstreams."]),
      experience("Project Coordinator", "MapleWorks Solutions", "Toronto, Canada", "2019-07", "2022-02", ["Supported schedules, budgets, and documentation for transformation initiatives.", "Facilitated team meetings and maintained action-item logs.", "Escalated risks before blockers affected delivery timelines."]),
      experience("Operations Analyst", "BrightPath Services", "Ottawa, Canada", "2017-09", "2019-06", ["Analyzed workflow data to identify service delivery delays.", "Prepared reports to support resource planning and prioritization.", "Documented process improvements for managers and project teams."]),
      experience("Project Management Student Assistant", "University of Toronto", "Toronto, Canada", "2016-09", "2017-04", ["Supported project timelines, meeting notes, and team follow-ups.", "Updated task boards and tracked deadlines for student initiatives."]),
    ],
    education: [education("Toronto Metropolitan University", "Bachelor of Commerce in Management", "2013", "2017"), education("Algonquin College", "Diploma in Business Administration", "2011", "2013")],
    skills: ["Project Planning", "Stakeholder Management", "Risk Management", "Agile Delivery", "Budget Tracking", "Process Improvement", "Jira", "Microsoft Project"],
    certifications: [certificate("Project Management Professional (PMP)"), certificate("Certified ScrumMaster (CSM)"), certificate("Google Project Management Certificate")],
    languages: [language("English"), language("French")],
  },
  editorial: {
    personal: { fullName: "Lena Hoffmann", title: "Operations Manager", email: "lena.hoffmann@example.com", phone: "+49 151 4827 6391", location: "Berlin, Germany", linkedin: "linkedin.com/in/lena-hoffmann", website: "" },
    summary: "Operations professional with seven years of experience supporting logistics, process improvement, and cross-functional coordination in fast-paced business environments. Strong track record of improving workflows, managing vendors, and delivering reliable service levels across daily operations. Combines analytical thinking with hands-on leadership to help growing organizations scale efficiently.",
    experience: [
      experience("Operations Manager", "Nova Retail Group", "Berlin, Germany", "2022", "", ["Led daily operations across warehousing, procurement, and customer teams.", "Improved order accuracy by redesigning internal handoff procedures.", "Managed vendor contracts and reduced annual service costs.", "Built KPI dashboards for capacity, service, and productivity tracking."]),
      experience("Operations Coordinator", "Urban Freight Solutions", "Hamburg, Germany", "2019", "2022", ["Coordinated transport schedules and resolved delivery escalations promptly.", "Standardized reporting processes for weekly management reviews.", "Supported onboarding and training for new team members."]),
      experience("Operations Analyst", "GreenLine Services", "Berlin, Germany", "2017", "2019", ["Analyzed process data to identify delays and waste."]),
    ],
    education: [education("Humboldt University of Berlin", "M.Sc. Management", "2015", "2017"), education("University of Cologne", "B.A. Business Administration", "2011", "2015")],
    skills: ["Process Improvement", "Supply Chain Coordination", "Vendor Management", "KPI Reporting", "Budget Tracking", "ERP Systems", "Inventory Planning", "SAP", "Excel & Google Sheets", "Team Leadership", "Continuous Improvement", "Stakeholder Management"],
    certifications: [certificate("Lean Six Sigma Green Belt"), certificate("APICS Certified in Logistics, Transportation and Distribution"), certificate("PRINCE2 Foundation Certificate"), certificate("SAP Certified Application Associate")],
    languages: [language("German", "Native"), language("English", "Fluent"), language("French", "Conversational")],
  },
  corporate: {
    personal: { fullName: "Nadia Smith", title: "Marketing Specialist", email: "nadia.smith@example.com", phone: "+1 312 555 0184", location: "Chicago, United States", linkedin: "linkedin.com/in/nadia-smith", website: "" },
    summary: "Marketing specialist with experience supporting digital campaigns, content initiatives, and cross-channel promotions in retail and agency settings. Strong background in social media management, email marketing, campaign coordination, and performance tracking. Brings a practical, audience-focused approach to improving engagement and delivering consistent brand messaging.",
    experience: [
      experience("Marketing Specialist", "Lakeview Retail Group", "Chicago, United States", "2025-01", "", ["Manage campaign calendars across email, social media, and promotions.", "Coordinate creative assets with design teams for seasonal launches.", "Track performance and prepare weekly reports with engagement metrics."]),
      experience("Marketing Coordinator", "BrightPath Media", "Chicago, United States", "2022-06", "2024-12", ["Supported campaign delivery for retail and lifestyle client accounts.", "Scheduled social content, updated briefs, and monitored campaigns.", "Assisted with email marketing execution and audience segmentation."]),
    ],
    education: [education("University of Illinois Chicago", "Bachelor of Science in Marketing", "2018", "2022"), education("DePaul University Continuing and Professional Education", "Certificate in Digital Marketing", "", "2023")],
    skills: ["Campaign Management", "Social Media Marketing", "Email Marketing", "Content Planning", "Performance Reporting", "Brand Coordination"],
    certifications: [certificate("Google Digital Marketing & E-commerce Certificate"), certificate("HubSpot Content Marketing Certification"), certificate("Google Analytics Certification")],
    languages: [language("English", "Native"), language("Spanish", "Conversational")],
  },
};

export function sampleResume(templateId = "classic") {
  const resume = createResume(templateId);
  Object.assign(resume.data, structuredClone(profiles[resume.templateId]));
  for (const section of ["experience", "education", "certifications", "languages"]) resume.data[section].forEach((entry, index) => { entry.id = `${section}-example-${index}`; });
  return resume;
}
