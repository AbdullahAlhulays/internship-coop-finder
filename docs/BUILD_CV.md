# Build CV

Review at **http://127.0.0.1:5173/build-cv**. Arabic interface:
**http://127.0.0.1:5173/ar/build-cv**.

The CV workspace stores resume data in the visitor's browser. It does not
require an account or a remote database.

## Interface and functionality

Opportunities, Build CV, and Contact Us share a darker sage navbar that stays
visible while scrolling, Fursati branding, and the Arabic quote above the brand.
Navigation changes the content below that shared header, with responsive
controls and English/Arabic active states. Opportunity cards keep consistent
name and location rows around the larger logos, with four columns on desktop
and two columns on phones.

The dashboard supports multiple real saved resumes, actual document thumbnails,
rename, independent duplication, confirmed deletion, and PDF download.
New Resume opens a gallery with Classic Clear, Editorial Rule, and Corporate.
The clean, high-resolution gallery images are rendered from the real PDFs;
new resumes are empty. Single click selects, double click/double tap opens, and
Enter or Use this template also opens the selected template. Retired local
template IDs map to their replacements without changing resume content.

The editor has nine collapsible sections, repeatable/reorderable entries,
achievement bullets, removable skill chips, date/link validation, and a live
HTML preview with paper sizing, pagination, and zoom. Mobile uses form/preview
tabs. Document language and interface language are independently selectable.
Changing the template preserves all content. Only populated sections export.

## Files

- `src/cv/BuildCvApp.jsx`: dashboard, routes, management, editor integration.
- `src/cv/ResumeForm.jsx`: accessible form sections and entry controls.
- `src/cv/ResumePreview.jsx`: measured HTML pages and lightweight thumbnails.
- `src/cv/TemplateGallery.jsx`, `Dialog.jsx`: template selection and dialogs.
- `src/cv/model.js`, `storage.js`: versioned data, migration, repository, autosave.
- `src/cv/document.js`, `templates.js`: shared ordered content and layout tokens.
- `src/cv/pdf/export.jsx`: on-demand browser PDF rendering and download.
- `src/cv/messages.js`, `sample.js`, `cv.css`: bilingual interface, fictional gallery
  data, and feature-scoped styles.
- `public/fonts/cv/`: local open-license fonts and provenance.
- `src/components/PrimaryNav.jsx`, `Header.jsx`, `PageHeader.jsx`, `src/App.jsx`, `src/PublicApp.jsx`, `src/services/routeModules.js`,
  `src/hooks/useClientRoute.js`, `src/styles.css`: navigation and lazy route integration.
- `index.html`: excludes the existing advertising script from private CV routes.
- `package.json`, `package-lock.json`: dependencies and local test commands.
- `scripts/test-cv-model.mjs`, `test-cv-browser.mjs`, `test-cv-recovery.mjs`: tests.
- `.gitignore`: excludes generated `tmp/cv/` test artifacts.

## Local dependencies

Runtime: `@react-pdf/renderer`, loaded only when Download PDF is selected.

Development: `@playwright/test`, `pdfjs-dist`, `@fontsource/noto-sans`,
`@fontsource/noto-serif`. PDF.js uses its optional native canvas dependency for
test-page PNGs. Chrome is used for local browser tests. Compatible Vite and
source-map-js patches were applied after npm reported advisories; the follow-up
audit reported zero vulnerabilities.

## Persistence and privacy

The repository uses the `fursati-resumes-v1` localStorage key with versioned
records and a 750 ms debounced save. It flushes before navigation, hiding the
page, export, and unload. A session cache retains edits if storage is blocked.
Quota failures, corrupt data, newer schemas, and conflicting edits in another
tab produce visible warnings. Invalid or future stored data is never overwritten.
Cross-tab writes merge independent records; conflicting changes require an
explicit choice. Backup import creates new IDs and preserves existing resumes.

No resume data is transmitted to a server, analytics, advertising, or external
PDF/font services. Entering/leaving the CV workspace uses a document navigation
to clear previously executing advertising code. Navigation inside the workspace
uses the existing client router. Analytics excludes CV routes, including IDs.
Browser data can be lost if storage is cleared. The dashboard backup links and
explanatory copy were removed as requested. Recovery warnings still offer an
export when storage fails. Failed saves are never labeled saved.

## PDF output

PDFs use embedded local fonts and real selectable text, standard section
headings, a single main column, link annotations, A4/Letter pages,
wrapping, and widow/orphan protection. There are no images of text, sidebars,
photos, graphical skill bars, or important content in headers/footers.
Long URL destinations remain clickable while their visible labels are compact.
The templates follow common ATS-readable conventions; no universal ATS result
is guaranteed.

Classic uses strong section rules and two-column short lists. Editorial uses
thin rules, inline company/role entries, and flowing short lists. Corporate has
centered section labels between rules and compact three-column short lists.
Short lists use row-major text order; experience and education remain in the
main column. All three use centered serif headers and local italic fonts.

The HTML preview shares content, fonts, colors, sizes, and spacing with PDF.
Its separate browser layout engine can produce slightly different line/page
breaks. The export itself performs independent automatic pagination. The UI
discloses this small preview difference.

The current templates follow the three reference screenshots supplied in the
November 9 follow-up. Their gallery PNGs are generated locally from the actual
template implementations. No third-party resume images were copied.

## Local checks

Start the existing Vite development server:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --configLoader runner
```

With localhost running, execute:

```powershell
npm.cmd run test:cv
npm.cmd run build
npm.cmd run check:seo
```

After changing template styles, regenerate the gallery images with the local
Vite server running: `node scripts/generate-cv-previews.mjs`.

The build is a **local compilation check only**, not a deployment operation.
Tests use isolated headless browser contexts and fictional fixtures, leaving
the user's real browser resumes untouched. Test PDFs, rendered PNGs, screenshots,
and JSON backups are kept in ignored `tmp/cv/`.

Checks cover: existing Opportunities; navigation/gallery/editor; every form
group; preview content; adding/removing/reordering; autosave and reload; dashboard
actions; recovery exports; template changes; double-click opening; all three
PDF downloads; PDF text extraction
and reading order; English and Arabic font output; multi-page/oversized content;
clickable links; mobile/tablet/RTL/dark layouts; storage recovery and navigation
protection; runtime errors; and third-party request isolation on CV routes.
