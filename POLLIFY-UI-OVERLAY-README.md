# Pollify UI Redesign: Overlay Package (Phase 7)

This overlay changes only the frontend presentation layer. It contains **30 files**: 12 new and 18 modified. No database schema, Prisma file, migration, service, API route, authentication code, validation, or test was changed.

It builds on your existing Next.js 16 / React 19 / Tailwind 4 / shadcn (Base UI) project and adds **no new npm dependencies**. All icons come from `lucide-react`, which the project already uses.

---

## 1. Summary of what changes

- **Design system.** Light and dark palettes are CSS variables in `src/app/globals.css`, so every page shares them. One deliberate deviation from the brief: light-mode muted text is `#5E6575`, not `#858B99`, because the brief's value fails WCAG AA contrast on the light background.
- **Theme.** A light/dark toggle appears in the header and on the sign-in pages. The choice is saved in this browser under `localStorage` key `pollify-theme`. An inline script applies it before first paint, so there is no flash.
- **Performance modes.** Automatic, Elegant, Balanced, and Minimal, saved under `pollify-performance`. **Minimal is the default**, and Automatic resolves to Minimal. Elegant and Balanced are opt-in.
- **Silk background.** Decorative SVG strands behind the page. Motion uses CSS transforms driven by one `requestAnimationFrame` loop. It pauses when the tab is hidden, respects `prefers-reduced-motion`, ignores pointer events, and does not update React state per frame.
- **Product name.** The app is called **Pollify** everywhere in the UI, including titles and the sidebar. "Offline classroom polling" appears only as a lowercase tagline.
- **Shell.** A desktop sidebar (1024px and wider) and a bottom tab bar on smaller screens, with targets at least 48px tall. The header holds the mode selector, theme toggle, and log-out button, and adapts to phone widths.
- **Instructor dashboard.** Rebuilt presentation with real data only: stat cards, a classroom overview, and recent activities. The whole activity row and classroom card are clickable, with keyboard focus rings.
- **Other pages.** Orange accents become theme tokens, and Unicode arrows and checkmarks become Lucide icons. Pages not covered here (classroom manager, activity builder, results, participant table, archives) inherit the new tokens and card styling but **were not individually redesigned**. See section 7.

---

## 2. New files (12)

| File | Purpose |
|---|---|
| `src/components/theme/theme-provider.tsx` | Theme and performance state, read with `useSyncExternalStore`. Persists to `localStorage`. |
| `src/components/theme/theme-toggle.tsx` | Light/dark button with an accessible label. |
| `src/components/theme/performance-mode-selector.tsx` | Native `<select>` with a Lucide `Gauge` icon. |
| `src/components/background/silk-background.tsx` | Decorative silk strands (client component). |
| `src/components/layout/nav-items.ts` | Single list of instructor navigation items, shared by sidebar and bottom bar. |
| `src/components/layout/app-sidebar.tsx` | Desktop sidebar with `aria-current` on the active item. |
| `src/components/layout/mobile-navigation.tsx` | Phone and tablet bottom tab bar. |
| `src/components/layout/app-header.tsx` | Shared top bar for instructor and student areas. |
| `src/components/ui/page-header.tsx` | Title, description, and actions row. |
| `src/components/dashboard/stat-card.tsx` | Stat tile with an icon. |
| `src/components/dashboard/classroom-card.tsx` | Clickable classroom card linking to `/activities?classroomId=<id>`. |
| `src/components/dashboard/activity-row.tsx` | Clickable activity row. Its title link covers the whole row. |

## 3. Modified files (18)

Replace each file with the version in this overlay. Each file is included in full.

