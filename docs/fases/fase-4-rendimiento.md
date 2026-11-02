# Fase 4: rendimiento y almacenamiento

Objetivo: que InvoiceMan siga rápido y barato de operar con unas 20 empresas (algunas con cientos de usuarios y miles de solicitudes). No cambia el comportamiento funcional: solo la eficiencia.

Antes de empezar, ejecuta una **línea base**: anota cuánto tarda en tu entorno de desarrollo `GET /api/users`, la descarga del Excel de estadísticas y la subida de una foto de 4 MB, para comparar al final.

## 4.1 Compresión de imágenes antes de subirlas

Aplica a los soportes de **factura manual** y **factura del extranjero** (en la electrónica no se sube archivo). Los PDF **no** se tocan.

Requisitos:

- Función `comprimirImagen(file)` en un archivo nuevo `frontend/src/imagen.js`:
  - Solo para `image/jpeg`, `image/png` e `image/webp` con tamaño > 400 KB.
  - Decodifica con `createImageBitmap(file, { imageOrientation: 'from-image' })` para respetar la rotación de la foto del celular.
  - Reduce el lado mayor a 2000 px como máximo (sin ampliar) y exporta a JPEG calidad 0.8 con un `canvas`.
  - Si el resultado **no** es más pequeño que el original, o algo falla, devuelve el archivo original.
  - El archivo resultante conserva el nombre cambiando la extensión a `.jpg`.
- Integra la función en `FileInput.jsx`: al elegir un archivo se comprime (con indicador "Optimizando imagen…") y se muestra "antes → después" en KB junto a la vista previa. La validación de 10 MB sigue aplicando al archivo **original**.
- El servidor no cambia: ya valida el tipo por los bytes del archivo y el límite de 10 MB.

Pruebas: una foto de celular de 4 a 6 MB queda por debajo de 1 MB y se lee bien; un PDF sale idéntico; un PNG pequeño (< 400 KB) no se toca; una imagen corrupta no rompe el formulario (se envía el original o se muestra error claro); la orientación de una foto vertical se conserva.

## 4.2 Usuarios: búsqueda y paginación

Hoy `GET /api/users` devuelve todos los usuarios; con cientos de usuarios es lento y pesado.

Backend (`src/routes/users.js`):

- `GET /api/users?page=1&limit=25&q=texto&activo=true|false`: filtra por nombre, correo o documento (`ilike`, **escapando** `%`, `_` y `,` del texto buscado para no romper el filtro `.or()`), orden por nombre, `limit` máximo 100. Responde `{ total, page, limit, users }`.
- `GET /api/users/options?q=texto`: lista ligera para selectores (`id`, `nombre`, `numeroDoc`), máximo 50 resultados, solo activos, orden por nombre.
- El resto de rutas de usuarios no cambia.

Frontend:

- `config/Usuarios.jsx`: la tabla usa la paginación del servidor, con campo de búsqueda con retardo (debounce de 300 ms), selector de "solo activos" y controles Anterior/Siguiente con "Página X de Y".
- Reemplaza los selectores que hoy cargan **todos** los usuarios (filtro de usuario en `Bandeja.jsx` y en `config/DisclaimerViaticos.jsx`) por un selector con búsqueda que use `/api/users/options`.

Datos de prueba: crea `backend/scripts/sembrar-usuarios.js` que inserte N usuarios de prueba en una empresa dada (argumentos `tenantId` y `N`, un solo hash bcrypt reutilizado, correos `prueba+NNN@example.test`). **Debe negarse a ejecutarse** si `ALLOW_SEED` no es `1` o si `NODE_ENV` es `production`. Recuerda que el límite del plan puede bloquear la siembra: en desarrollo sube `tenant_plan.limite_usuarios` antes de sembrar.

Pruebas: con 600 usuarios sembrados, la pantalla de usuarios carga rápido, la búsqueda por nombre, correo y documento funciona, un texto con `%` o `,` no rompe nada, y la carga masiva y el chequeo del último administrador siguen funcionando.

## 4.3 Excel de estadísticas sin cargar todo en memoria

Hoy `GET /api/stats/export` construye el libro completo en memoria (hasta 50.000 filas).

Cambios en `src/routes/stats.js`:

- Usa el escritor por flujo de ExcelJS (`new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true })`), definiendo columnas, formatos, fila congelada y autofiltro **antes** de la primera fila, y confirmando cada fila (`row.commit()`) y el libro al final.
- Pagina las legalizaciones con **keyset** (orden `created_at, id`; la siguiente página con `.or('created_at.gt.X,and(created_at.eq.X,id.gt.Y)')`) en lotes de 1000, en lugar de `range(offset)`.
- No cargues todos los usuarios y conceptos: por cada lote, consulta solo los `user_id` y `concept_id` del lote (`.in(...)`) y cachea los resultados en un `Map`.
- El tope sube a 100.000 filas; al superarlo, termina con un mensaje claro pidiendo acotar las fechas (antes de empezar a escribir, con un conteo previo, para poder responder un error JSON sin dejar un archivo a medias).
- Mantén exactamente las mismas 7 columnas, formatos y nombres.

Pruebas: con 20.000 legalizaciones sembradas en desarrollo, el export no hace crecer la memoria del proceso de forma notable (mídelo con `process.memoryUsage()` registrado antes y después), el archivo abre en Excel con los mismos datos que antes y el filtro por estado y fechas sigue funcionando.

## 4.4 Medición de peticiones lentas

- Middleware ligero en `server.js` que registre en consola (una línea) las peticiones que tarden más de 1000 ms: método, ruta (sin parámetros de consulta) y duración.
- Revisa con `explain analyze`, en el SQL Editor de desarrollo, las consultas de `inbox`, `mine` y `stats` con datos sembrados. Si alguna hace lectura secuencial de una tabla grande, propone el índice y déjalo en `database/NNN_indices.sql` (sin ejecutar).

## Definición de terminado

Cumple la de `LEEME.md` y además: compara la línea base inicial con los resultados finales y entrégalos en una tabla en el resumen.
