import express from 'express';
import { container } from '../../../../../../config/container';
import { requiereRol } from '../../../middleware/RolMiddleware';

// RF-14 (Vertical Slicing, sección IV/V del doc de arquitectura): extraído de
// PerfilController.ts (module_perfil_analista) — EliminarCuentaUseCase
// pertenece a M-01 (Gestión de Usuarios y Acceso), no a M-02. Mismo
// comportamiento, mismo endpoint, solo cambia el archivo.
export const cuentaRouter = express.Router();

// RF-98/RF-15: eliminación definitiva de la propia cuenta. El id viene del
// token, nunca de la URL — es imposible pedir la baja de otra cuenta.
cuentaRouter.delete('/analistas/me', async (req, res) => {
  const id = req.analistaAutenticado!.id;
  await container.eliminarCuentaUseCase.ejecutar(id);
  res.status(204).send();
});

// RF-04: solo un administrador puede cambiar el rol de otro analista. El id
// del objetivo sí viene de la URL (a diferencia de /analistas/me) porque acá
// la acción es deliberadamente sobre una cuenta ajena; lo que evita el abuso
// es requiereRol('administrador'), no ocultar el id.
cuentaRouter.patch('/analistas/:id/rol', requiereRol('administrador'), async (req, res) => {
  const { rol } = req.body;
  const asignadoPor = req.analistaAutenticado!.id;
  const analista = await container.asignarRolUseCase.ejecutar({ analistaId: req.params.id, nuevoRol: rol }, asignadoPor);
  res.json({ id: analista.id, nombre: analista.nombre, correo: analista.correo.valor, rol: analista.rol });
});