| File | Change |
|---|---|
| `src/app/globals.css` | Full replacement: new tokens, silk classes, `color-scheme`. Fixes `--font-sans`, which referenced itself. All shadcn variables are kept. |
| `src/app/layout.tsx` | Adds `AppearanceProvider`, `SilkBackground`, the no-flash script, and `suppressHydrationWarning`. Replaces the "Create Next App" metadata. |
| `src/app/page.tsx` | Public home page restyled. Same redirect logic. |
| `src/app/(auth)/layout.tsx` | Adds theme and mode controls and a "Pollify" wordmark. Form logic is untouched. |
| `src/app/(student)/layout.tsx` | Uses the shared header. Student flow is unchanged. |
| `src/app/(instructor)/layout.tsx` | Sidebar, bottom navigation, and header. Still calls `requireInstructor()`. |
| `src/app/(instructor)/dashboard/page.tsx` | Rebuilt presentation. Still calls `getDashboardStats`, plus one added `listClassrooms` call. |
| `src/app/(instructor)/dashboard/loading.tsx` | Skeleton matching the new layout. |
| `src/app/(instructor)/activities/page.tsx` | Row hover uses `hover:bg-muted/50`. |
| `src/app/(instructor)/activities/[id]/page.tsx` | Unicode `←` and `✓` replaced with Lucide icons. Session-code box uses theme tokens. |
| `src/app/(instructor)/activities/[id]/results/page.tsx` | Primary button uses `CTA_CLASSES`. |
| `src/components/ui/card.tsx` | Adds the `shadow-raised` neumorphic shadow. Props and sizes are unchanged. |
| `src/components/ui/badge.tsx` | `published` variant uses the primary token. |
| `src/components/layout/logout-button.tsx` | Adds a `LogOut` icon. The label is visually hidden on phones but still read by screen readers. Logic is unchanged. |
| `src/components/student/student-activity.tsx` | Checkbox accent and selected-state colours use tokens. |
| `src/components/activities/activity-builder.tsx` | **One line changed** (see section 4). |
| `src/components/classrooms/classroom-manager.tsx` | **One line changed** (see section 4). |
| `src/lib/ui-classes.ts` | `CTA_CLASSES` uses theme tokens. Same export name, so existing imports keep working. |

---

## 4. Manual merge instructions

### Option A: copy the overlay (recommended)

1. Stop the dev server (Ctrl+C). Back up the project folder, as in the Phase 6 guide.
2. Merge the `src` folder into your project's `src` folder. Use a merge, not a folder replace, so backend files stay in place:

   ```powershell
   Expand-Archive -Path "$HOME\Downloads\Pollify-UI-Overlay.zip" -DestinationPath ".\ui-overlay" -Force
   robocopy ".\ui-overlay\src" ".\src" /E /IS /IT /NFL /NDL /NJH /NJS
   Remove-Item -Recurse -Force ".\ui-overlay"
   ```

   Robocopy exit codes 0 to 7 mean success.

### Option B: skip the two large files

`activity-builder.tsx` and `classroom-manager.tsx` differ from the reference only in one class. If you have edited either file since Phase 6, do not overwrite it. Make this change by hand:

- `activity-builder.tsx`: change `accent-orange-500` to `accent-primary`.
- `classroom-manager.tsx`: change `text-orange-500` to `text-primary` (the `BookOpen` icon).

Skipping this leaves those two elements orange. Nothing breaks.

### Files the overlay depends on but does not include

These were not in the reference archive, so the overlay does not contain them. Keep your versions: `src/lib/session.ts`, `src/lib/post-json.ts`, `src/lib/request-json.ts`, `src/lib/errors.ts`, `src/lib/builder-validation.ts`, `src/lib/participant-session.ts`, `src/services/*.ts`, `prisma/`, `tests/`, and `scripts/`.

---

## 5. Testing instructions

Run these from the project root.

| # | Command | Expected |
|---|---|---|
| 1 | `npx tsc --noEmit` | No errors. If a Lucide icon name is missing from your installed `lucide-react`, tsc names it. Report it to us. |
| 2 | `npm run lint` | Passes with no new warnings. |
| 3 | `npx tsx --test tests/unit/*.test.ts` | Same result as before this overlay. The overlay changes no backend tests. |
| 4 | `npm run build` | `Compiled successfully`. Google fonts need internet access. |
| 5 | `npm run dev`, then open `http://localhost:3000` | The home page loads with the Pollify wordmark and no flash of the wrong theme. |

