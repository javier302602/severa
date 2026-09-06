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

// "Marcar todas como leídas" (2026-07-19). No colisiona con la ruta de abajo
// (esta tiene 2 segmentos tras /notificaciones, la de :id/leida tiene 3),
// pero se monta primero de todos modos por legibilidad.
notificacionRouter.patch('/notificaciones/marcar-todas-leidas', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;
  const cantidad = await container.marcarTodasLasNotificacionesLeidasUseCase.ejecutar(analistaId);
  res.json({ marcadas: cantidad });
});

// "Eliminar seleccionadas" (2026-07-20): recibe un array de ids en el body
// (DELETE con body — soportado por express.json(), ya montado globalmente
// en app.ts). Un id inválido, vacío o de otro analista simplemente no se
// borra (eliminarVarias ya lo scopea por dueño) — no hace falta 404 por
// cada uno para no filtrar si un id existe.
notificacionRouter.delete('/notificaciones', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;
  const ids = req.body?.ids;

  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    res.status(400).json({ error: 'Debe indicar un array de ids en el campo "ids"' });
    return;
  }

  const eliminadas = await container.eliminarNotificacionesUseCase.ejecutar(ids, analistaId);
  res.json({ eliminadas });
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
