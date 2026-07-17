import { RequestHandler } from 'express';

// RF-93: exige HTTPS en todos los entornos salvo 'development' (donde no hay
// certificado local y se trabaja sobre http://localhost). En producción, la
// terminación TLS suele ocurrir en un proxy/balanceador (nginx, Heroku, etc.)
// antes de llegar a Node, por eso se revisa también x-forwarded-proto además
// de req.secure.
export function exigirHttps(nodeEnv: string): RequestHandler {
  return (req, res, next) => {
    if (nodeEnv === 'development') {
      next();
      return;
    }

    const esSegura = req.secure || req.headers['x-forwarded-proto'] === 'https';
    if (!esSegura) {
      res.status(403).json({ error: 'Se requiere una conexión HTTPS' });
      return;
    }

    next();
  };
}
