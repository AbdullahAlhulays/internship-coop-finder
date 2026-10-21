# Fursati — Opportunity Data Spec (historical snapshot)

> **Historical reference only (June 2026).** The counts, file paths, examples, and
> workflow instructions below describe an older version of Fursati. Check the
> current source and tests before changing or publishing opportunity data.

> This document was produced by inspecting the actual codebase at
> `c:\Users\d7oom\internship-coop-finder` (branch `main`, 117 commits, 100 opportunities in data).
> Everything below is verified against real files — nothing is assumed.
>
> **Stack:** Vite + React 19, plain JavaScript (JSX). **There is no TypeScript in this repo.**
> **Deploy:** Vercel (`npm run build`, Vite auto-detected).

---

## 0. TL;DR for the pipeline author

| Question | Answer |
|---|---|
| Where is the data? | `src/data/companies.js` — a JS module, `export const companies = [...]` |
| Is there a JSON file? | No. But a remote JSON URL is optionally supported (see §10) |
| Required fields | `name`, `applicationLink`, `type` |
| Valid `type` values | Exactly 3 (see §3) |
| Primary key / React key | `applicationLink` (there is no `id` field) |
| Is `isClosed` automated? | **No. Fully manual. No script/cron/CI exists or ever existed.** |
| Is `deadline` required? | No — 80 of 100 entries omit it entirely |
| Can `deadline` be `null`? | **No — omit the key. `null` breaks the remote-JSON validator** |
| Sort order | Alphabetical by name (array order is cosmetic — append anywhere) |
| Anything else to edit per push? | **Yes — bump `LAST_UPDATED` in `src/App.jsx:21`. See §11** |

---

## 1. Exact file format

**File:** `src/data/companies.js`
**Format:** ES module exporting a named array of plain objects.

```js
export const companies = [ /* ... 100 objects ... */ ];
```

Imported by `src/App.jsx:12`:
```js
import { companies as fallbackCompanies } from "./data/companies.js";
```

### Style conventions to match when writing entries
- 2-space indentation
- Double-quoted strings
- **Trailing comma on every property and every object** (including the last one)
- Property order in practice: `name`, `location`, `applicationLink`, `deadline`, `deadlineTime`,
  `type`, `requiresLetter`, `isClosed`, `addedAt`
  (order is not enforced by code, but matching it keeps diffs clean)

### The file header comments (lines 1-10) — the author's own documented rules
```js
// Add, remove, or edit company opportunities here.
// The app automatically calculates each status from the deadline date.
// Keep dates in YYYY-MM-DD format so filtering and deadline logic stay reliable.
// The deadline field is optional. Leave it out when an opportunity has no specified end date.
// The deadlineTime field is optional. Use 24-hour HH:mm format when a posting gives a time.
// The bio field is optional. If you add it, students can reveal it from the card.
// The location field is optional. Use it for city, country, remote, or hybrid details.
// The openingDate field is optional. Use it for opportunities that should show "Open Soon".
// The isClosed field is optional. Set it to true to keep a closed opportunity visible.
// The addedAt field is optional. Use an ISO timestamp to show "New" for 48 hours.
```

### First 5 real entries, unedited (`src/data/companies.js:11-49`)

```js
export const companies = [
  {
    name: "SSCL",
    location: "Jeddah, Riyadh, Hail, Abha, and more, Saudi Arabia",
    applicationLink: "https://forms.office.com/pages/responsepage.aspx?id=G-NK5HRE10mDWZBAkjxbRjie5pCmK0ZGje8cBLxmW8RUMUZTSzdYNVhKQVVaNk1UVkdaU0FGOVNMUS4u&route=shorturl",
    type: "CO-OP Training",
    addedAt: "2026-06-04T00:00:00+03:00",
  },
  {
    name: "HUMAIN",
    location: "Riyadh, Saudi Arabia",
    applicationLink: "https://www.linkedin.com/jobs/view/4414437424/",
    type: "CO-OP Training",
    addedAt: "2026-05-15T00:00:00+03:00",
  },
  {
    name: "Saudi Water Authority | الهيئة السعودية للمياه",
    location: "Many, Saudi Arabia",
    applicationLink: "https://www.swa.gov.sa/ar/services/request-service/request-coop-training-program/coop-training",
    deadline: "2026-05-18",
    type: "CO-OP Training",
    isClosed: true,
    addedAt: "2026-05-14T00:00:00+03:00",
  },
  {
    name: "Wadi Jeddah Innovation Hub | مجمع وادي جدة للابتكار",
    location: "Jeddah, Saudi Arabia",
    applicationLink: "https://form.typeform.com/to/WTXF0llW?typeform-source=qrcode-button",
    type: "Internship / CO-OP Training",
    addedAt: "2026-05-14T00:00:00+03:00",
  },
  {
    name: "Saudi Power Procurement Company (SPPC)",
    location: "Riyadh, Saudi Arabia",
    applicationLink: "https://www.linkedin.com/jobs/view/4412211034/",
    type: "CO-OP Training",
    requiresLetter: true,
    addedAt: "2026-05-19T00:00:00+03:00",
  },
```

