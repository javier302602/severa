# module_gestion_usuarios — request-dtos

El documento de arquitectura describe `request-dtos/` para las clases que mapean los datos enviados por la API. Hoy `AuthController.ts` y `CuentaController.ts` desestructuran `req.body` directo (sin validación de forma vía una clase DTO), igual que el resto de los controllers del proyecto.

Carpeta reservada para cuando se introduzcan DTOs de request reales.
