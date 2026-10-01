---
type: adr
status: accepted
id: ADR-0028
created: 2026-10-01
amends: ADR-0007, ADR-0013, ADR-0022
---

# ADR-0028: Terms and image consent are accepted at sign-in

## Context

The owner found the studio confusing: before generating, a client met an age checkbox, a permission
checkbox, a references-reviewed checkbox, "Guardar preferencias", "Aceptar y continuar" and a body
type in the panel. The owner asked that permissions be granted once on entering, together with
general terms that protect the studio, and that everything else be asked through acceptance
pop-ups: "cada vez que el usuario accede con email y contraseña el usuario acepta todo y ya accede a
la app".

Data-protection law requires a consent to be distinguishable from other matters, so the image
consent cannot be folded into the terms. SAFETY-INV-003 asks for consent to be recorded with its
time and text version before the first upload; nothing recorded it until now.

## Decision

1. **At sign-in**, «Entrar» opens a dialog with two separate sections, terms of use (including being
   an adult) and the use of images, and one button, «Acepto y entro». `/api/auth` refuses a sign-in
   that does not carry the current version of both, before Supabase is asked anything.
2. **Recorded twice.** An httpOnly cookie (`inkcraft_ok`) holds the versions and an HMAC over them
   and the account id (`TATTOO_CONSENT_SECRET`, else `TATTOO_WORKER_TOKEN`); it cannot be written by
   the page or reused by another account, a new text version stops it matching, and sign-out clears
   it. The `sign_in` event records the versions accepted, which is the durable evidence.
3. **Routes that process images** (`/api/media`, `/api/generate`, `/api/captures`) require the
   cookie and answer 428 without it; the page then shows the same dialog (`/api/consent`), as it
   does on opening for a session that began before this existed.
4. **No checkboxes remain**: age, permission, references reviewed and «Aceptar y continuar» are
   gone from the studio, the change dialog and the camera try-on.
5. **«Generar» asks only what applies**, one pop-up at a time: unsaved panel changes («¿Quieres
   guardar tus preferencias?»), the body when unknown («¿Sobre qué cuerpo lo vemos?»), and always
   the summary, whose «Generar diseño y plantilla» accepts the brief (the server still checks the
   signature, TASK-0037) and confirms the references.
6. **Draft texts.** `/condiciones` and `/privacidad` hold the full terms and privacy policy for
   Aurevanta Labs (info@aurevanta.es), marked as a draft pending legal review.

## Consequences

- ADR-0007's "explicit adult consent" for own-body uploads is given at sign-in, for the session,
  rather than per upload. ADR-0022's consent for a kept camera photo likewise.
- ADR-0013's acceptance gate is unchanged on the server; the client gives it in the final pop-up.
- The `sign_in` event is best-effort (buffered telemetry); a lost event loses that evidence.
- The tax id and postal address are not yet in the texts; Spanish law (LSSI art. 10) asks for both
  on a service with economic activity.
