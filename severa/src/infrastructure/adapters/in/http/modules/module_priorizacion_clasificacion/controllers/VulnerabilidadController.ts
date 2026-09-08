import express from 'express';
import { container } from '../../../../../../config/container';

export const vulnerabilidadRouter = express.Router();

// RF-25/RF-30/RF-31 (M-04): el SDS marca la ficha como "generalizada"
// (variable de clasificación configurada en vez de puntaje de severidad,
// variable de agrupación en vez de tipo de acceso fijo, fechas ya no
// asumidas del NVD) — pero esta respuesta sigue exponiendo cve/cvssScore/
// tipoAcceso literales. Pendiente real hasta auditar M-09.
//
// Bug real de Sprint 17: esta respuesta se armaba a mano y solo copiaba 5
// campos, olvidando estadoRemediacion/tipoVulnerabilidad/diasParaParche/
// fechaCarga/fechaRemediacion — ConsultarVulnerabilidadPorCVE ya devolvía la
// entidad completa (vía buscarPorCve -> mapRow), el dato se perdía acá, no
// antes. Ahora expone los mismos campos que el resto de los endpoints que
// devuelven vulnerabilidades (ver BusquedaController.ts), más los que solo
// tiene sentido mostrar en el detalle de una.
vulnerabilidadRouter.get('/:cve', async (req, res) => {
  const vulnerabilidad = await container.consultarVulnerabilidadPorCveUseCase.ejecutar(req.params.cve, req.analistaAutenticado!.id);
  if (!vulnerabilidad) {
    res.status(404).json({ error: 'Vulnerabilidad no encontrada' });
    return;
  }

  res.json({
    id: vulnerabilidad.id,
    cve: vulnerabilidad.cve.valor,
    software: vulnerabilidad.descripcion,
    cvssScore: vulnerabilidad.cvssScore.valor,
    tipoAcceso: vulnerabilidad.tipoAcceso?.valor ?? 'Local',
    tipoVulnerabilidad: vulnerabilidad.tipoVulnerabilidad,
    diasParaParche: vulnerabilidad.diasParaParche ?? null,
    estadoRemediacion: vulnerabilidad.estadoRemediacion.valor,
    fechaCarga: vulnerabilidad.fechaCarga,
    fechaRemediacion: vulnerabilidad.fechaRemediacion ?? null
  });
});

vulnerabilidadRouter.get('/', async (req, res) => {
  const cvssMin = req.query.cvssMin ? Number(req.query.cvssMin) : undefined;
  const cvssMax = req.query.cvssMax ? Number(req.query.cvssMax) : undefined;
  const severidad = typeof req.query.severidad === 'string' ? req.query.severidad : undefined;

  if (cvssMin !== undefined && cvssMax !== undefined) {
    const resultados = await container.filtrarPorRangoDeVariableUseCase.ejecutar(cvssMin, cvssMax, req.analistaAutenticado!.id);
    res.json(resultados.map((item) => ({ cve: item.cve.valor, cvssScore: item.cvssScore.valor, software: item.descripcion })));
    return;
  }

  if (severidad) {
    const resultados = await container.filtrarPorCategoriaClasificacionUseCase.ejecutar(severidad, req.analistaAutenticado!.id);
    res.json(resultados.map((item) => ({ cve: item.cve.valor, cvssScore: item.cvssScore.valor, software: item.descripcion })));
    return;
  }

  res.json([]);
});
