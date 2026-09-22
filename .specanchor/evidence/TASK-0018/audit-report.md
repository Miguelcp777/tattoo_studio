# Informe de auditoría SDD — InkCraft

| Campo | Alcance |
|---|---|
| Fecha | 2026-09-19 |
| Revisión | `4c2535b9f9fcaeb7f2b84133735d0fce1817bd14` y cambios locales previos |
| Modalidad | MODO-A / AUDIT-ONLY; reconciliación SDD de requisitos, arquitectura, contratos y pruebas |
| Ejecución | Pruebas locales y proveedores simulados; sin generación facturable ni despliegue |
| Preservación | No se ha modificado código de producto ni reescrito especificaciones previas para aceptar defectos |

## 1. Resumen ejecutivo

InkCraft tiene una interfaz y componentes de consulta, pero el flujo activo no cumple las garantías centrales descritas. La búsqueda es un directorio de tres enlaces, el supuesto análisis visual solo copia etiquetas y la generación no recibe las referencias. El stencil es una nueva generación o un filtro de bordes del mockup; no existe prueba de identidad geométrica ni exportación calibrada en milímetros. Sin credenciales se entrega un SVG genérico como resultado correcto. Las tareas marcadas `verified` no demuestran estas propiedades.

**Puntuación parcial del alcance revisado: 4,7/10.** Fórmula de la rúbrica: 10 − 0,8 × 6 altas − 0,25 × 2 medias = 4,7. No es una nota de seguridad, accesibilidad ni calidad visual medida.

Prioridad: retirar las afirmaciones de verificación automática y definir un único diseño plano maestro del que dependan los dos entregables. Corregir solo los tests no resuelve el producto.

## 2. Tabla de hallazgos

| ID | Problema | Severidad | Evidencia / impacto |
|---|---|---|---|
| ARQ-01 | No hay búsqueda real y se sustituyen entidades | Alta | `image-scout.ts:16,107`; pedir escudo del Real Madrid devuelve Valencia CF |
| ARQ-02 | Referencias sin análisis visual ni entrada al generador | Alta | `researcher.ts:297`, `creator.ts:117`; cambiar la foto no cambia el prompt |
| ARQ-03 | La consulta inventa preferencias y pierde el tema | Alta | `researcher.ts:106,146,211,278`; tras tres preguntas «Un león» acaba siendo «Solo negro» |
| ARQ-04 | Identidad geométrica no garantizada | Alta | `creator.ts:167–177`, `TattooPreviewModal.tsx:47–92`; segunda generación y Sobel sobre piel |
| ARQ-05 | Stencil sin escala física | Alta | `TattooPreviewModal.tsx:92,104–105`; PNG sin escala procedente de mm y medidas por defecto |
| UX-01 | Fallos convertidos en éxito y sello de verificación falso | Alta | `creator.ts:38–48,104–107`, `TattooPreviewModal.tsx:207`; SVG genérico como mockup y stencil |
| ARQ-06 | Ruta web elude arquitectura y contrato compartido | Media | `api/generate/route.ts:22–69`; generación síncrona en consulta, sin validar TattooBrief |
| ARQ-07 | Estado SDD y controles de calidad incoherentes | Media | TASK-0017 `verified`, guard FAIL, tipos/build FAIL y cuatro tests fallidos |

Rutas abreviadas: agentes en `packages/consultation/src/agents/`; interfaz en `apps/web/src/components/`; API en `apps/web/src/app/`.

## 3. Análisis detallado y remediación

### ARQ-01 — Directorio presentado como búsqueda

OBSERVED: `VERIFIED_IMAGE_DIRECTORY` tiene tres entradas estáticas; `scoutReferenceImages` es síncrono y no llama a ningún servicio. Aun así el mensaje dice «He buscado en Internet». `userHasPhotos` no evita añadir esas referencias. La condición `lower.includes('escudo')` selecciona Valencia CF, independientemente del club solicitado. VERIFIED mediante `probes.cjs`, con la red bloqueada.

Remediación: resolver entidades completas, buscar mediante un proveedor real y conservar URL de origen, autor/licencia cuando esté disponible, fecha de recuperación, entidad y estado de comprobación. No declarar oficial una imagen por el nombre de una constante. Si no se identifica una entidad, conservarla como no resuelta. Como contención inmediata, eliminar las coincidencias genéricas `escudo`, `virgen`, `bat` y `murciélago` de la selección de entidades específicas; esto reduce falsos positivos pero no implementa la búsqueda.

### ARQ-02 — Análisis de etiquetas, no de imágenes

Código actual, `researcher.ts:299`:

