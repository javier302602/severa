import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useDetectarColumnas, useImportarDataset, useImportarDatasetDesdeUrl } from '../../hooks/useDataset';
import { MensajeError } from '../../components/ui/MensajeError';
import { Spinner } from '../../components/ui/Spinner';
import { mensajeDeError } from '../../utils/mensajeDeError';
import type { MapeoColumnas, ResumenImportacion } from '../../api/datasetService';

type Modo = 'archivo' | 'link';
type CampoMapeable = keyof MapeoColumnas;

interface DefinicionCampo {
  campo: CampoMapeable;
  etiqueta: string;
  obligatorio: boolean;
  // Mismos nombres que LectorExcelDataset.ts (backend) acepta por defecto —
  // se usan acá SOLO para pre-seleccionar la columna más probable en el
  // selector, nunca se decide nada de importación del lado del cliente.
  aliasParaDeteccion: string[];
}

const CAMPOS_MAPEABLES: DefinicionCampo[] = [
  { campo: 'cve', etiqueta: 'CVE', obligatorio: true, aliasParaDeteccion: ['CVE'] },
  { campo: 'cvssScore', etiqueta: 'CVSS Score', obligatorio: true, aliasParaDeteccion: ['CVSS Score'] },
  { campo: 'accesoRemoto', etiqueta: 'Acceso Remoto', obligatorio: true, aliasParaDeteccion: ['Acceso Remoto'] },
  { campo: 'software', etiqueta: 'Software', obligatorio: false, aliasParaDeteccion: ['Software', 'software'] },
  {
    campo: 'tipoVulnerabilidad',
    etiqueta: 'Tipo de Vulnerabilidad',
    obligatorio: false,
    aliasParaDeteccion: ['Tipo Vulnerabilidad', 'Tipo de Vulnerabilidad', 'tipo_vulnerabilidad']
  },
  {
    campo: 'diasParaParche',
    etiqueta: 'Días para Parche',
    obligatorio: false,
    aliasParaDeteccion: ['Dias para Parche', 'Días para Parche', 'dias_para_parche']
  }
];

function sugerirMapeoInicial(columnasDetectadas: string[]): MapeoColumnas {
  const mapeo: MapeoColumnas = {};
  for (const { campo, aliasParaDeteccion } of CAMPOS_MAPEABLES) {
    const coincidencia = aliasParaDeteccion.find((alias) => columnasDetectadas.includes(alias));
    if (coincidencia) {
      mapeo[campo] = coincidencia;
    }
  }
  return mapeo;
}

function claseDePestana(activa: boolean): string {
  return `rounded-md px-3 py-1.5 text-sm ${activa ? 'bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-600'}`;
}

