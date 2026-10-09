import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { analisisDatosService, type DecisionDeTratamiento, type TipoColumnaDetallado } from '../api/analisisDatosService';
import type { OpcionesDescargaDeInforme } from '../api/formatosDeInforme';

// Mejora 4 (Análisis de Datos General) — Fase 6. sesionId vive en el estado
// del componente (AnalisisDatosPage), no en localStorage ni en la query key
// de forma persistida entre sesiones de navegador: expira a los 30 minutos
// del lado del backend (SesionAnalisisStoreEnMemoria.ts) y no tiene sentido
// sobrevivir a un refresh de la página.
// Lo guardado (datasets, versiones, bitácora) no cuelga de una sesión: vive
// bajo otra clave, para que cerrar o reemplazar la sesión no lo descarte.
const CLAVE_DATASETS = ['analisis-datos-guardados', 'datasets'] as const;
const CLAVE_VERSIONES = ['analisis-datos-guardados', 'versiones'] as const;
const CLAVE_BITACORAS = ['analisis-datos-guardados', 'bitacora'] as const;

export function useAnalizarDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archivo: File) => analisisDatosService.analizar(archivo),
    // El archivo recién analizado queda guardado: aparece en "Mis datasets".
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLAVE_DATASETS });
    }
  });
}

export function useEstadisticasDescriptivas(sesionId: string | null) {
  return useQuery({
    queryKey: ['analisis-datos', sesionId, 'estadisticas-descriptivas'],
    queryFn: () => analisisDatosService.obtenerEstadisticasDescriptivas(sesionId!),
    enabled: sesionId !== null
  });
}

export function useAnalisisUnivariado(sesionId: string | null, columna: string | null) {
  return useQuery({
    queryKey: ['analisis-datos', sesionId, 'univariado', columna],
    queryFn: () => analisisDatosService.obtenerAnalisisUnivariado(sesionId!, columna!),
    enabled: sesionId !== null && columna !== null
  });
}

export function useMatrizCorrelacion(sesionId: string | null) {
  return useQuery({
    queryKey: ['analisis-datos', sesionId, 'correlacion'],
    queryFn: () => analisisDatosService.obtenerMatrizCorrelacion(sesionId!),
    enabled: sesionId !== null
  });
}

export function useOutliersDataset(sesionId: string | null) {
  return useQuery({
    queryKey: ['analisis-datos', sesionId, 'outliers'],
    queryFn: () => analisisDatosService.obtenerOutliers(sesionId!),
    enabled: sesionId !== null
  });
}

export function useDescargarInformeDataset() {
  return useMutation({
    mutationFn: ({ sesionId, opciones }: { sesionId: string; opciones: OpcionesDescargaDeInforme }) =>
      analisisDatosService.descargarInforme(sesionId, opciones)
  });
}

// --- M-14 Ronda 2 -------------------------------------------------------------

export function useSerieDeTiempo(sesionId: string | null) {
  return useQuery({
    queryKey: ['analisis-datos', sesionId, 'serie-de-tiempo'],
    queryFn: () => analisisDatosService.evaluarSerieDeTiempo(sesionId!),
    enabled: sesionId !== null
  });
}

export function useVariableObjetivo(sesionId: string | null) {
  return useQuery({
    queryKey: ['analisis-datos', sesionId, 'variable-objetivo'],
    queryFn: () => analisisDatosService.obtenerVariableObjetivo(sesionId!),
    enabled: sesionId !== null
  });
}

export function useDefinirVariableObjetivo(sesionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (columna: string | null) => analisisDatosService.definirVariableObjetivo(sesionId, columna),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['analisis-datos', sesionId, 'variable-objetivo'] });
      void queryClient.invalidateQueries({ queryKey: CLAVE_BITACORAS });
    }
  });
}

// RF-111: "el sistema recalcula los análisis dependientes". Todos los análisis
// de la sesión cuelgan de la clave ['analisis-datos', sesionId]: al cambiar un
// tipo se invalidan todos de una vez y cada pestaña vuelve a pedir el suyo.
export function useCorregirTipoDeVariable(sesionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ columna, tipo }: { columna: string; tipo: TipoColumnaDetallado | null }) =>
      analisisDatosService.corregirTipoDeVariable(sesionId, columna, tipo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['analisis-datos', sesionId] });
      void queryClient.invalidateQueries({ queryKey: CLAVE_BITACORAS });
    }
  });
}

