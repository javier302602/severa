import express from 'express';
import { container } from '../../../config/container';

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

// RF-98/RF-15: eliminación definitiva de la propia cuenta. El id viene del
// token, nunca de la URL — es imposible pedir la baja de otra cuenta.
perfilRouter.delete('/analistas/me', async (req, res) => {
  const id = req.analistaAutenticado!.id;
  await container.eliminarCuentaUseCase.ejecutar(id);
  res.status(204).send();
});
