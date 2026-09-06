# adapters/in/http/filtros

El documento de arquitectura describe `filtros/` como "algo como middleware pero atado a controladores específicos" (a diferencia de `middleware/`, que es global). Hoy SEVERA no tiene ningún filtro de ese tipo — la única autorización por rol (`RolMiddleware.ts`, usado solo en la ruta de auditoría) sigue viviendo en `middleware/` porque es un único middleware reutilizable, no algo atado a un controller particular.

Carpeta reservada para cuando exista un filtro real específico de un controller.
