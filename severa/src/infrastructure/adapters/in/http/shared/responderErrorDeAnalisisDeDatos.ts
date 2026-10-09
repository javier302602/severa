import { Response } from 'express';
import { SesionAnalisisNoEncontradaError } from '../../../../../domain/errors/SesionAnalisisNoEncontradaError';
import { DatasetGenericoNoEncontradoError } from '../../../../../domain/errors/DatasetGenericoNoEncontradoError';
import {
  NombreDePlantillaRepetidoError,
  PlantillaDeAnalisisNoEncontradaError,
  PlantillaIncompatibleError,
  VistaPreviaDePlantillaDesactualizadaError
} from '../../../../../domain/errors/PlantillaDeAnalisisErrors';

// Traducción única de errores a respuestas HTTP para las rutas de
// /analisis-datos de M-14/M-15 Ronda 2 (variables, limpieza, versiones).
//
//   404: la sesión o el dataset no existen PARA ESTE ANALISTA. Un id ajeno
//        responde igual que uno inexistente (mismo criterio IDOR que el resto
//        de la familia: no se confirma que el recurso de otro exista).
//   409: el pedido choca con lo que ya hay: un nombre de plantilla repetido
//        (RF-12), o una vista previa de plantilla que ya no corresponde.
//   400: todo lo demás que lanza el dominio es un pedido que no se puede
//        cumplir (columna que no existe, método que no corresponde al tipo,
//        limpieza sin confirmar…) y su mensaje está escrito para el analista.
export function responderErrorDeAnalisisDeDatos(res: Response, error: unknown): void {
  if (
    error instanceof SesionAnalisisNoEncontradaError ||
    error instanceof DatasetGenericoNoEncontradoError ||
    error instanceof PlantillaDeAnalisisNoEncontradaError
  ) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof NombreDePlantillaRepetidoError || error instanceof VistaPreviaDePlantillaDesactualizadaError) {
    res.status(409).json({ error: error.message });
    return;
  }
  // RF-12: además del mensaje, la lista de qué falta, para mostrarla.
  if (error instanceof PlantillaIncompatibleError) {
    res.status(400).json({ error: error.message, columnasFaltantes: error.columnasFaltantes, problemas: error.problemas });
    return;
  }
  res.status(400).json({ error: error instanceof Error ? error.message : 'Error desconocido' });
}
