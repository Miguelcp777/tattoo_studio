# InkCraft — resultado de revisión SDD

El flujo actual no cumple las garantías de búsqueda real, fidelidad de referencias y stencil técnico 1:1. Es un prototipo con mensajes de éxito que exceden lo demostrado.

- La búsqueda usa tres enlaces fijos y confunde otros escudos con Valencia CF.
- Las fotos no se analizan visualmente ni se envían al generador activo.
- El contador llega como máximo a tres preguntas en la prueba, pero pierde la idea inicial e inventa ubicación/preferencias.
- El stencil se regenera o extrae por bordes de la fotografía; no conserva una geometría autoritativa ni tamaño físico.
- Sin credenciales se devuelve un dibujo genérico y se presenta como verificado.

Pruebas: 271 Python pasan; TypeScript 77 pasan y 4 fallan. Tipos, lint y build fallan. Inventario SDD PASS; revisión documental FAIL; alineación en ambas direcciones DRIFT.

Recomendación: primero resultados honestos y consulta acumulativa; después referencias efectivas; finalmente un diseño plano maestro compartido, stencil calibrado y mockup geométrico. No basta con mejorar los prompts.

Informe detallado: [audit-report.md](audit-report.md). No se ha cambiado el código de la aplicación ni realizado generación externa.
