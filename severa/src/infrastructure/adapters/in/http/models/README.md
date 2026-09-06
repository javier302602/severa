# adapters/in/http/models

El documento de arquitectura describe `models/` para modelos de respuesta comunes entre varios módulos: `data-response-model.ts`, `paginated-response-model.ts` y `error-response-model.ts` (para estandarizar respuestas exitosas, paginadas y de error de la API).

Los 3 archivos existen como tipos placeholder (`DataResponseModel<T>`, `PaginatedResponseModel<T>`, `ErrorResponseModel`), pero **ningún controller los usa todavía** — cada uno sigue armando su propio `res.json({...})`/`res.status(...).json({ error })` inline. Adoptarlos en los controllers existentes es un cambio de comportamiento real (no solo de estructura) y queda fuera de este refactor hasta que se pida explícitamente.
