# Fursati

A clean React app for helping students find internship and CO-OP application links.

## Run Locally

```bash
npm install
npm run dev
```

## Build for Vercel

```bash
npm run build
```

Vercel will automatically detect this as a Vite React project.

## English and Arabic Routes

English remains the default at `/`. The Arabic RTL version is available at `/ar`.

Company pages use the same stable slug in both languages:

```text
/companies/company-slug
/ar/companies/company-slug
```

The language switcher preserves the current page. Build-time generation creates localized HTML metadata for both versions, and the sitemap includes every English and Arabic route automatically.

## Updating Companies

Edit `src/data/companies.js`.

Add, remove, or update company objects there only. The UI renders everything with `map()`, so you do not need to edit components when links or deadlines change.

## Updating Without Redeploying

If you want the deployed website to update after you change deadlines on a server, set this environment variable in Vercel:

```bash
VITE_COMPANIES_DATA_URL=https://your-server.com/companies.json
```

That URL must return JSON in either format:

```json
[
  {
    "name": "Company Name",
    "description": {
      "en": "Optional verified English company description.",
      "ar": "Optional verified Arabic company description."
    },
    "bio": "Optional short description about the company.",
    "location": "Riyadh / Remote",
    "applicationLink": "https://example.com",
    "addedAt": "2026-05-03T23:09:44+03:00",
    "openingDate": "2026-05-01",
    "deadline": "2026-05-30",
    "deadlineTime": "23:55",
    "type": "Internship / COOP"
  }
]
```

or:

```json
{
  "companies": [
    {
      "name": "Company Name",
      "description": {
        "en": "Optional verified English company description.",
        "ar": "Optional verified Arabic company description."
      },
      "bio": "Optional short description about the company.",
      "location": "Riyadh / Remote",
      "applicationLink": "https://example.com",
      "addedAt": "2026-05-03T23:09:44+03:00",
      "openingDate": "2026-05-01",
      "deadline": "2026-05-30",
      "deadlineTime": "23:55",
      "type": "Internship / COOP"
    }
  ]
}
```

The app checks that URL when the page loads, refreshes it every 5 minutes, and refreshes again when the user returns to the tab. If the server is unavailable, it uses `src/data/companies.js` as a backup.

Expired opportunities are hidden automatically when their deadline passes.

`deadline` is optional. If an opportunity has no specified end date, leave it out and the card will stay open.

`openingDate` is optional. Add it only when an opportunity should appear as `Open Soon` before applications begin.

`location` is optional. Add it when you want that detail to appear on the card.

`description` is optional. Store localized text as `{ "en": "...", "ar": "..." }` and add only text you have verified. Either language can be omitted; its company page keeps the description area intentionally blank until that translation is provided. Company page URLs and sitemap entries are generated automatically from this same list. A legacy string is treated as English only. `bio` is accepted as legacy source data but is not displayed in the simplified card design.

The Telegram agent copies one source-language description only when the post explicitly includes meaningful role, responsibility, requirement, or program details. It never asks the LLM to translate or invent missing text. Before approval, **Edit a field** lets that source text be corrected. On approval, the lightweight `deep-translator` library translates the final edited text into the missing English or Arabic version, and both versions are published together. If both languages were entered manually, they are preserved and translation is skipped; if translation fails, approval stops instead of publishing a half-localized card.

`deadlineTime` is optional. Add it in 24-hour `HH:mm` format when the posting includes an exact apply-before time.

`addedAt` is optional source metadata. It can be kept for maintenance and duplicate-resolution history, but it is not displayed on the card.
