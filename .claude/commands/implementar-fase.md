---
description: Implementa una fase de docs/fases siguiendo las reglas del proyecto
argument-hint: archivo-de-la-fase.md
---

Lee `CLAUDE.md` y `docs/fases/LEEME.md`. Luego lee `docs/fases/$ARGUMENTS` e impleméntala.

Reglas:

- Sigue la fase al pie de la letra. Si algo no encaja con el código actual, detente y pregúntame antes de improvisar.
- El SQL va en un archivo nuevo de `database/` (número siguiente al último existente) y **no se ejecuta**.
- No leas ni edites archivos `.env`. No te conectes al servidor ni a producción.
- No instales dependencias que la fase no mencione sin avisarme.
- Presenta primero el plan y espera mi aprobación antes de editar.

Al terminar:

1. Compila el frontend (`npm run build` en `frontend`) y arranca el backend (`npm run dev` en `backend`), corrigiendo los errores que aparezcan.
2. Resume los archivos creados y modificados, el SQL que debo ejecutar a mano, las variables de entorno nuevas y las pruebas de la fase que debo hacer yo.