function ResumenDeImportacion({ resumen }: { resumen: ResumenImportacion }) {
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900/50 dark:bg-green-950/30">
      <p className="font-medium text-green-800 dark:text-green-300">
        Importación completa: {resumen.importados} importados, {resumen.rechazados} rechazados.
      </p>
      {resumen.errores.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-green-900 dark:text-green-400">
          {resumen.errores.map((error, indice) => (
            <li key={indice}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Mejora "mapeo flexible de columnas": una vez detectadas las columnas
// reales del archivo (useDetectarColumnas), el usuario puede indicar cuál
// corresponde a cada campo de SEVERA en vez de tener que renombrar sus
// columnas para que coincidan con el dataset de referencia del SDS. Los 3
// campos obligatorios (CVE/CVSS Score/Acceso Remoto) están marcados: si
// ninguno de los alias conocidos aparece entre las columnas detectadas, el
// selector queda en "(elegir columna)" y se avisa — el backend igual
// rechazaría la importación sin esa columna, pero avisar acá evita el viaje
// redondo.
function SelectorDeMapeo({
  columnasDetectadas,
  mapeo,
  onCambiarMapeo
}: {
  columnasDetectadas: string[];
  mapeo: MapeoColumnas;
  onCambiarMapeo: (campo: CampoMapeable, columna: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
        Indicá qué columna de tu archivo corresponde a cada campo:
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CAMPOS_MAPEABLES.map(({ campo, etiqueta, obligatorio }) => {
          const valorActual = mapeo[campo] ?? '';
          const sinDeteccion = obligatorio && valorActual === '';

          return (
            <div key={campo}>
              <label htmlFor={`mapeo-${campo}`} className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                {etiqueta}
                {obligatorio && <span className="text-red-600 dark:text-red-400"> *</span>}
              </label>
              <select
                id={`mapeo-${campo}`}
                value={valorActual}
                onChange={(evento) => onCambiarMapeo(campo, evento.target.value)}
                className="campo-formulario mt-1 w-full py-1.5"
              >
                <option value="">{obligatorio ? '(elegir columna)' : '(usar valor por defecto)'}</option>
                {columnasDetectadas.map((columna) => (
                  <option key={columna} value={columna}>
                    {columna}
                  </option>
                ))}
              </select>
              {sinDeteccion && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  No se detectó automáticamente — es obligatorio, elegí la columna.
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-500">
        * Obligatorio. Los demás campos, si no se mapean, se buscan con los nombres habituales del dataset de SEVERA.
      </p>
    </div>
  );
}

// M-03 (RF-17). No maneja 401 acá: el interceptor global de httpClient
// (ver AuthContext.tsx) fuerza logout + redirect a /login para cualquier
// respuesta 401 de cualquier pantalla, sin necesidad de repetir esa lógica
// en cada una.
//
// Sprint 17: segundo modo "Importar desde link" — toda la validación de
// seguridad (allowlist de dominios, IP privada/loopback, tamaño,
// redirecciones) vive en el backend (DetectorDeTipoDeLink/
// DescargadorDeArchivosHttp); acá solo se manda el string y se muestra el
// error tal cual lo devuelva, sin intentar adivinar de antemano si un
// dominio va a ser aceptado.
export function ImportarDatasetPage() {
  const [modo, setModo] = useState<Modo>('archivo');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [mapeo, setMapeo] = useState<MapeoColumnas>({});
  const [url, setUrl] = useState('');

  const deteccionColumnas = useDetectarColumnas();
  const mutacionArchivo = useImportarDataset();
  const mutacionUrl = useImportarDatasetDesdeUrl();

  const onSeleccionarArchivo = (evento: ChangeEvent<HTMLInputElement>) => {
    const nuevoArchivo = evento.target.files?.[0] ?? null;
    setArchivo(nuevoArchivo);
    setMapeo({});
    mutacionArchivo.reset();

    if (nuevoArchivo) {
      deteccionColumnas.mutate(nuevoArchivo, {
        onSuccess: (columnas) => setMapeo(sugerirMapeoInicial(columnas))
      });
    } else {
      deteccionColumnas.reset();
    }
  };

  const onCambiarMapeo = (campo: CampoMapeable, columna: string) => {
    setMapeo((actual) => ({ ...actual, [campo]: columna || undefined }));
  };

  const onSubmitArchivo = (evento: FormEvent) => {
    evento.preventDefault();
    if (!archivo) return;
    mutacionArchivo.mutate({ archivo, mapeoColumnas: mapeo });
  };

  const onSubmitUrl = (evento: FormEvent) => {
    evento.preventDefault();
    if (!url.trim()) return;
    mutacionUrl.mutate(url.trim());
  };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Importar dataset</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Subí un archivo .xlsx/.xls, o pegá un link de la API de NVD, Google Sheets o Dropbox (máx. 5 MB).
        </p>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setModo('archivo')} className={claseDePestana(modo === 'archivo')}>
          Subir archivo
        </button>
        <button type="button" onClick={() => setModo('link')} className={claseDePestana(modo === 'link')}>
          Importar desde link
        </button>
      </div>

      {modo === 'archivo' && (
        <>
          <form onSubmit={onSubmitArchivo} className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={onSeleccionarArchivo}
              className="block w-full text-sm text-slate-600 dark:text-slate-300"
            />

            {deteccionColumnas.isPending && <Spinner etiqueta="Leyendo columnas del archivo…" />}
            {deteccionColumnas.isError && <MensajeError mensaje={mensajeDeError(deteccionColumnas.error)} />}
            {deteccionColumnas.isSuccess && (
              <SelectorDeMapeo columnasDetectadas={deteccionColumnas.data} mapeo={mapeo} onCambiarMapeo={onCambiarMapeo} />
            )}

            <button
              type="submit"
              disabled={!archivo || mutacionArchivo.isPending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300 disabled:opacity-50"
            >
              {mutacionArchivo.isPending ? 'Importando…' : 'Importar'}
            </button>
          </form>

          {mutacionArchivo.isPending && <Spinner etiqueta="Subiendo y validando el archivo…" />}
          {mutacionArchivo.isError && <MensajeError mensaje={mensajeDeError(mutacionArchivo.error)} />}
          {mutacionArchivo.isSuccess && <ResumenDeImportacion resumen={mutacionArchivo.data} />}
        </>
      )}

      {modo === 'link' && (
        <>
          <form onSubmit={onSubmitUrl} className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
            <div>
              <label htmlFor="url-dataset" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Link del dataset
              </label>
              <input
                id="url-dataset"
                type="url"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={url}
                onChange={(evento) => setUrl(evento.target.value)}
                className="campo-formulario mt-1 w-full"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Solo se aceptan links de nvd.nist.gov, Google Sheets (docs.google.com) o Dropbox — cualquier otro
                dominio lo rechaza el backend.
              </p>
            </div>
            <button
              type="submit"
              disabled={!url.trim() || mutacionUrl.isPending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300 disabled:opacity-50"
            >
              {mutacionUrl.isPending ? 'Importando…' : 'Importar desde link'}
            </button>
          </form>

          {mutacionUrl.isPending && <Spinner etiqueta="Descargando y validando el archivo…" />}
          {mutacionUrl.isError && <MensajeError mensaje={mensajeDeError(mutacionUrl.error)} />}
          {mutacionUrl.isSuccess && <ResumenDeImportacion resumen={mutacionUrl.data} />}
        </>
      )}
    </div>
  );
}
