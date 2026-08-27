import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useDescargarInformeCompleto, useDescargarResumenEjecutivo, useProgramarInforme } from '../../hooks/useInformes';
import { useConvertirUrlAExcel } from '../../hooks/useDataset';
import type { FormatoInforme, FrecuenciaInformePeriodico } from '../../api/informeService';
import { descargarArchivo } from '../../utils/descargarArchivo';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { esCatalogoVacio } from '../../utils/esCatalogoVacio';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { RUTAS } from '../../routes/paths';
import { TEXTO_AYUDA_LINK_DATASET } from '../../constants/textosImportacion';

const NOMBRE_ARCHIVO_POR_FORMATO: Record<FormatoInforme, string> = {
  pdf: 'informe-completo.pdf',
  docx: 'informe-completo.docx'
};

function ErrorDeGeneracion({ error }: { error: unknown }) {
  if (esCatalogoVacio(error)) {
    return (
      <EstadoVacio
        mensaje={
          <>
            Todavía no hay vulnerabilidades cargadas.{' '}
            <Link to={RUTAS.dataset} className="underline">
              Importá un dataset
            </Link>{' '}
            para generar este informe.
          </>
        }
      />
    );
  }
  return <MensajeError mensaje={mensajeDeError(error)} />;
}

// M-10 (RF-77 a RF-83). Los 3 endpoints exigen el catálogo con datos: tanto
// /informes/completo como /informes/resumen-ejecutivo pasan por
// recopilarDatosDeInforme (RecopilarDatosDeInforme.ts), que llama a
// calcularMedia sobre los mismos scores que EstadisticaDescriptiva — mismo
// 400 "La lista de CVSS Score no puede estar vacía" que ya distingue
// esCatalogoVacio en Estadísticas/Comparación, así que se reutiliza acá.
// POST /informes/programar NO pasa por ahí de forma síncrona (el informe se
// genera recién cuando dispara el cron), así que esa sección no necesita el
// mismo tratamiento.
export function InformesPage() {
  const [formato, setFormato] = useState<FormatoInforme>('pdf');
  const [frecuencia, setFrecuencia] = useState<FrecuenciaInformePeriodico>('semanal');
  const [urlAConvertir, setUrlAConvertir] = useState('');

  const descargaCompleto = useDescargarInformeCompleto();
  const descargaResumen = useDescargarResumenEjecutivo();
  const programar = useProgramarInforme();
  const convertirUrl = useConvertirUrlAExcel();

  const onDescargarCompleto = () => {
    descargaCompleto.mutate(formato, {
      onSuccess: (blob) => descargarArchivo(blob, NOMBRE_ARCHIVO_POR_FORMATO[formato])
    });
  };

  const onDescargarResumen = () => {
    descargaResumen.mutate(undefined, {
      onSuccess: (blob) => descargarArchivo(blob, 'resumen-ejecutivo.pdf')
    });
  };

  const onProgramar = (evento: FormEvent) => {
    evento.preventDefault();
    programar.mutate(frecuencia);
  };

  const onConvertirUrl = (evento: FormEvent) => {
    evento.preventDefault();
    if (!urlAConvertir.trim()) return;
    convertirUrl.mutate(urlAConvertir.trim(), {
      // Normalmente .xlsx (Blob) — si el archivo origen es demasiado grande
      // para convertir de forma segura, el backend sirve el CSV original
      // tal cual (texto plano, ver ConvertirUrlAExcel.ts): sigue siendo un
      // dataset completo y real, solo que no en formato .xlsx.
      onSuccess: (resultado) =>
        typeof resultado === 'string'
          ? descargarArchivo(resultado, 'dataset-convertido.csv', 'text/csv')
          : descargarArchivo(resultado, 'dataset-convertido.xlsx')
    });
  };

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Informes</h1>

      <section className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Informe completo</h2>
        <div className="flex items-end gap-3">
          <div>
            <label htmlFor="formato-informe" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Formato
            </label>
            <select
              id="formato-informe"
              value={formato}
              onChange={(evento) => setFormato(evento.target.value as FormatoInforme)}
              className="campo-formulario mt-1 py-1.5"
            >
              <option value="pdf">PDF</option>
              <option value="docx">Word (.docx)</option>
            </select>
          </div>
          <button
            type="button"
            disabled={descargaCompleto.isPending}
            onClick={onDescargarCompleto}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300 disabled:opacity-50"
          >
            {descargaCompleto.isPending ? 'Generando…' : 'Descargar'}
          </button>
        </div>
        {descargaCompleto.isPending && <Spinner etiqueta="Generando informe…" />}
        {descargaCompleto.isError && <ErrorDeGeneracion error={descargaCompleto.error} />}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Resumen ejecutivo</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">Siempre en PDF.</p>
        <button
          type="button"
          disabled={descargaResumen.isPending}
          onClick={onDescargarResumen}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300 disabled:opacity-50"
        >
          {descargaResumen.isPending ? 'Generando…' : 'Descargar resumen ejecutivo'}
        </button>
        {descargaResumen.isPending && <Spinner etiqueta="Generando resumen…" />}
        {descargaResumen.isError && <ErrorDeGeneracion error={descargaResumen.error} />}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Programar informe periódico</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Genera automáticamente un informe PDF a tu nombre, con la frecuencia elegida. Volver a programar reemplaza la
          programación anterior (no se acumulan tareas).
        </p>
        <form onSubmit={onProgramar} className="flex items-end gap-3">
          <div>
            <label htmlFor="frecuencia-informe" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Frecuencia
            </label>
            <select
              id="frecuencia-informe"
              value={frecuencia}
              onChange={(evento) => setFrecuencia(evento.target.value as FrecuenciaInformePeriodico)}
              className="campo-formulario mt-1 py-1.5"
            >
              <option value="semanal">Semanal</option>
              <option value="mensual">Mensual</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={programar.isPending}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300 disabled:opacity-50"
          >
            {programar.isPending ? 'Programando…' : 'Programar'}
          </button>
        </form>
        {programar.isError && <MensajeError mensaje={mensajeDeError(programar.error)} />}
        {programar.isSuccess && (
          <p className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300">
            {programar.data.mensaje}
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Convertir link a Excel</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Pegá el link de un dataset público y descargá su contenido convertido a .xlsx — sin importarlo al catálogo
          de SEVERA. Si el archivo supera las 100.000 filas, se descarga como .csv (el dataset completo igual, sin
          reconvertirlo) en vez de .xlsx.
        </p>
        <form onSubmit={onConvertirUrl} className="space-y-3">
          <div>
            <label htmlFor="url-convertir" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Link a convertir
            </label>
            <input
              id="url-convertir"
              type="url"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={urlAConvertir}
              onChange={(evento) => setUrlAConvertir(evento.target.value)}
              className="campo-formulario mt-1 w-full"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{TEXTO_AYUDA_LINK_DATASET}</p>
          </div>
          <button
            type="submit"
            disabled={!urlAConvertir.trim() || convertirUrl.isPending}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300 disabled:opacity-50"
          >
            {convertirUrl.isPending ? 'Convirtiendo…' : 'Convertir y descargar'}
          </button>
        </form>
        {convertirUrl.isPending && <Spinner etiqueta="Descargando y convirtiendo…" />}
        {convertirUrl.isError && <MensajeError mensaje={mensajeDeError(convertirUrl.error)} />}
        {convertirUrl.isSuccess && (
          <p className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300">
            Archivo convertido y descargado.
          </p>
        )}
      </section>
    </div>
  );
}
