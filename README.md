# Internship & COOP Finder

A clean React app for helping students find internship and COOP application links.

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
    "applicationLink": "https://example.com",
    "openingDate": "2026-05-01",
    "deadline": "2026-05-30",
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
      "applicationLink": "https://example.com",
      "openingDate": "2026-05-01",
      "deadline": "2026-05-30",
      "type": "Internship / COOP"
    }
  ]
}
```

The app checks that URL when the page loads, refreshes it every 5 minutes, and refreshes again when the user returns to the tab. If the server is unavailable, it uses `src/data/companies.js` as a backup.

Expired opportunities are hidden automatically when their deadline passes.

`openingDate` is optional. Add it only when an opportunity should appear as `Open Soon` before applications begin.
