// Add, remove, or edit company opportunities here.
// The app automatically calculates each status from the deadline date.
// Keep dates in YYYY-MM-DD format so filtering and deadline logic stay reliable.
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
];
