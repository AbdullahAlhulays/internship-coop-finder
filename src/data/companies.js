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
    location: "Jeddah, Saudi Arabia",
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
  {
    name: "SGS",
    location: "Jeddah, Saudi Arabia",
    applicationLink: "https://175102.jobs2web.com/job/Jeddah-%28Headquarter%29-COOP-Program-1-0/794146502/",
    type: "COOP Program",
  },
  {
    name: "WAS SPA",
    location: "Riyadh, Saudi Arabia",
    applicationLink: "https://spanewsacademy.edu.sa/ar/portal/survey/b2700261-44fd-4386-abb6-244cc19baed5",
    openingDate: "2026-05-01",
    type: "6-month Internship",
  },
  {
    name: "SAMREF",
    location: "Yanbu, Saudi Arabia",
    applicationLink: "https://career-sa20.hr.cloud.sap/portalcareer?career%5fns=job%5flisting&company=saudiara02&navBarLevel=JOB%5fSEARCH&rcm%5fsite%5flocale=en%5fGB&career_job_req_id=4502&selected_lang=en_GB&jobAlertController_jobAlertId=&jobAlertController_jobAlertName=&browserTimeZone=Asia/Riyadh&_s.crb=%2fu6BgYOVuUHSZdsFm5ORUU3ARQxyzwSqJUH0fZkMOM0%3d",
    deadline: "2026-05-02",
    type: "Cooperative Training Program",
  },
  {
    name: "Petro Rabigh",
    location: "Rabigh, Saudi Arabia",
    applicationLink: "https://careers.petrorabigh.com/jobs/6110058-university-internship-program-coop/2a4c5574-d92e-4e2c-b529-e8ba40696c14",
    type: "CO-OP",
  },
  {
    name: "GE VERNOVA",
    location: "Dammam, Saudi Arabia",
    applicationLink: "https://careers.gevernova.com/co-op-internship-program/job/R5037595",
    type: "Intern",
  },
  {
    name: "R&D",
    location: "Riyadh, Saudi Arabia",
    applicationLink: "https://www.linkedin.com/jobs/view/4374719492/",
    type: "Intern",
  },
  {
    name: "Madinah Municipality",
    location: "Madinah, Saudi Arabia",
    applicationLink: "https://services.amana-md.gov.sa/cooperativeTraining/Home/OpnennigDetails/20",
    deadline: "2026-05-02",
    type: "Cooperative Training",
  },
  {
    name: "Riyadh Air",
    location: "Riyadh, Saudi Arabia",
    applicationLink: "https://careers-riyadhair.icims.com/jobs/2540/co-op/login?mobile=false&width=1024&height=500&bga=true&needsRedirect=false&jan1offset=180&jun1offset=180",
    type: "CO-OP",
  },
  {
    name: "SPARK",
    location: "Abqaiq, Saudi Arabia",
    applicationLink: "https://career.spark.sa/jobs/details/691f0151246b8a2137efba2c",
    type: "Internship",
  },
  {
    name: "WalaPlus",
    location: "Riyadh, Saudi Arabia",
    applicationLink: "https://www.linkedin.com/jobs/view/4402481370",
    type: "Coop & Tamheer Opportunities",
  },
  {
    name: "POWR",
    location: "Riyadh, Saudi Arabia",
    applicationLink: "https://talents.powr.sa/",
    type: "3-month Internship / COOP",
  },
  {
    name: "Siemens Ltd",
    location: "Riyadh, Jeddah, or Al-Khobar, Saudi Arabia",
    applicationLink: "https://jobs.siemens.com/en_US/externaljobs/JobDetail/498426?source=LinkedIn&sourceType=PREMIUM_POST_SITE",
    type: "Tamayouz Program Internship",
  },
  {
    name: "SAP",
    location: "Riyadh, Saudi Arabia",
    applicationLink: "https://jobs.sap.com/job/Riyadh-Student-Internship-Riyadh-11435/1290191201/?feedId=384233&utm_campaign=SAP_Linkedin&utm_source=LinkedinJobPostings",
    type: "Internship",
  },
  {
    name: "BOSCH",
    location: "Riyadh, Saudi Arabia",
    applicationLink: "https://jobs.smartrecruiters.com/BoschGroup/744000121717337-business-management-intern",
    type: "Business Management Intern",
  },
  {
    name: "Lumi",
    location: "Riyadh, Saudi Arabia",
    applicationLink: "https://www.linkedin.com/jobs/view/4404038529/",
    type: "Co-op Internship",
  },
  {
    name: "Alfanar",
    location: "Riyadh, Saudi Arabia",
    applicationLink: "https://jobs.alfanar.com/alfanar/job/Riyadh-COOP-Training-Program%2C-Engineering-alfanar-Electric/1382939433/?utm_campaign=LinkedinJobPostings&utm_source=LinkedinJobPostings&applySourceOverride=LinkedIn",
    type: "COOP",
  },
  {
    name: "Public Health Authority",
    location: "Riyadh, Saudi Arabia",
    applicationLink: "https://services.pha.gov.sa/Cooperativetraining/",
    type: "Internship / Cooperative",
  },
  {
    name: "KACST",
    location: "King Abdulaziz City, Riyadh, Saudi Arabia",
    applicationLink: "https://kacst.gov.sa/coop/",
    type: "Cooperative Training",
  },
  {
    name: "Communications, Space and Technology Commission (CST)",
    location: "Riyadh, Saudi Arabia",
    applicationLink: "https://fa-etnq-saasfaprod1.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/ar/sites/CX_2001/job/47/?utm_medium=jobshare&utm_source=External+Job+Share",
    type: "Cooperative Training",
  },
  {
    name: "Deloitte",
    location: "Al Khobar, Saudi Arabia",
    applicationLink: "https://www.linkedin.com/jobs/view/4289263334/",
    type: "Internship",
  },
];