// --- M-15 Ronda 2 -------------------------------------------------------------

export function usePropuestaDeLimpieza(sesionId: string | null) {
  return useQuery({
    queryKey: ['analisis-datos', sesionId, 'limpieza-propuesta'],
    queryFn: () => analisisDatosService.obtenerPropuestaDeLimpieza(sesionId!),
    enabled: sesionId !== null
  });
}

export function usePrevisualizarLimpieza(sesionId: string) {
  return useMutation({
    mutationFn: (decisiones: DecisionDeTratamiento[]) => analisisDatosService.previsualizarLimpieza(sesionId, decisiones)
  });
}

export function useAplicarLimpieza(sesionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decisiones: DecisionDeTratamiento[]) => analisisDatosService.aplicarLimpieza(sesionId, decisiones),
    onSuccess: () => {
      // Hay una versión nueva, entradas nuevas en la bitácora y una
      // notificación de resumen (RF-122) esperando en la campanita.
      void queryClient.invalidateQueries({ queryKey: CLAVE_DATASETS });
      void queryClient.invalidateQueries({ queryKey: CLAVE_VERSIONES });
      void queryClient.invalidateQueries({ queryKey: CLAVE_BITACORAS });
      void queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
    }
  });
}

// --- M-12: versiones y bitácora -----------------------------------------------

export function useDatasetsGuardados() {
  return useQuery({ queryKey: CLAVE_DATASETS, queryFn: analisisDatosService.listarDatasets });
}

export function useVersionesDeDataset(datasetId: string | null) {
  return useQuery({
    queryKey: [...CLAVE_VERSIONES, datasetId],
    queryFn: () => analisisDatosService.listarVersiones(datasetId!),
    enabled: datasetId !== null
  });
}

export function useBitacoraDeDataset(datasetId: string | null) {
  return useQuery({
    queryKey: [...CLAVE_BITACORAS, datasetId],
    queryFn: () => analisisDatosService.obtenerBitacora(datasetId!),
    enabled: datasetId !== null
  });
}

export function useAbrirDataset() {
  return useMutation({ mutationFn: (datasetId: string) => analisisDatosService.abrirDataset(datasetId) });
}

export function useExportarDataset() {
  return useMutation({ mutationFn: (datasetId: string) => analisisDatosService.exportarDataset(datasetId) });
}

// --- RF-12: plantillas de análisis --------------------------------------------

// Las plantillas son del analista, no de un dataset ni de una sesión.
const CLAVE_PLANTILLAS = ['plantillas-analisis'] as const;

export function usePlantillas() {
  return useQuery({ queryKey: CLAVE_PLANTILLAS, queryFn: analisisDatosService.listarPlantillas });
}

export function useGuardarPlantilla(sesionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nombre: string) => analisisDatosService.guardarPlantilla(sesionId, nombre),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLAVE_PLANTILLAS });
    }
  });
}

export function useEliminarPlantilla() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (plantillaId: string) => analisisDatosService.eliminarPlantilla(plantillaId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLAVE_PLANTILLAS });
    }
  });
}

// Cuelga de la sesión: corregir un tipo o aplicar la plantilla la invalida, y
// la vista previa se vuelve a pedir mostrando solo lo que todavía falta.
export function useVistaPreviaDePlantilla(sesionId: string, plantillaId: string | null) {
  return useQuery({
    queryKey: ['analisis-datos', sesionId, 'plantilla-vista-previa', plantillaId],
    queryFn: () => analisisDatosService.previsualizarPlantilla(sesionId, plantillaId!),
    enabled: plantillaId !== null
  });
}

// Aplicar cambia tipos, variable objetivo y criterio: se recalculan todos los
// análisis de la sesión (igual que al corregir un tipo a mano, RF-111) y la
// bitácora tiene entradas nuevas. Si falla (por ejemplo, la vista previa ya
// no era la vigente), también se invalida la sesión: la vista previa se
// vuelve a pedir y muestra lo que de verdad falta.
export function useAplicarPlantilla(sesionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ plantillaId, huella }: { plantillaId: string; huella: string }) =>
      analisisDatosService.aplicarPlantilla(sesionId, plantillaId, huella),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['analisis-datos', sesionId] });
      void queryClient.invalidateQueries({ queryKey: CLAVE_BITACORAS });
    }
  });
}
