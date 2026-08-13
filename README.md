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

`location` is optional. Add it when you want that detail to appear on the card. `bio` is accepted as legacy source data but is not displayed in the simplified card design.

`deadlineTime` is optional. Add it in 24-hour `HH:mm` format when the posting includes an exact apply-before time.

`addedAt` is optional source metadata. It can be kept for maintenance and duplicate-resolution history, but it is not displayed on the card.
