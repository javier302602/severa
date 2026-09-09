import express from 'express';
import { container } from '../../../../../../config/container';
import { requiereRol } from '../../../middleware/RolMiddleware';
import { CredencialesInvalidasError } from '../../../../../../../domain/errors/CredencialesInvalidasError';

// RF-14 (Vertical Slicing, sección IV/V del doc de arquitectura): extraído de
// PerfilController.ts (module_perfil_analista) — EliminarCuentaUseCase
// pertenece a M-01 (Gestión de Usuarios y Acceso), no a M-02. Mismo
// comportamiento, mismo endpoint, solo cambia el archivo.
export const cuentaRouter = express.Router();

// RF-98/RF-15: eliminación definitiva de la propia cuenta, previa
// confirmación con la contraseña actual. El id viene del token, nunca de la
// URL — es imposible pedir la baja de otra cuenta.
cuentaRouter.delete('/analistas/me', async (req, res) => {
  const { contrasena } = req.body;
  if (typeof contrasena !== 'string' || contrasena.length === 0) {
    res.status(400).json({ error: 'Se requiere la contraseña actual para confirmar' });
    return;
  }

  const id = req.analistaAutenticado!.id;
  try {
    await container.eliminarCuentaUseCase.ejecutar(id, contrasena);
  } catch (error) {
    // Excepción deliberada a la convención del resto del proyecto (todo error
    // de dominio cae al handler genérico de app.ts y responde 400): esta es
    // una acción irreversible, y "confirmación de identidad incorrecta" para
    // borrar la propia cuenta encaja mejor con 401 que con un 400 genérico.
    // No es una inconsistencia sin querer — es la única ruta del proyecto que
    // hace este mapeo, y queda documentado acá para quien lea esto después.
    if (error instanceof CredencialesInvalidasError) {
      res.status(401).json({ error: 'Contraseña incorrecta' });
      return;
    }
    throw error;
  }

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

// RF-99 (M-13, retoma): el id sale del token, nunca del body/URL — mismo
// criterio que DELETE /analistas/me, es imposible configurar el umbral de
// otra cuenta. Sin try/catch: un VariableDeConsultaInvalidaError (variable u
// valor inválidos) cae al error-handler genérico de app.ts, que ya responde
// 400 — mismo mecanismo que BusquedaController/PriorizacionController.
cuentaRouter.patch('/analistas/me/umbral-critico', async (req, res) => {
  const { variable, valor } = req.body;
  await container.configurarUmbralCriticoUseCase.ejecutar(req.analistaAutenticado!.id, variable, Number(valor));
  res.status(204).send();
});
