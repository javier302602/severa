import express from 'express';
import { container } from '../../../../../../config/container';

export const perfilRouter = express.Router();

// RF-09: nombre, correo y rol del analista autenticado. Mismo criterio que
// el PUT de abajo — el id sale exclusivamente de req.analistaAutenticado.id,
// nunca de params/query, para que sea imposible pedir el perfil de otro.
perfilRouter.get('/perfil', async (req, res) => {
  const id = req.analistaAutenticado!.id;
  const analista = await container.verPerfilUseCase.ejecutar(id);
  res.json({ id: analista.id, nombre: analista.nombre, correo: analista.correo.valor, rol: analista.rol });
});

// Antes tomaba `id` de req.params.id sin verificar nada — cualquiera podía
// editar el perfil de cualquier analista con solo conocer su id (hueco
// reportado en M-11). Ahora usa exclusivamente req.analistaAutenticado.id,
// que viene del JWT verificado por el middleware `autenticacion`.
perfilRouter.put('/perfil', async (req, res) => {
  const { nombre, correo } = req.body;
  const id = req.analistaAutenticado!.id;
  const analista = await container.editarPerfilUseCase.ejecutar({ id, nombre, correo });
  res.json({ id: analista.id, nombre: analista.nombre, correo: analista.correo.valor, rol: analista.rol });
});

// DELETE /analistas/me se movió a CuentaController.ts (module_gestion_usuarios,
// M-01) — EliminarCuentaUseCase pertenece a ese módulo, no a M-02. Mismo
// comportamiento, solo cambia el archivo.

// RF-11: historial de análisis del analista autenticado, más reciente
// primero. Igual que arriba, el id sale exclusivamente de
// req.analistaAutenticado.id. `limite`/`offset` son opcionales (mismo
// contrato que Paginacion en VulnerabilidadRepository) — sin ellos se
// devuelve el historial completo.
perfilRouter.get('/perfil/historial', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;
  const { limite, offset } = req.query;
  const paginacion =
    typeof limite === 'string' && typeof offset === 'string'
      ? { limite: Number(limite), offset: Number(offset) }
      : undefined;

  const eventos = await container.obtenerHistorialAnalisisUseCase.ejecutar(analistaId, paginacion);
  res.json(
    eventos.map((evento) => ({
      id: evento.id,
      tipoEvento: evento.tipoEvento,
      payload: evento.payload,
      fechaHora: evento.fechaHora
    }))
  );
});
