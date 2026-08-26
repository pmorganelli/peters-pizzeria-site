[P2] The admin board restores the prior page's title instead of its own — src/hooks/useBoardTitle.js:6

`AdminPage` is lazy-loaded, so this module commonly evaluates only after the visitor has navigated from Menu, Gallery, or another public page. `BASE_TITLE` then captures that page's title. With no waiting orders or takedowns, `useBoardTitle` assigns the captured value at line 20, leaving an admin tab titled, for example, “Gallery — Peter's Pizzeria”; it also returns to that stale title after the queue clears. The direct `/admin` case similarly keeps the generic index title rather than the defined Admin title.

[P2] The Past Nights route never sets its document title — src/App.jsx:129

`App` deliberately skips `titleForRoute` for `nights`, but `NightsArchivePage` does not use `useBoardTitle` or otherwise write `document.title`. A direct `/admin/nights` load therefore retains the generic index title, and navigation from the board retains “Admin” (or a stale title) rather than “Past Nights — Peter's Pizzeria”.

[P2] Mobile navigation remains open after browser history navigation and does not expose its state — src/components/Nav.jsx:16

At the 1080px breakpoint, open the hamburger menu and use browser Back/Forward (or a history gesture). `App` changes `page` via `popstate`, but `menuOpen` is independent state with no page-change reset, so the fixed `.mobile-open` panel remains over the newly restored page. The toggle also omits `aria-expanded` and `aria-controls`, so assistive technology cannot determine whether its navigation links are currently available. Closing it on route changes and exposing the expanded state are both needed.

[P2] Gallery photos are indistinguishable to screen-reader users — src/pages/GalleryPage.jsx:35

Every gallery button is named only “View photo N”; the button's `aria-label` overrides the child image's equally generic alt text. A nonvisual visitor consequently cannot identify any photo by its subject before opening it, and the lightbox supplies only “Enlarged view” with no gallery caption to recover that information. Store per-photo descriptions and use them for the control/image accessible name.

[P2] Studio's photo picker has 52 indistinguishable, state-less controls — src/pages/StudioPage.jsx:165

Each thumbnail button has the same “Use this photo” label and its image is deliberately alt-empty. The selected thumbnail is indicated only by a CSS class, not `aria-pressed` or an equivalent selected state. Keyboard and screen-reader users therefore cannot choose a known image or tell which photo will be used for the share-card export.

Overall assessment: The public route mapping, static photo inventory, image optimizer configuration contract, and most component listener cleanup are coherent. The principal defects are metadata ownership across lazy/admin routes and missing accessible state/descriptions in interactive public UI.

Tests run: `node --input-type=module -e "…route round-trip…"` passed for all 10 page routes. Static media check found no missing `PHOTO_RATIOS` entries for the 52 gallery photos. Focused Vitest invocation could not run because `node_modules` is absent (`npm ls --depth=0` reports all project dependencies unmet); no sandbox escalation or dependency installation was requested.

Files changed: `.codex-orchestration/pizzeria-review-0826/agent-3-result.md` only.

Residual risks: No real-browser or deployed-Vercel pass was possible in this dependency-free checkout, so responsive layout, native dialog behavior, and production image-optimizer delivery remain unverified.