Note: company names may contain **Arabic text** and a `|` separator, e.g.
`"Saudi Water Authority | الهيئة السعودية للمياه"`. The file is UTF-8. Preserve encoding.

---

## 2. Full field list and types

**No TypeScript interface exists in the repo.** The de-facto schema is the runtime validator
`isValidCompany()` in `src/services/companiesApi.js:5-21`, which is authoritative for the
remote-JSON path. Counts below are from the 100 real entries.

| Field | Required | Type | Present in data | Notes |
|---|---|---|---|---|
| `name` | **required** | `string` | 100/100 | Validator rejects non-string |
| `applicationLink` | **required** | `string` (URL) | 100/100 | Also the React key — must be unique |
| `type` | **required** | `string` | 100/100 | Validator accepts *any* string, not an enum. See §3 |
| `location` | optional | `string` | 100/100 | Optional in code, universal in practice |
| `deadline` | optional | `string` `"YYYY-MM-DD"` | 20/100 | See §5 |
| `deadlineTime` | optional | `string` `"HH:mm"` | 1/100 | `HH:mm:ss` also accepted |
| `isClosed` | optional | `boolean` | 29/100 | **Must be a real boolean.** `"true"` fails validation |
| `requiresLetter` | optional | `boolean` | 12/100 | Shows a "Letter" badge; drives a filter toggle |
| `addedAt` | optional | `string` ISO 8601 w/ offset | 28/100 | Drives the 48-hour "New" badge |
| `openingDate` | optional | `string` `"YYYY-MM-DD"` | 1/100 | Drives "Open Soon" status |
| `bio` | optional | `string` | **0/100** | Supported by code, never used in real data |

### The validator, verbatim (`src/services/companiesApi.js:5-21`)
```js
function isValidCompany(company) {
  return (
    company &&
    typeof company.name === "string" &&
    (company.addedAt === undefined || typeof company.addedAt === "string") &&
    (company.bio === undefined || typeof company.bio === "string") &&
    (company.isClosed === undefined || typeof company.isClosed === "boolean") &&
    (company.requiresLetter === undefined ||
      typeof company.requiresLetter === "boolean") &&
    (company.location === undefined || typeof company.location === "string") &&
    (company.openingDate === undefined || typeof company.openingDate === "string") &&
    (company.deadlineTime === undefined || typeof company.deadlineTime === "string") &&
    typeof company.applicationLink === "string" &&
    (company.deadline === undefined || typeof company.deadline === "string") &&
    typeof company.type === "string"
  );
}
```
This is an **all-or-nothing** check: `companies.every(isValidCompany)`. One bad object rejects
the entire payload and the site falls back to local data with a visible error banner.

### Derived TypeScript interface (for your pipeline's own use — not present in repo)
```ts
interface Opportunity {
  name: string;                     // required
  applicationLink: string;          // required — unique, also the React key
  type: "Internship" | "CO-OP Training" | "Internship / CO-OP Training";  // required
  location?: string;                // "City, Saudi Arabia" in practice
  deadline?: string;                // "YYYY-MM-DD" — OMIT if none, never null
  deadlineTime?: string;            // "HH:mm" 24-hour
  isClosed?: boolean;               // real boolean only
  requiresLetter?: boolean;         // real boolean only
  addedAt?: string;                 // ISO 8601, e.g. "2026-05-19T00:00:00+03:00"
  openingDate?: string;             // "YYYY-MM-DD"
  bio?: string;                     // unused in real data
}
```

