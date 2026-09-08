import express from 'express';
import { container } from '../../../../../../config/container';

// RF-14 (Vertical Slicing, sección IV/V del doc de arquitectura): extraído de
// EstadisticaController.ts (module_medidas_tendencia_dispersion) —
// GenerarDistribucionFrecuenciasUseCase pertenece a M-05 (Distribución de
// Frecuencias), no a M-06. Sigue montado bajo el mismo prefijo '/estadistica'
// en app.ts. Mismo comportamiento, mismo endpoint, solo cambia el archivo.
export const distribucionFrecuenciasRouter = express.Router();

// numeroDeIntervalos (RF-39): override manual y opcional para tipo=agrupada
// — sin él, se mantienen las 5 bandas oficiales de CVSS de siempre. Un valor
// inválido (NumeroDeIntervalosInvalidoError) cae al error-handler global de
// app.ts, que responde 400 con mensaje claro, igual que el resto de la API.
distribucionFrecuenciasRouter.get('/frecuencias', async (req, res) => {
  const tipo = req.query.tipo === 'agrupada' ? 'agrupada' : 'sinAgrupar';
  const numeroDeIntervalos = req.query.numeroDeIntervalos !== undefined ? Number(req.query.numeroDeIntervalos) : undefined;
  const resultado = await container.generarDistribucionFrecuenciasUseCase.ejecutar(
    tipo,
    req.analistaAutenticado!.id,
    undefined,
    numeroDeIntervalos
  );
  res.json(resultado);
});
