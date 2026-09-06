import express from 'express';
import { container } from '../../../../../../config/container';

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
