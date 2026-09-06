# module_busqueda_filtros_avanzados — request-dtos

El documento de arquitectura describe `request-dtos/` para las clases que mapean los datos enviados por la API, con la misma subestructura para los 16 módulos (ver "Árbol completo" en `docs/Arquitectura de SEVERA.md`). Hoy los controllers de este módulo desestructuran `req.body` directo (sin validación de forma vía una clase DTO), igual que el resto de los módulos del proyecto.

Carpeta reservada para cuando se introduzcan DTOs de request reales.
