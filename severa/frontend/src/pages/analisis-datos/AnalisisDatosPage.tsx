import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAbrirDataset, useAnalizarDataset, useDescargarInformeDataset } from '../../hooks/useAnalisisDatos';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { descargarArchivo } from '../../utils/descargarArchivo';
import { AvisoErrorSeccion } from './AvisoErrorSeccion';
import { EstadisticasDescriptivasSeccion } from './EstadisticasDescriptivasSeccion';
import { AnalisisUnivariadoSeccion } from './AnalisisUnivariadoSeccion';
import { CorrelacionSeccion } from './CorrelacionSeccion';
import { OutliersSeccion } from './OutliersSeccion';
import { VariablesDelDataset } from './VariablesDelDataset';
import { SerieDeTiempoSeccion } from './SerieDeTiempoSeccion';
import { VariableObjetivoSeccion } from './VariableObjetivoSeccion';
import { LimpiezaSeccion } from './LimpiezaSeccion';
import { VersionesSeccion } from './VersionesSeccion';
import { PlantillasSeccion } from './PlantillasSeccion';
import { MisDatasets } from './MisDatasets';
import { ContextoDeReapertura } from './contextoDeReapertura';
import type {
  DatasetAbierto,
  DiagnosticoDeCalidad,
  ResultadoDeAplicacionDePlantilla,
  ResultadoDeLimpiezaAplicada
} from '../../api/analisisDatosService';
import { nombreDeArchivoDeInforme, type OpcionesDescargaDeInforme } from '../../api/formatosDeInforme';
import { DescargaDeInforme } from '../../components/ui/DescargaDeInforme';
import { ComoSeLeyoElArchivo } from '../../components/ui/ComoSeLeyoElArchivo';
import type { LecturaDelArchivo } from '../../api/datasetService';
import { nombreDeVersion } from '../../constants/tiposDeVariable';
import { CLASE_AVISO_DE_EXITO, CLASE_TARJETA } from './estilos';
import { leerSolicitudDeReapertura, type PestanaDeAnalisis } from './reaperturaDesdeHistorial';

type Pestana = PestanaDeAnalisis;

// `requiereDataset`: pestañas que guardan o leen algo del dataset guardado
// (decisiones, versiones, bitácora). No se ofrecen si la sesión no tiene uno.
const PESTANAS: Array<{ clave: Pestana; etiqueta: string; requiereDataset?: boolean }> = [
  { clave: 'descriptivas', etiqueta: 'Estadísticas descriptivas' },
  { clave: 'univariado', etiqueta: 'Análisis univariado' },
  { clave: 'correlacion', etiqueta: 'Matriz de correlación' },
  { clave: 'outliers', etiqueta: 'Valores atípicos' },
  { clave: 'serie', etiqueta: 'Serie de tiempo' },
  { clave: 'objetivo', etiqueta: 'Variable objetivo', requiereDataset: true },
  { clave: 'limpieza', etiqueta: 'Valores faltantes', requiereDataset: true },
  { clave: 'versiones', etiqueta: 'Versiones y bitácora', requiereDataset: true },
  { clave: 'plantillas', etiqueta: 'Plantillas', requiereDataset: true }
];

function claseDePestana(activa: boolean): string {
  return `rounded-md px-3 py-1.5 text-sm ${activa ? 'bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-600'}`;
}

// Lo que la página necesita saber del dataset que tiene abierto. Lo arma a
// partir de tres respuestas distintas del backend (analizar un archivo,
// reabrir un dataset guardado, aplicar una limpieza).
interface DatasetEnPantalla {
  sesionId: string;
  // null solo si el backend no informó a qué dataset guardado pertenece la
  // sesión; en ese caso no se ofrece nada de lo que necesita guardarse.
  datasetId: string | null;
  nombreArchivo: string;
  version: number;
  versionBase: number | null;
  diagnostico: DiagnosticoDeCalidad;
  // Solo recién cargado un .csv/.tsv: cómo se leyó. Al reabrir un dataset
  // guardado ya no aplica (se lee de la base, no del archivo).
  lectura: LecturaDelArchivo | null;
}

