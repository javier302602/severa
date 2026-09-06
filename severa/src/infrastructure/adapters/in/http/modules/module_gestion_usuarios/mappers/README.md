# module_gestion_usuarios — mappers

El documento de arquitectura describe `mappers/` para transformar requests HTTP en una entrada válida para `application/`. Hoy `AuthController.ts` y `CuentaController.ts` leen `req.body`/`req.analistaAutenticado` directo y arman el objeto que le pasan al caso de uso inline, sin una clase mapper separada.

Carpeta reservada para cuando se extraiga esa lógica a un mapper real.
