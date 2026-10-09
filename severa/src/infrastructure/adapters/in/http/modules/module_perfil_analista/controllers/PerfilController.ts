import express from 'express';
import { container } from '../../../../../../config/container';
import { leerEnteroNoNegativo } from '../../../shared/leerEnteroNoNegativo';
import { LIMITE_MAXIMO_DE_HISTORIAL } from '../../../../../../../application/usecases/module_perfil_analista/ObtenerHistorialAnalisis';

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

// RF-11: historial de análisis del analista autenticado, del más reciente al
// más antiguo, con fecha, dataset y tipo de análisis de cada uno. Igual que
// arriba, el id sale exclusivamente de req.analistaAutenticado.id. Devuelve
// UNA página (?limite=, por defecto 50 y como máximo 200; ?desplazamiento=,
// por defecto 0) junto con el total.
perfilRouter.get('/perfil/historial', async (req, res) => {
  const analistaId = req.analistaAutenticado!.id;
  const limite = leerEnteroNoNegativo(req.query.limite);
  const desplazamiento = leerEnteroNoNegativo(req.query.desplazamiento);

  if (limite === null || limite === 0 || desplazamiento === null) {
    res.status(400).json({ error: `"limite" debe ser un entero entre 1 y ${LIMITE_MAXIMO_DE_HISTORIAL} y "desplazamiento" un entero mayor o igual a 0` });
    return;
  }

  res.json(await container.obtenerHistorialAnalisisUseCase.ejecutar(analistaId, { limite, desplazamiento }));
});

// RF-14: el historial completo, como libro de Excel. Va en una ruta propia
// (no como ?formato= de la anterior) porque no se pagina: exporta todo.
perfilRouter.get('/perfil/historial/exportar', async (req, res) => {
  const archivo = await container.exportarHistorialAnalisisUseCase.ejecutar(req.analistaAutenticado!.id);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="historial-de-analisis.xlsx"');
  res.send(archivo);
});