function desdeDatasetAbierto(abierto: DatasetAbierto): DatasetEnPantalla {
  return {
    sesionId: abierto.sesionId,
    datasetId: abierto.datasetId,
    nombreArchivo: abierto.nombreArchivo,
    version: abierto.version,
    versionBase: abierto.versionBase,
    diagnostico: abierto.diagnostico,
    lectura: null
  };
}

function resumenDeLaLimpieza(resultado: ResultadoDeLimpiezaAplicada): string {
  const { resumen } = resultado;
  return (
    `Se generó la versión ${resultado.version} de «${resultado.nombreArchivo}»: ${resumen.filasEliminadas} fila(s) eliminada(s), ` +
    `${resumen.columnasEliminadas.length} variable(s) eliminada(s) y ${resumen.celdasImputadas} valor(es) imputado(s). ` +
    'Ahora estás trabajando sobre esa versión; el original sigue disponible en "Versiones y bitácora".'
  );
}

// Mejora 4 (Análisis de Datos General) — Fase 6. El dataset abierto vive acá,
// en el estado del componente — nunca en localStorage: la sesión del backend
// expira a los 30 minutos de inactividad (SesionAnalisisStoreEnMemoria.ts).
// Lo que sí persiste es el dataset guardado (M-12, RF-136): si la sesión
// expira o se recarga la página, se reabre desde "Mis datasets".
export function AnalisisDatosPage() {
  const [abierto, setAbierto] = useState<DatasetEnPantalla | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [pestanaActiva, setPestanaActiva] = useState<Pestana>('descriptivas');
  const [aviso, setAviso] = useState<string | null>(null);

  const mutacionAnalizar = useAnalizarDataset();
  const mutacionAbrir = useAbrirDataset();
  const mutacionInforme = useDescargarInformeDataset();

  const onReiniciar = () => {
    setAbierto(null);
    setArchivo(null);
    setAviso(null);
    setPestanaActiva('descriptivas');
    mutacionAnalizar.reset();
    mutacionAbrir.reset();
    mutacionInforme.reset();
  };

  const onSeleccionarArchivo = (evento: ChangeEvent<HTMLInputElement>) => {
    setArchivo(evento.target.files?.[0] ?? null);
  };

  const onSubmit = (evento: FormEvent) => {
    evento.preventDefault();
    if (!archivo) return;
    const nombreArchivo = archivo.name;
    mutacionAnalizar.mutate(archivo, {
      onSuccess: (resultado) => {
        setAviso(null);
        setPestanaActiva('descriptivas');
        setAbierto({
          sesionId: resultado.sesionId,
          datasetId: resultado.datasetId ?? null,
          nombreArchivo,
          // Un archivo recién cargado es siempre el original de su familia.
          version: 0,
          versionBase: null,
          diagnostico: { totalFilas: resultado.totalFilas, filasDuplicadas: resultado.filasDuplicadas, columnas: resultado.columnas },
          lectura: resultado.lectura ?? null
        });
      }
    });
  };

  const abrirDataset = (datasetId: string, pestana: Pestana = 'descriptivas') => {
    mutacionAbrir.mutate(datasetId, {
      onSuccess: (resultado) => {
        mutacionInforme.reset();
        setAbierto(desdeDatasetAbierto(resultado));
        setPestanaActiva(pestana);
        setAviso(`Abriste ${resultado.version === 0 ? 'el original' : `la versión ${resultado.version}`} de «${resultado.nombreArchivo}».`);
      }
    });
  };

  // RF-11: reabrir un análisis desde el historial. La solicitud llega como
  // estado de navegación; se atiende una sola vez y se borra del historial
  // del navegador, para que recargar o volver atrás no reabra otra vez.
  //
  // Se atiende en el turno siguiente (y se cancela si el efecto se limpia
  // antes): en desarrollo React monta, desmonta y vuelve a montar cada
  // componente, y una mutación disparada en la primera pasada queda huérfana
  // —termina, pero la pantalla ya no la escucha.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const solicitud = leerSolicitudDeReapertura(location.state);
    if (!solicitud) return;
    const turno = setTimeout(() => {
      navigate(location.pathname, { replace: true, state: null });
      abrirDataset(solicitud.datasetId, solicitud.pestana);
    }, 0);
    return () => clearTimeout(turno);
    // abrirDataset cambia en cada render; lo que dispara esto es la solicitud.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const onVersionGenerada = (resultado: ResultadoDeLimpiezaAplicada) => {
    mutacionInforme.reset();
    setAbierto(desdeDatasetAbierto(resultado));
    setPestanaActiva('versiones');
    setAviso(resumenDeLaLimpieza(resultado));
  };

  // RF-12: la plantilla cambió tipos (y tal vez variable objetivo y
  // criterio). La tabla de variables se actualiza con el diagnóstico que
  // devolvió el backend; los análisis de cada pestaña se vuelven a pedir solos
  // (useAplicarPlantilla invalida toda la sesión). El informe que se haya
  // generado antes ya no corresponde.
  const onPlantillaAplicada = (resultado: ResultadoDeAplicacionDePlantilla) => {
    mutacionInforme.reset();
    setAbierto((actual) => (actual ? { ...actual, diagnostico: resultado.diagnostico } : actual));
  };

  const onDescargarInforme = (opciones: OpcionesDescargaDeInforme) => {
    if (!abierto) return;
    mutacionInforme.mutate(
      { sesionId: abierto.sesionId, opciones },
      { onSuccess: (blob) => descargarArchivo(blob, nombreDeArchivoDeInforme('informe-analisis-datos', blob, opciones)) }
    );
  };

  const datasetId = abierto?.datasetId ?? null;
  const pestanas = PESTANAS.filter((pestana) => !pestana.requiereDataset || datasetId !== null);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Análisis de Datos</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Subí cualquier archivo .csv, .tsv, .json, .xlsx o .xls (máx. 100 MB) para analizarlo — a diferencia de "Dataset",
          este módulo no asume ningún esquema de vulnerabilidades: infiere el tipo de cada columna a partir de sus propios
          valores.
        </p>
      </div>

      {!abierto && (
        <>
          <form onSubmit={onSubmit} className={`space-y-4 p-6 ${CLASE_TARJETA}`}>
            <label className="block text-sm text-slate-700 dark:text-slate-300">
              <span className="mb-1 block font-medium">Archivo a analizar</span>
              <input
                type="file"
                accept=".csv,.tsv,.json,.xlsx,.xls"
                onChange={onSeleccionarArchivo}
                className="block w-full text-sm text-slate-600 dark:text-slate-300"
              />
            </label>
            <button
              type="submit"
              disabled={!archivo || mutacionAnalizar.isPending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300 disabled:opacity-50"
            >
              {mutacionAnalizar.isPending ? 'Analizando…' : 'Analizar archivo'}
            </button>
            {mutacionAnalizar.isPending && <Spinner etiqueta="Subiendo y analizando el archivo…" />}
            {mutacionAnalizar.isError && <MensajeError mensaje={mensajeDeError(mutacionAnalizar.error)} />}
          </form>

          <MisDatasets abriendo={mutacionAbrir.isPending} onAbrir={(id) => abrirDataset(id)} />
          {mutacionAbrir.isPending && <Spinner etiqueta="Abriendo el dataset…" />}
          {mutacionAbrir.isError && <MensajeError mensaje={mensajeDeError(mutacionAbrir.error)} />}
        </>
      )}

      {abierto && (
        <ContextoDeReapertura.Provider
          value={datasetId ? { reabrir: () => abrirDataset(datasetId, pestanaActiva), reabriendo: mutacionAbrir.isPending } : null}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-slate-100">{abierto.nombreArchivo}</span>
              {' — '}
              <span data-testid="version-abierta">{nombreDeVersion(abierto.version)}</span>
              {abierto.versionBase !== null && (
                <span className="text-slate-500 dark:text-slate-400">
                  {' '}
                  (generada desde {abierto.versionBase === 0 ? 'el original' : `la versión ${abierto.versionBase}`})
                </span>
              )}
            </p>
            <button type="button" onClick={onReiniciar} className={claseDePestana(false)}>
              Cerrar y elegir otro
            </button>
          </div>

          {abierto.lectura && <ComoSeLeyoElArchivo lectura={abierto.lectura} />}

          {aviso && (
            <p className={CLASE_AVISO_DE_EXITO} role="status">
              {aviso}
            </p>
          )}
          {mutacionAbrir.isPending && <Spinner etiqueta="Abriendo el dataset…" />}
          {mutacionAbrir.isError && <MensajeError mensaje={mensajeDeError(mutacionAbrir.error)} />}

          {/* key: al cambiar de sesión (otra versión) se descarta el estado
              interno de la tabla y de cada pestaña, que era de la anterior. */}
          <VariablesDelDataset
            key={`variables-${abierto.sesionId}`}
            sesionId={abierto.sesionId}
            diagnostico={abierto.diagnostico}
            puedeCorregir={datasetId !== null}
            onDiagnosticoActualizado={(diagnostico) => setAbierto((actual) => (actual ? { ...actual, diagnostico } : actual))}
          />

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Análisis disponibles">
            {pestanas.map((pestana) => (
              <button
                key={pestana.clave}
                type="button"
                role="tab"
                aria-selected={pestanaActiva === pestana.clave}
                onClick={() => setPestanaActiva(pestana.clave)}
                className={claseDePestana(pestanaActiva === pestana.clave)}
              >
                {pestana.etiqueta}
              </button>
            ))}
          </div>

          <div key={`pestana-${abierto.sesionId}`} className={`p-4 ${CLASE_TARJETA}`} role="tabpanel">
            {pestanaActiva === 'descriptivas' && <EstadisticasDescriptivasSeccion sesionId={abierto.sesionId} onReiniciar={onReiniciar} />}
            {pestanaActiva === 'univariado' && (
              <AnalisisUnivariadoSeccion sesionId={abierto.sesionId} columnas={abierto.diagnostico.columnas} onReiniciar={onReiniciar} />
            )}
            {pestanaActiva === 'correlacion' && <CorrelacionSeccion sesionId={abierto.sesionId} onReiniciar={onReiniciar} />}
            {pestanaActiva === 'outliers' && <OutliersSeccion sesionId={abierto.sesionId} onReiniciar={onReiniciar} />}
            {pestanaActiva === 'serie' && <SerieDeTiempoSeccion sesionId={abierto.sesionId} onReiniciar={onReiniciar} />}
            {pestanaActiva === 'objetivo' && datasetId && <VariableObjetivoSeccion sesionId={abierto.sesionId} onReiniciar={onReiniciar} />}
            {pestanaActiva === 'limpieza' && datasetId && (
              <LimpiezaSeccion sesionId={abierto.sesionId} onReiniciar={onReiniciar} onVersionGenerada={onVersionGenerada} />
            )}
            {pestanaActiva === 'versiones' && datasetId && (
              <VersionesSeccion
                datasetId={datasetId}
                nombreArchivo={abierto.nombreArchivo}
                abriendo={mutacionAbrir.isPending}
                onAbrir={(id) => abrirDataset(id, 'versiones')}
              />
            )}
            {pestanaActiva === 'plantillas' && datasetId && (
              <PlantillasSeccion sesionId={abierto.sesionId} onReiniciar={onReiniciar} onPlantillaAplicada={onPlantillaAplicada} />
            )}
          </div>

          <section className={`space-y-3 p-6 ${CLASE_TARJETA}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Informe completo</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              El informe se calcula sobre lo que tenés abierto ({nombreDeVersion(abierto.version).toLowerCase()}) y lo dice en su
              sección "Limpieza realizada", con las operaciones que se le aplicaron.
            </p>
            <DescargaDeInforme
              idBase="informe-dataset"
              enCurso={mutacionInforme.isPending}
              etiquetaBoton="Descargar informe"
              onDescargar={onDescargarInforme}
            />
            {mutacionInforme.isPending && <Spinner etiqueta="Generando informe…" />}
            {mutacionInforme.isError && <AvisoErrorSeccion error={mutacionInforme.error} onReiniciar={onReiniciar} />}
          </section>
        </ContextoDeReapertura.Provider>
      )}
    </div>
  );
}
