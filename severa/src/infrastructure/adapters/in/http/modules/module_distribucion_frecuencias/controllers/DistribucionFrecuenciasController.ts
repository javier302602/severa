import express from 'express';
import { container } from '../../../../../../config/container';
import {
  esVariableNumericaValida,
  VariableNumericaVulnerabilidad
} from '../../../../../../../domain/services/classification/VariablesVulnerabilidad';
import { VariableDeConsultaInvalidaError } from '../../../../../../../domain/errors/VariableDeConsultaInvalidaError';

// RF-14 (Vertical Slicing, sección IV/V del doc de arquitectura): extraído de
// EstadisticaController.ts (module_medidas_tendencia_dispersion) —
// GenerarDistribucionFrecuenciasUseCase pertenece a M-05 (Distribución de
// Frecuencias), no a M-06. Sigue montado bajo el mismo prefijo '/estadistica'
// en app.ts. Mismo comportamiento, mismo endpoint, solo cambia el archivo.
export const distribucionFrecuenciasRouter = express.Router();

// M-05 (retoma, RF-33): variable inválida se valida ACÁ (mismas
// esVariableNumericaValida/VariableDeConsultaInvalidaError de M-04, sin
// duplicarlas) y se deja que el error-handler global de app.ts la convierta
// a 400 — este controller nunca tuvo try/catch propio y no hace falta
// agregarle uno solo para esto (mismo criterio que numeroDeIntervalos
// inválido, ver comentario de abajo).
function validarVariableSiVieneEnQuery(valor: unknown): VariableNumericaVulnerabilidad | undefined {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'string' || !esVariableNumericaValida(valor)) {
    throw new VariableDeConsultaInvalidaError(`"${valor}" no es una variable numérica válida (cvssScore, diasParaParche)`);
  }
  return valor;
}

// numeroDeIntervalos (RF-39): override manual y opcional para tipo=agrupada
// — sin él, se mantienen las 5 bandas oficiales de CVSS de siempre (o, con
// variable=diasParaParche, el cálculo automático por Sturges — ver
// GenerarDistribucionFrecuencias.ts). Un valor inválido
// (NumeroDeIntervalosInvalidoError) cae al error-handler global de app.ts,
// que responde 400 con mensaje claro, igual que el resto de la API.
distribucionFrecuenciasRouter.get('/frecuencias', async (req, res) => {
  const tipo = req.query.tipo === 'agrupada' ? 'agrupada' : 'sinAgrupar';
  const numeroDeIntervalos = req.query.numeroDeIntervalos !== undefined ? Number(req.query.numeroDeIntervalos) : undefined;
  const variable = validarVariableSiVieneEnQuery(req.query.variable);

  const resultado = await container.generarDistribucionFrecuenciasUseCase.ejecutar(
    tipo,
    req.analistaAutenticado!.id,
    undefined,
    numeroDeIntervalos,
    variable
  );
  res.json(resultado);
});