### Silent-failure warning (important)
`deadline` and `openingDate` are parsed by this regex in `src/utils/status.js:13`:
```js
const dateMatch = dateValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
```
A malformed date **does not throw**. It returns `null`, and the card silently renders as if it
had no deadline at all. Nothing will alert you. **Validate dates in the pipeline** — the app won't.

---

## 3. Every valid value for `type`

Distinct values across all 100 real entries — this is the complete set:

1. `"CO-OP Training"`
2. `"Internship"`
3. `"Internship / CO-OP Training"`

**There is no `"Job"`, no bare `"Training"`, no other value.**

### `type` has no logic attached to it
Verified by grepping the whole `src/` tree — `type` is never compared, filtered, switched on,
or styled by value:

- Rendered as raw text in exactly one place, `src/components/CompanyCard.jsx:54`:
  ```jsx
  <span className="opportunity-type">{company.type}</span>
  ```
- `src/styles.css` has a single `.opportunity-type` rule — **no per-value styling variants**.
- Only other use: a search-label fallback at `src/App.jsx:24`:
  ```js
  return company.name || company.title || company.type || "";
  ```
  (Note: that line references a `title` field that exists in **no** entry — dead fallback.)

**Implication:** emitting a new `type` string would not break anything; it would just render
verbatim in the badge. But no code today produces or expects one. Stick to the three values.

---

## 4. How `isClosed` actually gets set

### **Manually, always. There is NO automation. You are not duplicating anything.**

Evidence gathered:

- `package.json` scripts are only: `dev`, `build`, `preview`. No data step.
  ```json
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" }
  ```
- No `vercel.json`. No `/api` directory. No `.github/workflows`. No `scripts/` directory.
  Repo root contains only: `.gitignore`, `README.md`, `index.html`, `package.json`,
  `package-lock.json`, `vite.config.js`, `public/`, `src/`.
- `git log --diff-filter=A --name-only` across all **117 commits**: no such file has *ever*
  existed. (The only files ever deleted were two React components:
  `CityFilterButtons.jsx` and `SubmitOpportunity.jsx`.)
- Commit `74a143a` "Move expired deadlines to closed" is a **hand-edited diff** adding
  `isClosed: true` line-by-line to individual entries.
- `vite.config.js` is 5 lines, React plugin only — no build-time data transform.

### What IS automatic: the display logic

`getCompanyStatus()` in `src/utils/status.js:94-136` already closes cards whose deadline has
passed, **independently of `isClosed`**:

```js
export function getCompanyStatus(company, now = new Date()) {
  if (company.isClosed) {
    return { label: "Closed", key: "closed", daysLeft: null };
  }
  // ...then the deadline check, which closes anything past due
  const deadlineStatus = getApplicationStatus(company.deadline, now, company.deadlineTime);
  if (deadlineStatus.key === "closed") { return deadlineStatus; }
  // ...then openingDate → "Open Soon"
}
```

**Status precedence:**
1. `isClosed: true` → **Closed**
2. else deadline in the past → **Closed** (computed live, re-evaluated every second)
3. else `openingDate` in the future → **Open Soon**
4. else → **Open**

The clock ticks every 1000 ms (`src/App.jsx:17-18, 143-149`), so status transitions happen
live in the browser without a rebuild.

### When `isClosed` is actually load-bearing
Only for entries where the date logic can't infer closure:
- **9 of the 29** `isClosed: true` entries have **no `deadline` field at all** — for these the
  flag is the only thing closing the card.
- The other 20 have a past deadline, so `isClosed` is **redundant** with the date logic.
- Current data is consistent: every dated entry except `TCC` (deadline `2026-12-31`, still in
  the future) carries `isClosed: true`.

**Pipeline recommendation:** you do not need to flip `isClosed` for dated opportunities — the
app closes them on its own. Set it only when you want to close something that has no deadline,
or close something early before its deadline.

---

## 5. `deadline` format and null handling

### Format
Confirmed `"YYYY-MM-DD"`. All 20 real deadlines match `^\d{4}-\d{2}-\d{2}$` — **zero exceptions**.
The parser also tolerates single-digit month/day (`\d{1,2}`) but no real entry uses that.

### Missing deadlines
**80 of 100 entries have no `deadline`.** This is the *normal* case, not an edge case.

**Convention: omit the key entirely. Do NOT emit `null`.**
`typeof null === "object"`, so `null` fails the check at `companiesApi.js:18`
(`company.deadline === undefined || typeof company.deadline === "string"`), which rejects the
whole payload and shows the "Using local backup data" error banner.

