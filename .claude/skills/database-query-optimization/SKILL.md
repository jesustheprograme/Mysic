---
name: database-query-optimization
description: Consultas lentas, índices y caché de base de datos (MongoDB, PostgreSQL con Prisma, Redis) - EXPLAIN ANALYZE, explain de MongoDB, índices parciales y de cobertura, antipatrones SELECT *, N+1 y subconsultas correlacionadas. Úsala cuando pidan "consulta lenta", "slow query", "índice", "EXPLAIN", "optimizar la base de datos" o "bloqueos". Use for SQL/NoSQL query tuning in the Mysic backend.
---

# Optimización de consultas

Backend: Node + Express. Datos en **MongoDB** (usuarios, favoritos, playlists; los índices se crean al arrancar en
`Backend/src/database.js`) y **PostgreSQL con Prisma** (`Backend/prisma/schema.prisma`).

## Objetivos de partida (ajustables)
Consulta típica menor de 100 ms, uso de índice en consultas frecuentes, tasa de aciertos de caché alta en lecturas repetidas.
Si no hay datos reales, no inventes porcentajes: mide.

## Método
1. **Localiza** la consulta lenta: registra el tiempo en la ruta (`console.time` o marca de rendimiento) o activa los logs
   de consultas (Prisma: `new PrismaClient({ log: ['query'] })`; Mongo: `db.setProfilingLevel(1, { slowms: 50 })`).
2. **Explica el plan:**
   - MongoDB: `db.coleccion.find(filtro).sort(orden).explain('executionStats')`. Mira `totalDocsExamined` frente a `nReturned`
     y que la etapa sea `IXSCAN`, no `COLLSCAN`.
   - PostgreSQL: `EXPLAIN (ANALYZE, BUFFERS) <consulta>` (vía `prisma.$queryRaw` o psql). Busca `Seq Scan` en tablas grandes,
     filas estimadas muy distintas de las reales y ordenaciones en disco.
3. **Cambia una cosa** (índice, filtro, proyección, paginación) y vuelve a explicar y medir.

## Antipatrones frecuentes
- `SELECT *` o traer documentos enteros cuando basta un campo: usa proyección o `select`.
- **N+1:** una consulta por elemento de una lista; sustitúyela por una consulta con `in` o por `include`.
- Paginar con `skip` grande: usa cursor o filtro por el último id.
- Subconsultas correlacionadas: reescribe con `JOIN` o consulta previa.
- Filtrar por una función de la columna (`lower(col)`): el índice no se usa; crea un índice sobre la expresión.
- Un `findOne` por petición autenticada: cachea el usuario con TTL corto y límite de tamaño.

## Índices
- Orden de campos: igualdad primero, orden después, rango al final.
- Índice **parcial** si solo se consulta un subconjunto; de **cobertura** si todo lo que se lee está en el índice.
- Cada índice cuesta escrituras y memoria: no añadas sin una consulta concreta que lo justifique.
- **Crear o cambiar índices o migraciones en producción requiere autorización explícita**; propón el cambio y su plan de reversión.

## Caché
Antes de añadir Redis u otro servicio, demuestra que la caché en memoria actual (con TTL y límite) es insuficiente.
Invalida por usuario y nunca compartas respuestas privadas entre cuentas.

## Entrega
Consulta, plan antes y después (documentos examinados, tiempo), cambio propuesto y riesgo. No ejecutes nada destructivo.
