# TREZO Verification Record

## Automated verification

`pnpm exec tsc --noEmit` completed successfully. `pnpm test` completed successfully with 11 test files and 23 tests passing. `pnpm run build` completed successfully with Vite and the server bundle; Vite emitted only the existing large-chunk advisory.

## Audit verification

The request lifecycle tests assert `beforeData` and `afterData` for draft, review, approved, executed, rejected, and rejected-to-draft transitions. The permission update test asserts the before/after audit payload, and `users.audit.test.ts` asserts the previous and next role payload for `users.updateRole`.

## UI state verification

`Workspace.tsx` contains active-query gating for each workspace section, grouped loading/error handling for entities and calendar data, explicit audit empty state, retry handling for report data, and empty-state rendering in list-oriented sections. The responsive dashboard was captured successfully at desktop and mobile viewports.

## Printing verification

The print center has tests for empty data, load failure, and popup blocking. The report section exposes a retry path for request loading failures and uses the live request query for preview data. A full interactive click-through of the internal report tab requires an authenticated browser session; no production data or database changes are used for this verification record.

## Dark-mode verification

TREZO now starts with `defaultTheme="dark"` while retaining the switchable theme control and `localStorage` preference under the `theme` key. The desktop and mobile preview captures taken after this change therefore rendered with the document root in dark mode unless a previously stored user preference explicitly overrides it. The light/dark tokens were reviewed across Home, Workspace, NotFound, ManusDialog, tables, forms, status actions, and notifications.

The direct `/workspace` URL is now an alias of the Home workspace shell rather than a 404 fallback, and was re-captured successfully alongside `/`.

### Explicit dark-mode captures

On 2026-08-17, `/ ?theme=dark` and `/workspace?theme=dark` were captured at 1280×720 and again at 375×812. The captures visibly show the dark background, light text, green TREZO navigation, gold accents, responsive mobile header, and stacked mobile metric cards. The query override is deterministic for QA; normal users continue to use the saved local preference and the visible theme toggle.
