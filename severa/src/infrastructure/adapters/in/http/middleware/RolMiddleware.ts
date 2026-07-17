import { RequestHandler } from 'express';
import { RolAnalista } from '../../../../../domain/entities/Analista';

// RF-91: middleware reutilizable para restringir rutas por rol, en vez de
// repetir el mismo if/else de verificación en cada controller. Debe montarse
// SIEMPRE después de `autenticacion` (depende de req.analistaAutenticado).
export function requiereRol(...rolesPermitidos: RolAnalista[]): RequestHandler {
  return (req, res, next) => {
    const rol = req.analistaAutenticado?.rol;

    if (!rol || !rolesPermitidos.includes(rol)) {
      res.status(403).json({ error: 'No tiene permisos para acceder a este recurso' });
      return;
    }

    next();
  };
}
