# Project TODO

- [x] Review the current TREZO Smart Treasury implementation and identify the user's requested edit scope.
- [x] Implement the user's requested project changes.
- [x] Add or update automated tests for the implemented changes.
- [x] Save a delivery checkpoint for the verified updated experience.
- [x] Audit existing request lifecycle, dashboard calculations, empty states, and navigation behavior for high-impact improvements.
- [x] Improve the dashboard so its financial activity visualization and recent-request area derive from live treasury data.
- [x] Strengthen the request workflow with visible validation feedback, loading feedback, and user-safe error handling.
- [x] Improve workspace navigation and mobile interaction feedback for unfinished or unavailable sections.
- [x] Add targeted Vitest coverage for the new dashboard and request-workflow behavior.
- [x] Run type checks, automated tests, and responsive visual verification before delivery.
- [x] Fix multi-currency dashboard presentation so no visual or total incorrectly aggregates values under one currency label.
- [x] Add explicit feedback when a workspace section has no available data or configuration prerequisites.
- [x] Restore the request modal's true amount-in-words preview so its label and output remain consistent.
- [x] Add explicit feedback for unavailable workspace actions beyond calendar prerequisites, then re-validate navigation feedback.
- [x] Add component-level tests for the dashboard data presentation, request confirmation, empty-state CTA, and attachment feedback.
- [x] Add workflow component tests for the empty-state call to action, confirmation transition, and invalid attachment feedback.
- [x] Audit the latest checkpoint and identify the highest-value remaining treasury workflow gap.
- [x] Implement an exchange-rate readiness improvement so users can clearly act when a unified total lacks a required conversion rate.
- [x] Improve the selected operational workspace flow with clear, responsive feedback and no dead-end actions.
- [x] Make the dashboard unified-total warning directly navigate to exchange-rate settings and cover the handoff with a focused test.
- [x] Add and run focused Vitest coverage plus desktop and mobile verification for the new improvement set.
- [ ] Save a delivery checkpoint for the continued improvement pass.
- [x] Visually verify the exchange-rate readiness banner and prefilling action in workspace settings on desktop and mobile.

- [x] Visually exercise the missing-rate handoff from the dashboard into workspace settings and confirm the readiness banner and exchange-rate action are visible on desktop.
- [x] Repeat the missing-rate handoff verification on a mobile viewport and capture the readiness banner and exchange-rate action state.
- [x] Prevent unsafe guessed exchange-rate pairs when an incomplete unified total has no named missing currency; show a prefilled correction action only for an actionable named currency.
- [x] Carry a named missing currency from the dashboard into settings and prefill its exchange-rate pair for correction.
