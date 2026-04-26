// Add, remove, or edit company opportunities here.
// The app automatically calculates each status from the deadline date.
// Keep dates in YYYY-MM-DD format so filtering and deadline logic stay reliable.
// The deadline field is optional. Leave it out when an opportunity has no specified end date.
// The deadlineTime field is optional. Use 24-hour HH:mm format when a posting gives a time.
// The bio field is optional. If you add it, students can reveal it from the card.
// The location field is optional. Use it for city, country, remote, or hybrid details.
// The openingDate field is optional. Use it for opportunities that should show "Open Soon".
export const companies = [
  {
    name: "SANS",
    location: "Jeddah, Saudi Arabia",
    applicationLink: "https://careers.sans.com.sa/#en/sites/CX_1/job/1804",
    deadline: "2026-05-06",
    deadlineTime: "23:55",
    type: "Internship / COOP",
  },
  {
    name: "flyadeal",
    location: "Jeddah, Saudi Arabia (Head Office)",
    applicationLink: "https://careers.flyadeal.com/jobs/coop-training-program-june-2026-1775463437",
    deadline: "2026-05-14",
    type: "COOP Training Program - Summer 2026",
  },
  {
    name: "Misk x Hyundai Motor Company",
    location: "Seoul",
    applicationLink: "https://hub.misk.org.sa/ar/programs/skills/misk-traineeship-program-x-hyundai-motor-company/",
    deadline: "2026-04-27",
    type: "برنامج مسك للتدريب بالشراكة مع مجموعة هيونداي موتور",
  },
  {
    name: "Zid",
    location: "Riyadh, Saudi Arabia",
    applicationLink: "https://www.jisr.net/en/zid/careers/ec8eb290-648e-421b-a2fb-357f6d0c2375?host=1",
    type: "Co-op / Summer Internship / Tamheer Program",
  },
];
