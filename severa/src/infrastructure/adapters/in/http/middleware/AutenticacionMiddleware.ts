import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../../../config/env';
import { RolAnalista } from '../../../../../domain/entities/Analista';

export interface AnalistaAutenticado {
  id: string;
  rol: RolAnalista;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      analistaAutenticado?: AnalistaAutenticado;
    }
  }
}

// Cierra el hueco de autenticación reportado en M-11: hasta ahora ningún
// endpoint verificaba el JWT emitido por IniciarSesion, así que cualquier id
// enviado en el body/query/params se aceptaba sin comprobar que perteneciera
// al portador del token. A partir de este middleware, req.analistaAutenticado
// es la ÚNICA fuente confiable de "quién hace la request" en todo el sistema.
export const autenticacion: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticación requerido' });
    return;
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string' || (payload.rol !== 'analista' && payload.rol !== 'administrador')) {
      res.status(401).json({ error: 'Token inválido' });
      return;
    }

    req.analistaAutenticado = { id: payload.sub, rol: payload.rol };
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
};
