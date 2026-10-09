import express from 'express';
import { container } from '../../../../../../config/container';
import { enviarArchivoGenerado, leerSolicitudDeInforme } from '../../../shared/enviarArchivoGenerado';

export const informeRouter = express.Router();

// RF-77/78/79/132/133: informe completo en cualquiera de los formatos del
// puerto (pdf, docx, html, latex, xlsx). RF-80: con adjuntarGraficos=true el
// resultado es un .zip con el informe más cada gráfico como archivo suelto.
informeRouter.get('/informes/completo', async (req, res) => {
  const solicitud = leerSolicitudDeInforme(req);
  if ('error' in solicitud) {
    res.status(400).json({ error: solicitud.error });
    return;
  }

  const archivo = await container.generarInformeUseCase.ejecutar(solicitud.formato, req.analistaAutenticado!.id, solicitud.opciones);
  enviarArchivoGenerado(res, archivo, 'informe-siade');
});

informeRouter.get('/informes/resumen-ejecutivo', async (req, res) => {
  const buffer = await container.generarResumenEjecutivoUseCase.ejecutar(req.analistaAutenticado!.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.send(buffer);
});

// RF-83: programa la generación periódica de informes. Llamar dos veces
// reemplaza la programación anterior (ver NodeCronProgramadorDeTareas) en vez
// de acumular tareas en paralelo.
informeRouter.post('/informes/programar', async (req, res) => {
  const { frecuencia } = req.body;

  if (frecuencia !== 'semanal' && frecuencia !== 'mensual') {
    res.status(400).json({ error: 'Parámetro "frecuencia" inválido. Valores permitidos: semanal, mensual.' });
    return;
  }

  await container.programarInformePeriodicoUseCase.ejecutar(frecuencia, req.analistaAutenticado!.id);
  res.status(202).json({ mensaje: `Informe periódico (${frecuencia}) programado correctamente` });
});
