# adapters/out/context

El documento de arquitectura reserva esta carpeta para un adaptador que guarde y recupere información entre peticiones (p. ej. datos del usuario actual). Hoy SEVERA no tiene ningún mecanismo de ese tipo — la información del analista autenticado viaja en el JWT y se lee directo de `req.analistaAutenticado` en cada request.

Carpeta reservada para cuando exista esa necesidad real. Ver también `application/ports/out/context/` (el puerto correspondiente, en el mismo estado).