**Real example of a no-deadline entry** — the first entry in the file:
```js
  {
    name: "SSCL",
    location: "Jeddah, Riyadh, Hail, Abha, and more, Saudi Arabia",
    applicationLink: "https://forms.office.com/pages/responsepage.aspx?id=G-NK5HRE10mDWZBAkjxbRjie5pCmK0ZGje8cBLxmW8RUMUZTSzdYNVhKQVVaNk1UVkdaU0FGOVNMUS4u&route=shorturl",
    type: "CO-OP Training",
    addedAt: "2026-06-04T00:00:00+03:00",
  },
```

### What the site displays when `deadline` is missing
From `src/components/CompanyCard.jsx:101-115` and `src/utils/status.js:224-247`:

- Status badge: **Open** (green), Apply button **enabled**
- Label: `Deadline`
- Value: **"Open until filled - apply early"**
- Sub-line: **"No deadline specified"**
- Deadline-sort: sorts **last** (`Number.POSITIVE_INFINITY`, `status.js:151`)
- Never flagged urgent (`isDeadlineUrgent` returns `false` with no deadline)

### Deadline time semantics
- With no `deadlineTime`, the deadline expires at **23:59:59 local time** on that date
  (`status.js:42`).
- With `deadlineTime`, that time is used instead. `"23:55"` is normalized to `"23:55:00"`.
- Display formatting uses **12:00:00** as the reference time to avoid timezone date-shift
  (`status.js:46`) — dates are constructed with the local-time `new Date(y, m, d, ...)`
  constructor, **not** `Date.parse`, so there is no UTC off-by-one bug.
- An **"Less than 48 hours left"** warning appears when the deadline is within 48h
  (`URGENT_DEADLINE_MS`, `status.js:5`), plus a live ticking countdown.

---

## 6. `location` conventions

English. Present on all 100 entries despite being optional in code. Dominant form is
`"City, Saudi Arabia"`, but it is **free text with real variation**.

### All 22 distinct values currently in the data
```
Riyadh, Saudi Arabia
Jeddah, Saudi Arabia
Madinah, Saudi Arabia
Al Khobar, Saudi Arabia
Dammam, Saudi Arabia
Al Dammam, Saudi Arabia
Yanbu, Saudi Arabia
Rabigh, Saudi Arabia
Jubail, Saudi Arabia
Abqaiq, Saudi Arabia
Al Qassim, Saudi Arabia
Eastern, Saudi Arabia
Riyadh Province, Saudi Arabia
Saudi Arabia
Many, Saudi Arabia
Seoul
King Abdulaziz City, Riyadh, Saudi Arabia
Jeddah, Makkah, Saudi Arabia
Jeddah and Riyadh, Saudi Arabia
Riyadh, Jeddah, or Al-Khobar, Saudi Arabia
Jeddah, Madinah, Riyadh, Taif, and Thuwal, Saudi Arabia
Jeddah, Riyadh, Hail, Abha, and more, Saudi Arabia
```

Note the inconsistencies that already exist in real data: `Dammam` vs `Al Dammam`,
`Al Khobar` vs `Al-Khobar`, a bare country (`Saudi Arabia`), a bare foreign city (`Seoul`),
and multi-city free-text joins using `,` / `and` / `or`.

### `"Remote"` is NEVER used
It appears only in:
- a code comment (`src/data/companies.js:7`)
- a README example (`"Riyadh / Remote"`)

No real entry uses `Remote`, `Hybrid`, or `Onsite`. If your pipeline emits `"Remote"`, the
card will display it fine but the city filter will not match it.

### How `location` is parsed (this is the part that matters)
`src/utils/cities.js` scans the location string to build the city-filter tags.

**Magic token:** the standalone word `"Many"` (case-insensitive, word-boundary regex
`/(^|[^a-z])many([^a-z]|$)/`) expands to **all** Saudi cities in the table (`cities.js:28`).

**Otherwise:** case-insensitive substring match against this fixed keyword table
(`cities.js:1-21`) — keyword on the left, displayed label on the right:

```
abha        → Abha           abqaiq      → Abqaiq
al khobar   → Al Khobar      al-khobar   → Al Khobar
khobar      → Al Khobar      dammam      → Dammam
eastern     → Eastern        hail        → Hail
jeddah      → Jeddah         jubail      → Jubail
madinah     → Madinah        mecca       → Makkah
mekkah      → Makkah         makkah      → Makkah
rabigh      → Rabigh         riyadh      → Riyadh
taif        → Taif           thuwal      → Thuwal
yanbu       → Yanbu
```

