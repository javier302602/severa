import express from 'express';
import { container } from '../../../../../../config/container';
import { requiereRol } from '../../../middleware/RolMiddleware';

export const auditoriaRouter = express.Router();

// RF-91 + RF-94/95: solo un administrador puede ver el historial de auditoría.
// RF-138: con ?datasetId=... devuelve solo la auditoría de ese dataset
// genérico (carga, limpieza, imputación, exportación, corrección de tipos).
auditoriaRouter.get('/auditoria', requiereRol('administrador'), async (req, res) => {
  const { datasetId } = req.query;
  if (datasetId !== undefined && (typeof datasetId !== 'string' || datasetId.trim() === '')) {
    res.status(400).json({ error: 'El parámetro "datasetId" debe ser un único id de dataset' });
    return;
  }

  const registros = await container.consultarAuditoriaUseCase.ejecutar(datasetId === undefined ? {} : { datasetId: datasetId.trim() });

  res.json(
    registros.map((registro) => ({
      id: registro.id,
      usuario: registro.usuario,
      accion: registro.accion,
      detalle: registro.detalle,
      fechaHora: registro.fechaHora,
      ip: registro.ip,
      datasetId: registro.datasetId
    }))
  );
});
