import express from 'express';
import { container } from '../../../config/container';

// RF-99 a RF-104: centro de notificaciones del analista autenticado. Montado
// después de `autenticacion` en app.ts, igual que el resto de la API desde
// M-12. El id del destinatario SIEMPRE sale de req.analistaAutenticado.id
// (JWT verificado), nunca de query/body — misma regla de M-11/M-12: es
// imposible leer o marcar como leída una notificación de otro analista.
export const notificacionRouter = express.Router();

notificacionRouter.get('/notificaciones', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;
  const notificaciones = await container.obtenerNotificacionesUseCase.ejecutar(analistaId);

  res.json(
    notificaciones.map((notificacion) => ({
      id: notificacion.id,
      tipo: notificacion.tipo,
      leida: notificacion.leida,
      fecha: notificacion.fecha,
      mensaje: notificacion.mensaje
    }))
  );
});

notificacionRouter.patch('/notificaciones/:id/leida', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;
  const actualizada = await container.marcarNotificacionLeidaUseCase.ejecutar(req.params.id, analistaId);

  if (!actualizada) {
    res.status(404).json({ error: 'Notificación no encontrada' });
    return;
  }

  res.status(204).send();
});
