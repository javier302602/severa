import { AnalistaRepository } from '../../ports/out/AnalistaRepository';

// Portada de los informes (GeneradorInformePDF.ts/GeneradorInformeWord.ts):
// "Generado por SEVERA para {nombre}". El id del analista siempre viene del
// token (nunca del body), pero resolverlo a un nombre real es un lookup
// aparte — compartido por GenerarInforme/GenerarResumenEjecutivo/
// GenerarInformeDataset para no repetir el mismo fallback tres veces. En la
// práctica buscarPorId nunca debería devolver null acá (el JWT solo se emite
// para un analista que existe), pero un id de un analista borrado entre el
// login y esta llamada no debe tumbar la generación del informe por un dato
// puramente cosmético de la portada.
const NOMBRE_POR_DEFECTO = 'Analista SEVERA';

export async function resolverNombreAnalistaParaInforme(
  analistaRepository: AnalistaRepository,
  analistaId: string
): Promise<string> {
  const analista = await analistaRepository.buscarPorId(analistaId);
  return analista?.nombre ?? NOMBRE_POR_DEFECTO;
}