```ts
observations: references.map((r, i) => `Referencia #${i + 1}: ${r.label ?? 'Elemento visual incorporado'}`),
```

El dossier no conserva las imágenes como entrada del render. `creator.ts:117` envía texto y dimensiones de píxeles. Tampoco recibe una fotografía corporal para colocar el tatuaje sobre la piel del cliente. VERIFIED: dos referencias distintas producen el mismo prompt; el espía del proveedor confirma la ausencia de imagen de referencia en la generación maestra.

Remediación: contrato de referencias con identificadores de medios aprobados; análisis multimodal efectivo con evidencia por rasgo; referencias enviadas a un adaptador compatible. Para emblemas que deban ser exactos, componer activos verificados y conservar su geometría. Una descripción textual detallada no equivale a una comprobación de identidad. La integración completa requiere implementación y pruebas: no puede corregirse cambiando una frase del prompt.

### ARQ-03 — Tres preguntas no equivalen a una consulta correcta

Código actual, `researcher.ts:106,146–148`:

```ts
let bodyPart: BodyPart = existingSlots.placement?.bodyPart ?? 'inner_forearm';
const hasDetailedSubject = combinedText.length > 80 || matchedMotifs.length >= 2;
const hasPlacement = !!bodyPart;
const isSufficientlyDetailed = hasDetailedSubject && hasPlacement;
```

La zona nunca falta porque ya se ha inventado. También se presupone lado derecho y realismo. Las respuestas sobrescriben `subject.description` con `userInput`; el prompt genérico final usa el último mensaje, no la idea acumulada. VERIFIED: «Un león → En el antebrazo izquierdo → Línea fina → Solo negro» termina sin león. El contador sí permanece en tres en esta prueba.

Remediación: extraer deltas por campo y conservar los datos ya aportados; preguntar solo por campos indispensables ausentes. Contar preguntas reales en estado de servidor. Tras tres preguntas, mostrar campos pendientes y permitir completarlos en controles, sin inventarlos ni emitir un brief válido. El tamaño puede capturarse en controles de mm para respetar el límite conversacional. Antes de generar debe ejecutarse `validateTattooBrief` del paquete existente.

### ARQ-04 — Stencil regenerado y bordes de piel

Código actual, `creator.ts:174–177`:

```ts
prompt:
  'Exact tattoo stencil transfer line art from the input image. Crisp clean solid black outlines on pure stark white background (#FFFFFF). No shading, no skin, no noise. Identical composition and lines 1:1 ready for thermal stencil copier.',
