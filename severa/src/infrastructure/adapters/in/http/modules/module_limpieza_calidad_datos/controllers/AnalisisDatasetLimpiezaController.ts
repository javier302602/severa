import express from 'express';
import { container } from '../../../../../../config/container';
import { responderErrorDeAnalisisDeDatos } from '../../../shared/responderErrorDeAnalisisDeDatos';
import {
  DecisionDeTratamiento,
  ESTRATEGIAS_DE_FALTANTES,
  EstrategiaDeFaltantes,
  METODOS_DE_IMPUTACION,
  MetodoDeImputacion
} from '../../../../../../../domain/services/data-cleaning/TratamientoDeFaltantesGenerico';

// M-15, Ronda 2: tratamiento de valores faltantes.
//   RF-120  el sistema propone, por variable, qué se puede hacer y qué
//           recomienda; nunca aplica nada sin confirmación explícita
//   RF-121  imputación por media, mediana o moda según el tipo
//   RF-122  una notificación de resumen por limpieza (la emite el decorador)
//   RF-123  bitácora consultable por el analista
// El flujo son tres pasos, y solo el último escribe:
//   GET  .../limpieza/propuesta      qué hay para tratar y qué se recomienda
//   POST .../limpieza/vista-previa   qué pasaría con estas decisiones (no guarda)
//   POST .../limpieza                lo aplica, exige "confirmado": true
export const analisisDatasetLimpiezaRouter = express.Router();

// Cantidad máxima de decisiones por pedido: una por columna como mucho, y un
// dataset con más columnas que esto no llega hasta acá (el límite del cuerpo
// JSON lo corta antes). Es solo para no recorrer un arreglo absurdo.
const MAXIMO_DE_DECISIONES = 2000;

// Valida la FORMA del cuerpo (que sea un arreglo de objetos con los campos
// esperados). Si las decisiones tienen sentido para este dataset — que la
// columna exista, que tenga faltantes, que el método corresponda a su tipo —
// lo decide el dominio (aplicarTratamientoDeFaltantes), que conoce los datos.
function leerDecisiones(cuerpo: unknown): DecisionDeTratamiento[] | string {
  const decisiones = typeof cuerpo === 'object' && cuerpo !== null ? (cuerpo as { decisiones?: unknown }).decisiones : undefined;
  if (!Array.isArray(decisiones)) {
    return 'Debe indicar "decisiones": una lista con una entrada por cada columna a tratar';
  }
  if (decisiones.length > MAXIMO_DE_DECISIONES) {
    return `No se pueden indicar más de ${MAXIMO_DE_DECISIONES} decisiones en un mismo pedido`;
  }

  const leidas: DecisionDeTratamiento[] = [];
  for (const decision of decisiones) {
    if (typeof decision !== 'object' || decision === null) {
      return 'Cada decisión debe ser un objeto con "columna" y "estrategia"';
    }
    const { columna, estrategia, metodo } = decision as { columna?: unknown; estrategia?: unknown; metodo?: unknown };
    if (typeof columna !== 'string' || columna.trim() === '') {
      return 'Cada decisión debe indicar "columna"';
    }
    if (typeof estrategia !== 'string' || !ESTRATEGIAS_DE_FALTANTES.includes(estrategia as EstrategiaDeFaltantes)) {
      return `La estrategia de "${columna}" debe ser una de: ${ESTRATEGIAS_DE_FALTANTES.join(', ')}`;
    }
    if (metodo !== undefined && metodo !== null && (typeof metodo !== 'string' || !METODOS_DE_IMPUTACION.includes(metodo as MetodoDeImputacion))) {
      return `El método de "${columna}" debe ser uno de: ${METODOS_DE_IMPUTACION.join(', ')}`;
    }
    leidas.push({
      columna,
      estrategia: estrategia as EstrategiaDeFaltantes,
      ...(typeof metodo === 'string' ? { metodo: metodo as MetodoDeImputacion } : {})
    });
  }
  return leidas;
}

analisisDatasetLimpiezaRouter.get('/analisis-datos/:sesionId/limpieza/propuesta', async (req, res) => {
  try {
    res.json(await container.proponerTratamientoDeFaltantesUseCase.ejecutar(req.analistaAutenticado!.id, req.params.sesionId));
  } catch (error) {
    responderErrorDeAnalisisDeDatos(res, error);
  }
});

// POST porque lleva un cuerpo, no porque cambie algo: calcula el resultado y
// lo descarta. Sirve para mostrarle al analista cuántas filas y columnas se
// irían y qué valor se usaría para imputar ANTES de que confirme.
analisisDatasetLimpiezaRouter.post('/analisis-datos/:sesionId/limpieza/vista-previa', async (req, res) => {
  const decisiones = leerDecisiones(req.body);
  if (typeof decisiones === 'string') {
    res.status(400).json({ error: decisiones });
    return;
  }

  try {
    res.json(await container.aplicarLimpiezaDeDatasetUseCase.previsualizar(req.analistaAutenticado!.id, req.params.sesionId, decisiones));
  } catch (error) {
    responderErrorDeAnalisisDeDatos(res, error);
  }
});

// Aplica la limpieza. No modifica el dataset de la sesión: genera una versión
// procesada nueva (RF-136/137) y devuelve una sesión de análisis sobre ella.
// "confirmado" tiene que ser exactamente el booleano true: cualquier otra cosa
// ("true", 1, ausente) se trata como no confirmado.
analisisDatasetLimpiezaRouter.post('/analisis-datos/:sesionId/limpieza', async (req, res) => {
  const decisiones = leerDecisiones(req.body);
  if (typeof decisiones === 'string') {
    res.status(400).json({ error: decisiones });
    return;
  }
  const confirmado = (req.body as { confirmado?: unknown }).confirmado === true;

  try {
    const resultado = await container.aplicarLimpiezaDeDatasetUseCase.ejecutar(
      req.analistaAutenticado!.id,
      req.params.sesionId,
      decisiones,
      confirmado
    );
    res.status(201).json(resultado);
  } catch (error) {
    responderErrorDeAnalisisDeDatos(res, error);
  }
});

// RF-123: la bitácora de un dataset, con todo lo hecho sobre cualquiera de
// sus versiones. :datasetId puede ser el id del original o el de una versión.
analisisDatasetLimpiezaRouter.get('/analisis-datos/:datasetId/bitacora', async (req, res) => {
  try {
    res.json(await container.consultarBitacoraDeDatasetUseCase.ejecutar(req.analistaAutenticado!.id, req.params.datasetId));
  } catch (error) {
    responderErrorDeAnalisisDeDatos(res, error);
  }
});
