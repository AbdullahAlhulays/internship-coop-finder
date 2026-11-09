# Local resume fonts

All fonts are distributed under the SIL Open Font License. The corresponding
license files are included in this directory.

- `CvSans-400.woff`, `CvSans-700.woff`: Noto Sans Latin, packaged by
  `@fontsource/noto-sans` 5.3.0.
- `CvSerif-400.woff`, `CvSerif-700.woff`: Noto Serif Latin, packaged by
  `@fontsource/noto-serif` 5.3.0.
- `CvSerif-400-italic.woff`, `CvSerif-700-italic.woff`: matching Noto Serif Latin
  italics from the same package, used for role titles and qualifications.
- `CvArabic-400.ttf`, `CvArabic-700.ttf`: full static Noto Naskh Arabic Regular
  and Bold from the [official Noto repository](https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf/NotoNaskhArabic).

The full Arabic TTFs are deliberate: the subset WOFFs produced an incorrect
PDF text layer in testing. HTML and PDF use the same local font assets. No
remote font service is contacted when a visitor creates or exports a resume.
