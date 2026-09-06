import express from 'express';
import { container } from '../../../config/container';
import { requiereRol } from './middleware/RolMiddleware';

export const auditoriaRouter = express.Router();

// RF-91 + RF-94/95: solo un administrador puede ver el historial de auditoría.
auditoriaRouter.get('/auditoria', requiereRol('administrador'), async (_req, res) => {
  const registros = await container.consultarAuditoriaUseCase.ejecutar();

  res.json(
    registros.map((registro) => ({
      id: registro.id,
      usuario: registro.usuario,
      accion: registro.accion,
      detalle: registro.detalle,
      fechaHora: registro.fechaHora
    }))
  );
});
