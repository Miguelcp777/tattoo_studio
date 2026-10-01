---
type: adr
status: accepted
id: ADR-0030
created: 2026-10-01
amends: ADR-0026
---

# ADR-0030: Brave web image search, only for essential references, judged

## Context

Asked for the Ramones logo, the scout found nothing in Wikimedia Commons or Openverse: a band's logo
is a trademark under copyright, and licensed collections do not hold it. TASK-0067 removed the dead
end; the owner then asked whether images could be searched on Google. Google's Custom Search JSON
API is closed to new customers and ends on 1 January 2027. The owner chose the Brave Search API
(about 5 $ per 1,000 requests, with 5 $ of monthly credit).

## Decision

1. **Only for an essential reference** the licensed sources lacked (the planner's `essential`, a
   curated query, or «Buscar otra vez»). Generic ideas never reach the web.
2. **Judged like everything else.** Up to three candidates per query go to the same Claude judge,
   which refuses people, bodies, tattoos and anything that is not the thing named.
3. **Only Brave's own thumbnail** (`imgs.search.brave.com`, no query) is used; it is the only Brave
   address the web tier downloads (SSRF allowlist). `safesearch=strict`.
4. **Labelled** «Imagen de la web · derechos de su autor», with the page it came from.
5. **Opt-in:** `TATTOO_WEB_IMAGE_SEARCH=brave`, `BRAVE_SEARCH_API_KEY`, and the Claude scout. A key
   alone enables nothing. Each search is metered (`brave`, `web_image_search`) for the panel.
6. Brave is named in the privacy policy as a processor that receives only the search text; the
   image-consent version is bumped, so clients accept again.

## Consequences

- Web images keep their authors' rights. Using one as a reference for a personal tattoo design is a
  narrower use than publishing it, but the studio, not the client, now fetches it: the legal review
  of the texts should cover it before the studio opens to clients.
- Brave's thumbnails are 500 px wide; enough for a reference, not for print.
