import express from 'express';
import { container } from '../../../config/container';

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
  const result = await container.iniciarSesionUseCase.ejecutar({ correo, contrasena });
  res.json({ token: result.token, analista: { id: result.analista.id, nombre: result.analista.nombre, correo: result.analista.correo.valor, rol: result.analista.rol } });
});