strength: 0.78,
```

No existe comparación geométrica posterior. En la interfaz, `processMasterImageToThermalStencil` vuelve a procesar el mockup completo y sustituye el stencil del backend. El Sobel incluye contornos de piel, iluminación y cuerpo; no deshace la deformación anatómica. Produce grises, no exclusivamente negro y blanco, y deja el borde exterior transparente. Además contradice la prohibición explícita de extraer bordes del render en CLAUDE.md y ADR-0003.

Remediación recomendada: un maestro plano versionado con linework autoritativo; stencil nativo a partir de ese maestro y mockup mediante deformación geométrica registrada del mismo diseño. El sombreado o blending no debe alterar esa geometría. Retirar el Sobel y la segunda generación libre como fuentes del stencil. Verificar linaje de ambos archivos, máscaras/contornos y tolerancias de la transformación; rechazar resultados que no cumplan. No se ha medido divergencia de una imagen real: el hallazgo es la ausencia de garantía y el algoritmo incompatible, no un porcentaje inventado de error.

### ARQ-05 — Identidad y tamaño son dos requisitos diferentes

Código actual, `TattooPreviewModal.tsx:92,104–105`:

```ts
return targetCanvas.toDataURL('image/png');
const widthMm = slots.size?.widthMm ?? 150;
const heightMm = slots.size?.heightMm ?? 220;
```

Las medidas solo se muestran como texto. El generador usa 1024 × 1024 y el fallback 800 × 800. El dossier no transporta dimensiones. VERIFIED: cambiar a 200 × 300 mm no cambia el dossier de generación. Descargar un PNG no acredita impresión física a escala.

Remediación: dimensiones obligatorias en el contrato, exportación SVG/PDF con unidades físicas y barra de calibración; versión normal y espejo. Para PDF, `points = mm * 72 / 25.4`. Comprobar las dimensiones internas del archivo y realizar una impresión al 100 %, sin ajuste a página. La geometría y la escala requieren criterios de aceptación separados.

### UX-01 — Resultado de demostración presentado como válido

Código actual, `creator.ts:38–39,104–107`:

```ts
let stencilUrl = mockupResult.url;
let stencilProvider = 'thermal-stencil-engine-1:1';
return {
  url: this.generateDeterministicMockupSvg(),
  provider: 'creator-deterministic-mockup',
};
```

VERIFIED sin credenciales: stencil y mockup son la misma URL de SVG genérico. La interfaz muestra incondicionalmente «Identidad 1:1 Verificada». Los errores reales de proveedores también desembocan en ese fallback.

Contención lista para aplicar dentro de `renderMasterMockup`, sustituyendo su retorno genérico final:

```ts
throw new Error('No se ha podido generar el diseño. No hay un resultado válido disponible.');
```

Y sustituir el fallback del `catch` de derivación por:

```ts
throw new Error('No se ha podido producir un stencil válido para este diseño.');
```

Estas contenciones evitan falsos éxitos en esas ramas; no convierten el algoritmo restante en una solución conforme. Debe eliminarse también la inicialización del stencil con el mockup y retirarse la insignia hasta tener evidencia real. Efecto: la demo sin proveedor dejará de aparentar una generación exitosa; si se conserva, debe ser un modo demo explícito sin descarga técnica verificada.

### Hallazgos medios

- ARQ-06: `consultation` llama directamente a proveedores de imagen y `/api/generate` espera la generación dentro del POST, contra ARCH-INV-001 y la cola prevista. Acepta un dossier suministrado por el cliente mediante un cast, sin validación de runtime ni revisión del brief. El worker tiene servicios útiles pero esta ruta no los consume. Llevar la generación al worker, validar contratos y usar trabajos con estados y errores explícitos. El test arquitectónico Python solo recorre `.py` del worker: sus 201 tests verdes no cubren este desvío TypeScript.
- ARQ-07: README/CLAUDE aún afirman que no hay código; el índice afirma que consulta no existe mientras registra tareas verificadas. TASK-0017 no incorpora evidencia ejecutada de sus cinco garantías. `latestAssistantMessage` filtra `researcher` y `orchestrator`, aunque las preguntas son `prompt_architect`; la UI actual usa `session.messages`, pero el campo puente puede devolver el mensaje del cliente. Reconciliar documentación y contratos públicos, sin limitarse a adaptar expectativas de tests al comportamiento defectuoso.

## 4. Roadmap de acción

Secuencia propuesta, sin fechas ni responsables asignados:

1. **Sprint 0 — Veracidad y base comprobable:** quitar falsos éxitos/sellos, errores explícitos, arreglar tipos/build/lint, mantener fallos funcionales visibles, reconciliar estados SDD. Revisar y validar entradas del servidor antes de conectar generación real.
2. **Sprint 1 — Consulta y referencias:** preservar tema/preferencias, máximo tres preguntas, controles de tamaño, búsqueda real con procedencia, análisis visual y referencias efectivamente usadas. Corpus con motivos valencianos y ajenos a Valencia.
3. **Sprint 2 — Entrega técnica:** maestro plano versionado, stencil nativo, mockup del mismo maestro, calibración mm y PDF/SVG, cola y pruebas integradas. Aceptación visual y de impresión antes de declarar el stencil listo.

## 5. Matriz SDD y resultados

| Intención | Estado del producto | Evidencia |
|---|---|---|
| Búsqueda real automática | DRIFT | Directorio fijo; prueba ARQ-01 |
| Fidelidad a referencias | DRIFT | Referencias excluidas del render; ARQ-02 |
| Máximo tres preguntas | PARTIAL | Contador respeta tres; se inventan datos y pierde tema |
| Misma geometría | DRIFT | Generación secundaria + Sobel; sin validación |
| Stencil físico 1:1 | DRIFT | No hay exportación calibrada |
| Mockup sobre foto del cliente | DRIFT | Ruta maestra solo recibe texto |
| Comunicación de resultados reales | DRIFT | SVG genérico y sello incondicional |

Inventario documental `--baseline`: **PASS**, sin fuentes materiales sin módulo. Cobertura documental de cambios `--review`: **FAIL**, faltan revisiones de impacto. Código → Spec: **DRIFT**. Spec → Código: **DRIFT**. No se ha fabricado una revisión aprobada de cambios anteriores.

| Comprobación ejecutada | Resultado |
|---|---|
| TypeScript contratos | 62/62 pasan |
| TypeScript consulta | 9 pasan, 1 falla (texto de orquestador) |
| TypeScript web, ejecutada por separado | 6 pasan, 3 fallan (estilo/contrato de consulta y etiqueta de zona) |
| Python contratos | 70/70 pasan |
| Python worker | 201/201 pasan; un aviso de deprecación |
| `pnpm typecheck` | FAIL: TS2375 en `orchestrator.ts:52` |
| `pnpm lint` | FAIL: 6 errores; Prettier no llega a ejecutarse |
| `pnpm --filter web build` | FAIL: propiedad opcional `falKey` en `api/generate/route.ts:65` |
| Probes offline de esta auditoría | PASS al reproducir los defectos documentados; no equivalen a aceptación del producto |

## 6. Alcance y limitaciones

No se ha ejecutado una generación real, comprobado la disponibilidad de los enlaces del directorio, medido latencia, Core Web Vitals ni precisión visual, ni realizado impresión, revisión en navegador, auditoría de seguridad integral o evaluación jurídica. La revisión no certifica proveedores/modelos ni autenticidad histórica de los detalles incrustados. Se revisa la promesa técnica, no se da por válida la iconografía por estar escrita en un prompt.

El reconocimiento automático es orientativo: no detectó tests en la raíz pese a existir suites en los workspaces. Sus candidatos no se convierten automáticamente en hallazgos. Las claves detectadas en fixtures no se han declarado secretos reales.

La base de contratos y el worker tienen evidencia positiva de tests offline. Su existencia es aprovechable, pero no demuestra el funcionamiento del recorrido actual de la web. Los fallos encontrados preceden a esta auditoría; los únicos artefactos añadidos son TASK-0018 y sus evidencias.