**Cities outside this table produce ZERO tags** and are invisible to every city filter except
"All". Real examples already affected: `Seoul`, `Al Qassim`. If your pipeline introduces new
cities, they must be added to `SAUDI_CITY_LABELS` in `src/utils/cities.js` or they silently
drop out of the filter.

---

## 7. `id` / key field

**There is no `id` field on any entry.**

React's key is `company.applicationLink` — `src/components/CompanyList.jsx:20-22`:
```jsx
{companies.map((company) => (
  <CompanyCard
    key={company.applicationLink}
```
The array index is **not** used.

### `applicationLink` is the de-facto primary key — treat it as immutable

It does double duty. The "Mark applied" feature persists a list of `applicationLink` strings
in `localStorage` under the key `internship-coop-applied`
(`src/App.jsx:20, 158, 218, 239-243`).

Two hard consequences for a pipeline:

1. **Duplicate links → duplicate React keys → render bugs.** Currently **0 duplicates**
   across 100 entries. Dedupe on this exact field. It is also the natural
   "have I already added this opportunity?" check for an idempotent pipeline.
2. **Rewriting a URL silently wipes that user's "applied" marker.** Adding a tracking
   param, normalizing a trailing slash, or resolving a shortlink all count as a rewrite.
   Once published, do not touch `applicationLink`.

Also note some links are shorteners (`https://qrto.org/v2WiJi`) — do **not** auto-expand them.

---

## 8. Posted / added date field

**Yes — `addedAt`**, distinct from `deadline`.

- Type: `string`, ISO 8601 with timezone offset. Every real value uses `+03:00` (Riyadh).
- Real formats seen: `"2026-05-19T00:00:00+03:00"` and `"2026-05-03T23:09:44+03:00"`
- Present on **28/100** entries (all the newer ones; the 72 older entries predate the field).

### It is NOT used for sorting
Its only consumer is `isOpportunityNew()` (`src/utils/status.js:166-180`), which returns true
for exactly **48 hours** after the timestamp (`NEW_OPPORTUNITY_MS`, `status.js:6`) and drives a
green **"New"** badge on the card (`CompanyCard.jsx:61`). The badge expires on its own.

Note `addedAt` is parsed with `new Date(...)` (not the strict regex), so full ISO strings work,
and a future-dated `addedAt` yields `ageMs < 0` → **no badge**. Don't post-date it.

### The actual sort (`src/App.jsx:182-196`)
1. Default: **alphabetical by name**, `localeCompare(..., "en", { numeric: true, sensitivity: "base" })`
2. Optional user toggle "sort by deadline": deadline ascending, then alphabetical as tiebreak

**There is no newest-first sort anywhere in the app.** Therefore the array order in
`companies.js` is purely cosmetic — your pipeline can append or prepend freely without
affecting what users see. (Recent commits prepend new entries near the top by convention.)

---

## 9. Counts and full real examples

### Current totals
**100 opportunities.**

| Metric | Count |
|---|---|
| Total entries | 100 |
| `isClosed: true` | 29 |
| — of those, with **no** deadline | 9 |
| `requiresLetter: true` | 12 |
| Has `deadline` | 20 |
| **No** `deadline` | 80 |
| Has `deadlineTime` | 1 |
| Has `openingDate` | 1 |
| Has `addedAt` | 28 |
| Has `bio` | 0 |
| Duplicate `applicationLink` | 0 |
| Malformed `deadline` | 0 |

### Example: `isClosed: true` (with a deadline)
```js
  {
    name: "Saudi Water Authority | الهيئة السعودية للمياه",
    location: "Many, Saudi Arabia",
    applicationLink: "https://www.swa.gov.sa/ar/services/request-service/request-coop-training-program/coop-training",
    deadline: "2026-05-18",
    type: "CO-OP Training",
    isClosed: true,
    addedAt: "2026-05-14T00:00:00+03:00",
  },
```

### Example: `isClosed: true` with NO deadline (the case where the flag is load-bearing)
```js
  {
    name: "WalaPlus",
    location: "Riyadh, Saudi Arabia",
    applicationLink: "https://www.linkedin.com/jobs/view/4402481370",
    type: "CO-OP Training",
    isClosed: true,
  },
```

