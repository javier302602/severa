import express from 'express';
import { container } from '../../../../../../config/container';
import { LIMITE_MAXIMO_DE_NOTIFICACIONES } from '../../../../../../../application/ports/in/module_notificaciones_alertas/ObtenerNotificacionesUseCase';

// RF-99 a RF-104: centro de notificaciones del analista autenticado. Montado
// después de `autenticacion` en app.ts, igual que el resto de la API desde
// M-12. El id del destinatario SIEMPRE sale de req.analistaAutenticado.id
// (JWT verificado), nunca de query/body — misma regla de M-11/M-12: es
// imposible leer o marcar como leída una notificación de otro analista.
export const notificacionRouter = express.Router();

// Un parámetro de paginado: ausente (se usa el valor por defecto) o un entero
// no negativo escrito solo con dígitos. Devuelve null si vino otra cosa.
function leerEnteroNoNegativo(valor: unknown): number | undefined | null {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'string' || !/^\d{1,9}$/.test(valor)) return null;
  return Number(valor);
}

// RF-103. Devuelve UNA página (?limite=, por defecto 50 y como máximo 200;
// ?desplazamiento=, por defecto 0) junto con el total y la cantidad de no
// leídas de todo el centro de notificaciones. Antes devolvía todas las
// notificaciones del analista en un arreglo: con decenas de miles, la
// respuesta y la pantalla que la mostraba dejaban de funcionar.
notificacionRouter.get('/notificaciones', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;
  const limite = leerEnteroNoNegativo(req.query.limite);
  const desplazamiento = leerEnteroNoNegativo(req.query.desplazamiento);

  if (limite === null || limite === 0 || desplazamiento === null) {
    res.status(400).json({ error: `"limite" debe ser un entero entre 1 y ${LIMITE_MAXIMO_DE_NOTIFICACIONES} y "desplazamiento" un entero mayor o igual a 0` });
    return;
  }

  const resultado = await container.obtenerNotificacionesUseCase.ejecutar(analistaId, { limite, desplazamiento });

  res.json({
    notificaciones: resultado.notificaciones.map((notificacion) => ({
      id: notificacion.id,
      tipo: notificacion.tipo,
      leida: notificacion.leida,
      fecha: notificacion.fecha,
      mensaje: notificacion.mensaje
    })),
    total: resultado.total,
    noLeidas: resultado.noLeidas,
    limite: resultado.limite,
    desplazamiento: resultado.desplazamiento
  });
});

// RF-104: elimina todas las notificaciones ya leídas del analista. Va antes
// que DELETE /notificaciones solo por claridad: son rutas distintas.
notificacionRouter.delete('/notificaciones/leidas', async (req, res) => {
  const eliminadas = await container.eliminarNotificacionesLeidasUseCase.ejecutar(req.analistaAutenticado!.id);
  res.json({ eliminadas });
});

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
