---
type: adr
status: accepted
id: ADR-0019
created: 2026-09-28
---

# ADR-0019: The camera try-on runs entirely on the client's device

## Context

Phase 1.3 of the competitive plan. InkHunter and Tatship both let a client point a phone at their
skin and see the tattoo there; we had nothing. It is the feature clients use before booking, and
the one we were most obviously missing.

A camera try-on is a body-imaging feature, which is exactly where this project is most careful.
ADR-0006 built a whole privacy posture for a *single* uploaded photograph; a live camera is a
stream of them. The obvious architectures — send frames to a server for segmentation, or to a
hosted model for a realistic blend — would turn the most private input in the product into
continuous egress, and would put us behind competitors on the one thing we can beat them on.

## Decision

**The frames never leave the device.** The page opens the camera with `getUserMedia`, draws each
frame to a canvas, blends the design into it and discards it. There is no upload, no recording, no
frame buffer that outlives the animation frame.

1. **The ink treatment is a port, not a reimplementation.** `lib/skin-blend.ts` is a faithful
   translation of the worker's `mockup/engine.py`: the multiply, the surface attenuation read from
   the frame's own light (ADR-0014), and the fresh-ink ring (TASK-0031). What the client sees in
   the camera is the ink the studio renders, by construction rather than by resemblance.
2. **The artwork's geometry stays authoritative** (MOCKUP-INV-001). The only spatial transform is
   the placement the client chooses. Attenuation scales opacity; it never displaces a pixel.
3. **The design travels as an id, not as pixels from the client.** The page's single request is the
   `GET /api/media?id=` that fetches the client's own master, through the existing session-scoped
   route. The id is validated against `^[a-f0-9]{32}$` before it is put in a URL.
4. **The promise is enforced by a test, not by good intentions.** A source scan asserts that the
   page, the compositor and the blend module contain no `fetch`, `XMLHttpRequest`, `sendBeacon`,
   `WebSocket`, `RTCPeerConnection`, `FormData` or `Worker`, and that the page's only image source
   is that one route. A future edit that adds egress fails the suite.
5. **Installable, with a deliberately thin cache.** A manifest and an app-shell service worker make
   the studio installable, which is what gets the camera a full-screen surface on a phone. The
   worker never caches or intercepts `/api/`: those responses are per-session and private, and a
   copy in a shared cache would outlive both the session and the client's deletion of it.

## Alternatives considered

- **Server-side segmentation or a hosted blend per frame.** Best quality. Rejected outright: it is
  continuous body-image egress, which contradicts ADR-0006's posture and the product's main claim.
- **MediaPipe body segmentation on-device** (the plan's wording). Still the right next step, and it
  keeps the privacy property since it also runs locally. Not in this decision: it adds a multi-
  megabyte model download and a WASM runtime, and it cannot be validated here at all. Deferred
  rather than rejected.
- **Reimplementing the blend for the browser.** Cheaper to write, and guaranteed to drift from the
  render the client is shown afterwards. Rejected for the same reason ADR-0004 keeps one schema.

## Consequences

- **Without segmentation the design follows the finger, not the limb.** Ink placed off the body is
  drawn on whatever is behind it. The server mockup clips to the silhouette (TASK-0039); the live
  view cannot, because a room is not a plain backdrop. This is the honest limitation of this step
  and is the reason MediaPipe stays on the roadmap.
- The blend runs per frame on the phone's CPU. The preview is capped at 640 px wide and the maths
  runs only inside the design's box; on a slow device it will drop frames rather than fail.
- `requestAnimationFrame` stops in a hidden tab, so the preview resumes on `visibilitychange`.
- Offering an install prompt makes us responsible for the cached shell; the version constant in the
  worker is the only thing that evicts it.

## Validation / revisit conditions

- **Owed:** a real phone, iOS and Android, in good and bad light. Neither a camera nor a visible
  browser surface exists in the development environment, so the loop itself is unproven there.
- **Revisit** when MediaPipe segmentation lands: the clip that the server already does should then
  apply here too, and this ADR's "follows the finger" consequence goes away.
- **This decision is wrong if** clients read the live view as a promise of the healed tattoo; the
  visualization disclaimer (PROD-INV-005, WEB-INV-003) stays on the page.