### Example: `requiresLetter: true`
```js
  {
    name: "Saudi Power Procurement Company (SPPC)",
    location: "Riyadh, Saudi Arabia",
    applicationLink: "https://www.linkedin.com/jobs/view/4412211034/",
    type: "CO-OP Training",
    requiresLetter: true,
    addedAt: "2026-05-19T00:00:00+03:00",
  },
```

### Example: no deadline (the most common shape, 80/100)
```js
  {
    name: "SSCL",
    location: "Jeddah, Riyadh, Hail, Abha, and more, Saudi Arabia",
    applicationLink: "https://forms.office.com/pages/responsepage.aspx?id=G-NK5HRE10mDWZBAkjxbRjie5pCmK0ZGje8cBLxmW8RUMUZTSzdYNVhKQVVaNk1UVkdaU0FGOVNMUS4u&route=shorturl",
    type: "CO-OP Training",
    addedAt: "2026-06-04T00:00:00+03:00",
  },
```

### Example: the ONLY entry with `deadlineTime` (all 4 optional flags visible)
```js
  {
    name: "SANS | Saudi Air Navigation Services",
    location: "Jeddah, Saudi Arabia",
    applicationLink: "https://careers.sans.com.sa/#en/sites/CX_1/job/1804",
    deadline: "2026-05-06",
    deadlineTime: "23:55",
    type: "Internship / CO-OP Training",
    requiresLetter: true,
    isClosed: true,
  },
```

### Example: the ONLY entry with `openingDate` ("Open Soon" state)
```js
  {
    name: "WAS SPA",
    location: "Riyadh, Saudi Arabia",
    applicationLink: "https://spanewsacademy.edu.sa/ar/portal/survey/b2700261-44fd-4386-abb6-244cc19baed5",
    openingDate: "2026-05-01",
    type: "Internship",
  },
```

### Example: `bio` — none exist in real data. Shape supported by the code:
```js
  {
    name: "Example Co",
    bio: "Optional short description revealed by an 'About company' button on the card.",
    location: "Riyadh, Saudi Arabia",
    applicationLink: "https://example.com",
    type: "Internship",
  },
```

---

## 10. The second data path: remote JSON (`VITE_COMPANIES_DATA_URL`)

If your pipeline would rather publish JSON than commit JS, this already exists.

`src/services/companiesApi.js` reads the build-time env var `VITE_COMPANIES_DATA_URL`.
Set it in Vercel. Behavior:

- Fetched on page load, then **every 5 minutes** (`REFRESH_INTERVAL_MS`, `App.jsx:17`),
  and again whenever the user returns to the tab (`visibilitychange`, `App.jsx:128-134`).
- Sent with `cache: "no-store"` and `Accept: application/json`.
- Accepts **either** a bare array `[...]` **or** an object `{ "companies": [...] }`
  (`companiesApi.js:40`).
- On non-2xx → throws `"Could not load the latest opportunities."`
- On failed validation → throws `"The opportunities data format is invalid."`
- On any error the app falls back to `src/data/companies.js` and shows a visible banner:
  **"Using local backup data. {error}"** (`App.jsx:320-324`)
- If the env var is unset, `getCompanies()` returns the local array immediately.

**This is the lower-friction target for an automated pipeline** — it needs no git commit and
no redeploy. The tradeoff is that `src/data/companies.js` then becomes a stale backup that
should still be refreshed periodically.

JSON field names and types are identical to §2. Remember: **omit** optional keys rather than
sending `null`, and send real booleans.

---

## 11. REQUIRED after every change: bump the "Last updated" date

The site shows a "Last updated: …" pill at the top of the page. It is a **hardcoded string**,
not a computed date. Nothing updates it automatically. **Every push that adds, closes, or edits
an opportunity must also bump it**, or the site will misreport its own freshness to students.

### Where it lives

One single line — `src/App.jsx:21`:

```js
const LAST_UPDATED = "June 2, 2026";
```

Rendered in one place, `src/App.jsx:288`:

```jsx
<p className="last-updated">Last updated: {LAST_UPDATED}</p>
```

Those are the **only two occurrences** of `LAST_UPDATED` in the entire repo (verified by grep
over `src/`). You only ever edit line 21. Never touch line 288.

### Exact edit to perform

Find this line in `src/App.jsx` (it sits just below the other `const` declarations, above
`function getSortLabel`):

