---
type: adr
status: accepted
id: ADR-0031
created: 2026-10-01
---

# ADR-0031: Sexually explicit ideas are refused when they are told

## Context

On the deployed studio a client asked for «un pene de 30 centímetros rodeado de rosas». The
consultation accepted it, the architect rewrote it as «Figura fálica…», the scout found a rose and
the summary let it be generated. The image model then refused it, and the client saw
«El proveedor no ha completado la solicitud (400)» after waiting for the whole flow. OpenAI's image
API answers a safety refusal with HTTP 400 `moderation_blocked` (TASK-0059). The cause was inferred
from the content; the deployed panel's record was not read.

The image providers (OpenAI, Black Forest Labs) refuse genitals, sexual acts and explicit nudity.
Tattoo studios do such work, but this studio cannot draw it, so promising it and failing at the end
is the worst outcome.

## Decision

1. **Refused first, with a reason.** An idea asking for sexually explicit content is refused at the
   message that asks for it, with one message: «No podemos diseñar contenido sexual explícito
   (genitales, actos sexuales o desnudos explícitos): los generadores de imágenes lo rechazan.
   Prueba con otra idea.» The consultation is left as it was; the refused message is not kept.
2. **Two checks, the cheap one first.** OpenAI's text moderation (`omni-moderation-latest`, free)
   runs before any model or search and refuses only the clearest cases (`sexual` ≥ 0.9, or any
   `sexual/minors`). The architect then judges with rule 11 of the system prompt and a required,
   nullable `contentRefused` in its output; it reads slang and euphemism the moderation scores too
   low. Suggestive motifs (pin-ups, lingerie, swimwear, kisses, a covered or back-view nude,
   classical art) are not refused.
3. **The client's other words are checked too**: a professional description edited in the summary
   and a change request on a design go through the moderation.
4. **The moderation is a courtesy, not the boundary.** If it fails the idea goes on (logged), since
   the architect and the image provider still refuse. It runs only with a live architect and the
   OpenAI key, so a key alone calls nothing in tests.
5. **The image model's own refusal is named.** A `moderation_blocked` answer to the artwork or an
   edit now says the generator refused the design for its content, instead of «(400)».

## Consequences

- The idea text reaches OpenAI's moderation endpoint. The privacy policy already names OpenAI for
  content review, so the consent version is unchanged.
- Measured live on 2026-10-01 (TASK-0070 ev-002): the architect refused a penis, a phallus and
  «una polla», and accepted a winking pin-up, a covered nude from behind, lovers kissing, a rose
  with a dagger and Michelangelo's David. The moderation alone would have missed the first three.
- A borderline idea the architect accepts may still be refused by the image model; the client then
  sees the named refusal of point 5.

## Validation / revisit conditions

- **Revisit if** clients report ordinary motifs refused, or the panel shows `moderation_blocked`
  artwork failures for ideas that passed both checks.
