# Feature sheets (v1.0)

Shared rules for every tool:

- **Data.** Files are read into memory on the device. Nothing is uploaded; the Content-Security-Policy
  blocks any other server except Google's sign-in service, which loads only if the user taps
  *Sign in*. Sign-in is optional; on Android, INTERNET is used only for it.
  Results are new files (`name-compressed.pdf`, `name-signed.pdf`, …). The original is never changed.
- **Errors.** Every failure maps to an actionable message in English and Nepali: password protected,
  damaged / not a PDF, empty, bad page range, unsupported image, out of memory, cancelled. Each offers
  *Try again*. Errors never log document content.
- **Background work.** pdf-lib work runs in a Web Worker; Cancel terminates it and drops all intermediate
  data. Rendering and OCR run one page at a time with a progress bar.
- **Verify success.** Result card shows name and size with Download, Share (Android / supporting
  browsers) and Open (preview). Job is added to History (metadata only).
- **Permissions.** Android: Camera only when the user taps *Take photo*; storage only for files the user
  picks and for saving to `Documents/PrivatePDF`. Web: camera only for *Use webcam*.

| Tool | Problem solved | Inputs | Output | Large / scanned / damaged / password files |
|---|---|---|---|---|
| Merge | Combine forms, certificates and ID into one file | 2+ PDFs, reorder in list, drag-drop | `merged.pdf` | Worker keeps UI responsive; damaged or protected input stops with a message naming the problem |
| Split / Extract | Send only the pages needed | 1 PDF; range like `1-3, 5, 8-` or every N pages | One PDF, or a `.zip` of parts | Invalid range explained; protected files refused with instructions |
| Compress | Shrink scans for email / WhatsApp | 1 PDF; Low (lossless) / Medium / High (re-rendered JPEG pages) | `-compressed.pdf` + before/after size and % | Pages rendered one at a time with a 16 MP cap per page; warns when result is not smaller |
| Scan / Image to PDF | Camera or photos to a flat, clean PDF | Photos (JPG/PNG/WebP), camera (Android / mobile web), webcam (web) | `scan-YYYY-MM-DD.pdf` | Photos downscaled to 2200 px long side; auto edge detection with draggable corners; filters: enhance, grayscale, adaptive black & white |
| OCR | Get text from Nepali + English documents; searchable PDF | Images or one PDF; Nepali+English / Nepali / English | `.txt` or `-searchable.pdf` (invisible text layer), copyable text | Models bundled (offline). PDF pages rendered at 220 dpi one by one |
| Organize | Reorder, rotate, delete, duplicate, insert blank | 1 PDF; thumbnails with buttons (touch/keyboard) and drag-drop (desktop) | `-organized.pdf` | Thumbnails render lazily; deleting the last page is blocked |
| Fill & Sign | Complete and sign government, bank, school forms | 1 PDF; form fields, text stamps, drawn signature (finger / stylus / mouse) | `-signed.pdf`, optional lock (flatten) | Nepali text is placed as a correctly shaped image stamp; Nepali in form fields is explained (v1.1) |
| PDF to Image | Share pages on WhatsApp / social | 1 PDF; JPG/PNG; 72/150/300 dpi; optional range | Image, or `.zip` of images | One page in memory at a time |
| Page numbers | Number pages of applications, reports and theses | 1 PDF; position (6), style (1 / 1 of N / Page 1 of N), first number, skip cover | `-numbered.pdf` | Labels placed upright on rotated pages; protected or damaged files refused with a message |
| Google sign-in (optional) | Show who is using the app; groundwork for later sync | Google account | Name + email stored on device | Not required for any tool; offline or failed sign-in shows a message and tools keep working |
| History | Find what you did | — | List of tool, file name, size, time | Android: on device; Web: this browser session only. Clearable |

## Known limits for 1.0 (tracked for 1.1)

- Nepali text inside AcroForm fields needs an embedded Devanagari font with shaping.
- Medium/High compression rasterizes pages; we suggest OCR afterwards to restore searchable text.
- Password-protected PDFs are refused with guidance; Unlock arrives in 1.1.
- 50 MB+ performance has a manual test plan (below) but no automated benchmark yet.

## Manual test plan (real devices / browsers)

1. Android 10+ phone, airplane mode on: run every tool once. All must work.
2. Chrome, Firefox, Safari, Edge desktop: drag-drop merge of 3 files; compress a 50 MB scan; OCR a
   Nepali citizenship-style photo.
3. 50 MB / 100+ page scanned PDF: compress Medium and Organize; UI must stay responsive, Cancel must work.
4. TalkBack / screen reader: every button has a label; progress and results are announced.