### Manual checks

Use a test instructor account, not a real one.

**Theme and performance**
- Toggle light/dark on the dashboard, then reload. The choice persists.
- Set Minimal: the strands stop moving. Set Elegant: they drift slowly.
- A fresh browser (no saved choice) starts in Minimal: the strands are static.
- Turn on the OS "reduce motion" setting. The strands stay still in every mode except Elegant and Balanced.
- Hide the browser tab for a few seconds, then return. Motion resumes without a jump.

**Layout**
- Desktop (1280px): sidebar on the left, header on the right, no sideways scrolling.
- Phone (360px and 390px): bottom tab bar, header on one line, no sideways scrolling.
- Rotate a phone to landscape: the layout still fits.

**Dashboard**
- Click the empty right side of an activity row: it opens that activity.
- Tab to an activity row: a focus ring appears on the row.
- Click a classroom card: it opens the activity list filtered to that classroom.
- Stat numbers match the activity and classroom pages.

**Sign-in (Phase 6 regression check)**
- Sign in and register on desktop: both still redirect to the dashboard.
- Run the Phase 6 mobile sign-in device test (README-PHASE6 section 5). The sign-in code is unchanged, but that test is still required.

**Student area**
- Join an activity and submit a response. Selected checkboxes show the primary colour.

**Accessibility**
- Icon-only controls (theme toggle, phone nav items) have accessible names.
- The keyboard reaches every nav item and card.
- Text is readable in both themes.

### Expected outcome

Every item above passes. A failure is a regression in this overlay, not in the backend.

---

## 6. Verification performed by the author

Before packaging, the author checked the following:

- All 29 changed TypeScript and TSX files parse without syntax errors.
- Tailwind CSS 4.3.3, the project's pinned version, compiled `globals.css` and the component classes.
- The real dashboard, layout, and shell render to HTML with the expected landmarks, data, and links.
- Headless Chromium checks, 21 of 21 passing:
  - Desktop and phone navigation switch at the correct width.
  - Theme toggling and persistence, including after reload.
  - Strand counts are 12, 8, and 4 for Elegant, Balanced, and Minimal. A fresh browser and Automatic both resolve to Minimal.
  - Animation pauses when hidden, resumes when visible, and is off under reduced motion.
  - The background does not intercept clicks.
  - Activity-row clicks resolve to the correct link.
  - No horizontal overflow at 320, 360, 390, 768, and 1280px.
  - No console errors on desktop, phone, or tablet.

**Not verified here.** The author did not have the full project, so `tsc`, lint, the build, the unit tests, and the database tests were **not run**. The sandbox lacked `node_modules`, Prisma, the missing `src/lib` and `src/services` files, and the Geist fonts. It used stubs for `next/link`, `next/navigation`, `lucide-react`, and the database services. The screenshots therefore used a substitute serif font and blank icon boxes, so typography and icon rendering still need a visual check on your machine.

---

## 7. Known limitations and remaining work

- **Pages not individually redesigned.** The classroom manager, activity builder, results, participant table, archived views, and the activity-detail questions list use the new tokens and cards. Redesigning their layouts is the next phase.
- **Mobile builder.** The activity builder has not been reworked for phones.
- **No per-classroom page.** The reference archive has no per-classroom route, so classroom cards open the filtered activity list.
- **Hydration warning (unresolved).** In testing, a harness that hydrated the whole server-rendered tree logged a text-mismatch warning on `ActivityRow`. The isolated component did not reproduce it. Next.js does not hydrate Server Components, so the warning should not appear in your app. Check the browser console in `npm run dev`. If it appears, send us the component stack.
- **Line endings.** Files rewritten in this overlay use LF. If your project uses CRLF, Git may show whole-file diffs. This is cosmetic.

---

## 8. Rollback

Restore the backup you made before step 2. No database change is involved, so no migration or reset is needed.