```js
const LAST_UPDATED = "June 2, 2026";
```

Replace **only the quoted string** with today's date:

```js
const LAST_UPDATED = "August 9, 2026";
```

Do not change the `const` name, do not add a type, do not move the line, do not convert it to
`new Date()`. It is a plain string literal and the rest of the app expects exactly that.

### Date format rules (strict — 16 commits of precedent, zero deviations)

Format: **`"Month D, YYYY"`**

- Full English month name, capitalized: `January`, `February`, … `December`.
  Never abbreviated (`Jun`), never numeric (`06`).
- Day with **no leading zero**: `2`, `9`, `21` — never `02` or `09`.
- Comma and a single space before the 4-digit year.
- Wrapped in double quotes, semicolon at the end.
- Riyadh time (`+03:00`) — use the date it is in Saudi Arabia, not UTC.

Correct: `"June 2, 2026"` · `"May 19, 2026"` · `"April 28, 2026"` · `"August 9, 2026"`
Wrong: `"2026-06-02"` · `"Jun 2, 2026"` · `"June 02, 2026"` · `"2 June 2026"` · `"6/2/2026"`

### Real history — every value this string has ever held

Confirms the convention and shows it is bumped on essentially every data commit:

```
622f792  2026-06-02  Add Zaiti opportunity              → "June 2, 2026"
74a143a  2026-05-30  Move expired deadlines to closed   → "May 29, 2026"
d797511  2026-05-21  Add May 21 opportunities           → "May 21, 2026"
05ffbeb  2026-05-19  Update May 19 opportunities        → "May 19, 2026"
7df46e1  2026-05-13  Add latest coop opportunities      → "May 13, 2026"
fda1f6c  2026-05-12  Add SAB cooperative training       → "May 12, 2026"
9c967d9  2026-05-11  Move expired NHC opportunity       → "May 11, 2026"
ba8fad0  2026-05-09  Add May 9 opportunities            → "May 9, 2026"
d13ca58  2026-05-07  Update last updated date           → "May 7, 2026"
9c282ae  2026-05-05  Add letter filters                 → "May 5, 2026"
3f0c28c  2026-05-03  Add Barakah internship             → "May 3, 2026"
b0936d7  2026-05-02  update project                     → "May 2, 2026"
e8a0f5c  2026-05-01  Add new opportunity badges         → "May 1, 2026"
c940118  2026-04-30  Add SATORP coop program            → "April 30, 2026"
da8f000  2026-04-29  update the project                 → "April 29, 2026"
a3ca5ad  2026-04-28  Add last updated note              → "April 28, 2026"  (introduced)
```

The value always equals the commit date. (One human slip: `74a143a` was committed on May 30
but set `"May 29, 2026"`.)

### Proof this is easy to forget

The most recent commit, `b1d5909` "Add SSCL opportunity" (**2026-06-04**), touched
`src/data/companies.js` and `src/utils/cities.js` but **not** `src/App.jsx`. So the live site
currently claims *"Last updated: June 2, 2026"* while its newest card was added June 4. This
is exactly the failure the pipeline should eliminate — treat the bump as part of the commit,
not a follow-up.

### Rule for the pipeline

> Any commit that modifies `src/data/companies.js` must also modify `src/App.jsx:21`
> in the same commit, setting `LAST_UPDATED` to the current Riyadh date in `"Month D, YYYY"` format.

If a run makes **no** data change (nothing new found, nothing expired), do **not** bump it —
an unchanged date honestly reflects that nothing changed. Bump only alongside a real edit.

### Same-day runs

If the pipeline runs multiple times in one day, the string simply stays the same on the second
run — that's correct, not a bug. Write it idempotently: compute today's string, compare, and
only edit if it differs.

### Reference snippets

Generating the string:

```js
// Node — produces "August 9, 2026" in Riyadh time
const LAST_UPDATED_VALUE = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Riyadh",
  year: "numeric",
  month: "long",
  day: "numeric",
}).format(new Date());
```

```python
# Python — same output, no leading zero on the day
from datetime import datetime
from zoneinfo import ZoneInfo
now = datetime.now(ZoneInfo("Asia/Riyadh"))
value = f"{now.strftime('%B')} {now.day}, {now.year}"
```

Applying it safely (anchored regex — matches any current value, rewrites only the literal):

