import express from 'express';
import { container } from '../../../../../../config/container';

export const authRouter = express.Router();

// RF-04: el registro público NUNCA lee `rol` del body, ni siquiera para
// descartarlo — si el campo no se toca en ningún punto del código, es
// imposible que un cliente lo use para escalar a 'administrador' (hueco de
// seguridad real cerrado en Sprint 15). RegistrarAnalistaUseCase fuerza
// 'analista' internamente.
authRouter.post('/register', async (req, res) => {
  const { id, nombre, correo, contrasena } = req.body;
  const analista = await container.registrarAnalistaUseCase.ejecutar({ id, nombre, correo, contrasena });
  res.status(201).json({ id: analista.id, nombre: analista.nombre, correo: analista.correo.valor, rol: analista.rol });
});

authRouter.post('/login', async (req, res) => {
  const { correo, contrasena } = req.body;
  // RF-08: IP de origen, resuelta acá (única capa que conoce Express) y
  // pasada como valor plano al caso de uso decorado.
  const result = await container.iniciarSesionUseCase.ejecutar({ correo, contrasena }, req.ip ?? null);
  res.json({ token: result.token, analista: { id: result.analista.id, nombre: result.analista.nombre, correo: result.analista.correo.valor, rol: result.analista.rol } });
});

// RF-03 + anti-enumeración: SIEMPRE responde 200 con el mismo mensaje, exista
// o no el correo — el caso de uso ya devuelve null en silencio para ese caso,
// así que el controller ni siquiera necesita mirar el resultado para saber
// qué responder.
authRouter.post('/recuperar-contrasena', async (req, res) => {
  const { correo } = req.body;
  await container.recuperarContrasenaUseCase.ejecutar({ correo });
  res.status(200).json({ mensaje: 'Si el correo está registrado, se enviará un enlace de recuperación' });
});

authRouter.post('/restablecer-contrasena', async (req, res) => {
  const { token, nuevaContrasena } = req.body;
  await container.restablecerContrasenaUseCase.ejecutar({ token, nuevaContrasena });
  res.status(200).json({ mensaje: 'Contraseña actualizada correctamente' });
});
