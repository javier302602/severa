# module_comparacion_categorias — mappers

El documento de arquitectura describe `mappers/` para transformar requests HTTP en una entrada válida para `application/`, con la misma subestructura para los 16 módulos (ver "Árbol completo" en `docs/Arquitectura de SEVERA.md`). Hoy los controllers de este módulo leen `req.body`/`req.params`/`req.analistaAutenticado` directo y arman el objeto que le pasan al caso de uso inline, sin una clase mapper separada — igual que el resto de los módulos del proyecto.

Carpeta reservada para cuando se extraiga esa lógica a un mapper real.