```js
// Node
import { readFileSync, writeFileSync } from "node:fs";
const path = "src/App.jsx";
const source = readFileSync(path, "utf8");
const updated = source.replace(
  /^const LAST_UPDATED = ".*";$/m,
  `const LAST_UPDATED = "${LAST_UPDATED_VALUE}";`,
);
if (updated === source && !source.includes(`"${LAST_UPDATED_VALUE}"`)) {
  throw new Error("LAST_UPDATED line not found — check src/App.jsx:21");
}
writeFileSync(path, updated);
```

Note the `^…$` anchors with the `m` flag: this matches the declaration on line 21 and **cannot**
accidentally match the JSX on line 288, which is indented and has different surrounding text.
**Always assert the replacement actually happened** — a silent no-op is the likely failure mode
if someone reformats that line later.

Verify after editing:

```bash
grep -n "LAST_UPDATED" src/App.jsx     # expect exactly 2 lines: 21 and 288
npm run build                          # must succeed before pushing
```

---

## 12. Gotchas the README does not tell you

1. **The README is out of date — do not use it as the schema.**
   `README.md:36-70` documents the JSON shape but **omits `isClosed` and `requiresLetter`
   entirely**, and its `type` example is `"Internship / COOP"`, which matches **no** real
   value in the data. The authoritative sources are `src/services/companiesApi.js` and the
   real entries in `src/data/companies.js`.

2. **`LAST_UPDATED` is hardcoded and will go stale.** It must be bumped by hand on every data
   commit — full instructions and format rules in **§11**. Already stale in the live repo.

3. **Closed cards are hidden from the main view, not deleted.**
   `src/App.jsx:208-237`: closed entries are excluded from the `all` and `open` counts and
   only appear under the "Closed" filter tab. Keep them in the array.

4. **Filter tabs are: `open` (default), `applied`, `closed`.** An entry is "applied" only via
   per-user localStorage — it's not a data field.

5. **The "no letter required" filter** (`showNoLetterOnly`, `App.jsx:172-173`) hides any entry
   with `requiresLetter: true`. Setting that flag reduces a card's visibility for users who
   have the toggle on — set it only when the posting genuinely requires a training letter.

6. **Dead code to ignore:** `company.title` is referenced in `App.jsx:24` but exists on no
   entry. Do not start emitting it.

7. **No tests, no linter, no typecheck** in this repo. Nothing will catch a malformed entry
   before it reaches production except the runtime validator on the JSON path — and the JS
   file path has **no validation at all**. Validate in the pipeline.

---

## 13. Suggested pipeline validation checklist

### Per-entry — before writing any entry, assert:

- [ ] `name` is a non-empty string
- [ ] `applicationLink` is a non-empty string, is a valid URL, and **does not already exist**
      in the array (exact string match — this is your idempotency key)
- [ ] `type` is one of exactly: `"Internship"`, `"CO-OP Training"`, `"Internship / CO-OP Training"`
- [ ] if `deadline` present: matches `/^\d{4}-\d{2}-\d{2}$/` **and** is a real calendar date
- [ ] if `deadlineTime` present: matches `/^\d{2}:\d{2}$/` and `deadline` is also present
- [ ] if `openingDate` present: matches `/^\d{4}-\d{2}-\d{2}$/`
- [ ] if `addedAt` present: valid ISO 8601 with offset, and **not in the future**
- [ ] `isClosed` / `requiresLetter` are real booleans, never strings
- [ ] no key is set to `null` — omit it instead
- [ ] `location` contains a keyword from the `cities.js` table (or accept that it won't be
      filterable, or add the city to that table)
- [ ] file still parses: `node -e "import('./src/data/companies.js').then(m => console.log(m.companies.length))"`

### Per-commit — before pushing, assert:

- [ ] **`LAST_UPDATED` in `src/App.jsx:21` bumped to today's Riyadh date in `"Month D, YYYY"`
      format** — required whenever `src/data/companies.js` changed (see **§11**)
- [ ] any city introduced by a new `location` was added to `SAUDI_CITY_LABELS` in
      `src/utils/cities.js`, or it will be invisible to the city filter
      (precedent: commit `b1d5909` added `abha` and `hail` alongside the SSCL card)
- [ ] no duplicate `applicationLink` anywhere in the array
- [ ] `npm run build` succeeds
- [ ] the diff touches only the intended files — normally `src/data/companies.js`,
      `src/App.jsx`, and sometimes `src/utils/cities.js`
