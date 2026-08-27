import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useAnalizarDataset, useDescargarInformeDataset } from '../../hooks/useAnalisisDatos';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { descargarArchivo } from '../../utils/descargarArchivo';
import { AvisoErrorSeccion } from './AvisoErrorSeccion';
import { EstadisticasDescriptivasSeccion } from './EstadisticasDescriptivasSeccion';
import { AnalisisUnivariadoSeccion } from './AnalisisUnivariadoSeccion';
import { CorrelacionSeccion } from './CorrelacionSeccion';
import { OutliersSeccion } from './OutliersSeccion';
import type { DiagnosticoDataset, FormatoInformeDataset } from '../../api/analisisDatosService';

type Pestana = 'descriptivas' | 'univariado' | 'correlacion' | 'outliers';

const PESTANAS: Array<{ clave: Pestana; etiqueta: string }> = [
  { clave: 'descriptivas', etiqueta: 'Estadísticas descriptivas' },
  { clave: 'univariado', etiqueta: 'Análisis univariado' },
  { clave: 'correlacion', etiqueta: 'Matriz de correlación' },
  { clave: 'outliers', etiqueta: 'Valores atípicos' }
];

function claseDePestana(activa: boolean): string {
  return `rounded-md px-3 py-1.5 text-sm ${activa ? 'bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-600'}`;
}

function DiagnosticoInicial({ diagnostico }: { diagnostico: DiagnosticoDataset }) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4">
      <p className="text-sm text-slate-700 dark:text-slate-300">
        {diagnostico.totalFilas} fila(s) — {diagnostico.columnas.length} columna(s) —{' '}
        {diagnostico.filasDuplicadas === 0 ? 'sin filas duplicadas' : `${diagnostico.filasDuplicadas} fila(s) duplicada(s)`}.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-3 py-1">Columna</th>
              <th className="px-3 py-1">Tipo detectado</th>
              <th className="px-3 py-1">Faltantes</th>
              <th className="px-3 py-1">% faltante</th>
              <th className="px-3 py-1">Únicos</th>
              <th className="px-3 py-1">Inconsistentes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {diagnostico.columnas.map((columna) => (
              <tr key={columna.nombre}>
                <td className="px-3 py-1 font-medium text-slate-900 dark:text-slate-100">{columna.nombre}</td>
                <td className="px-3 py-1 text-slate-600 dark:text-slate-400">{columna.tipo}</td>
                <td className="px-3 py-1 text-slate-600 dark:text-slate-400">{columna.valoresFaltantes}</td>
                <td className="px-3 py-1 text-slate-600 dark:text-slate-400">{columna.porcentajeFaltante.toFixed(1)}%</td>
                <td className="px-3 py-1 text-slate-600 dark:text-slate-400">{columna.valoresUnicos}</td>
                <td className="px-3 py-1 text-slate-600 dark:text-slate-400">{columna.valoresInconsistentes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const NOMBRE_ARCHIVO_INFORME: Record<FormatoInformeDataset, string> = {
  pdf: 'informe-analisis-datos.pdf',
  docx: 'informe-analisis-datos.docx'
};

// Mejora 4 (Análisis de Datos General) — Fase 6. sesionId y diagnostico
// viven acá, en el estado del componente — nunca en localStorage: el store
// del backend expira a los 30 minutos de inactividad
// (SesionAnalisisStoreEnMemoria.ts), así que persistirlo más allá de esta
// sesión de navegación no tendría sentido (el usuario recargando la página
// después de 30 min igual se encontraría con un sesionId muerto).
export function AnalisisDatosPage() {
  const [diagnostico, setDiagnostico] = useState<DiagnosticoDataset | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [pestanaActiva, setPestanaActiva] = useState<Pestana>('descriptivas');
  const [formatoInforme, setFormatoInforme] = useState<FormatoInformeDataset>('pdf');

  const mutacionAnalizar = useAnalizarDataset();
  const mutacionInforme = useDescargarInformeDataset();

  const sesionId = diagnostico?.sesionId ?? null;

  const onReiniciar = () => {
    setDiagnostico(null);
    setArchivo(null);
    setPestanaActiva('descriptivas');
    mutacionAnalizar.reset();
    mutacionInforme.reset();
  };

  const onSeleccionarArchivo = (evento: ChangeEvent<HTMLInputElement>) => {
    setArchivo(evento.target.files?.[0] ?? null);
  };

  const onSubmit = (evento: FormEvent) => {
    evento.preventDefault();
    if (!archivo) return;
    mutacionAnalizar.mutate(archivo, {
      onSuccess: (resultado) => setDiagnostico(resultado)
    });
  };

  const onDescargarInforme = () => {
    if (!sesionId) return;
    mutacionInforme.mutate(
      { sesionId, formato: formatoInforme },
      { onSuccess: (blob) => descargarArchivo(blob, NOMBRE_ARCHIVO_INFORME[formatoInforme]) }
    );
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Análisis de Datos</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Subí cualquier archivo .csv, .xlsx o .xls (máx. 100 MB) para analizarlo — a diferencia de "Dataset", este
          módulo no asume ningún esquema de vulnerabilidades: infiere el tipo de cada columna a partir de sus
          propios valores.
        </p>
      </div>

      {!sesionId && (
        <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={onSeleccionarArchivo}
            className="block w-full text-sm text-slate-600 dark:text-slate-300"
          />
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
      )}

      {sesionId && diagnostico && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-400">Archivo analizado.</p>
            <button type="button" onClick={onReiniciar} className={claseDePestana(false)}>
              Subir otro archivo
            </button>
          </div>

          <DiagnosticoInicial diagnostico={diagnostico} />

          <div className="flex flex-wrap gap-2">
            {PESTANAS.map((pestana) => (
              <button
                key={pestana.clave}
                type="button"
                onClick={() => setPestanaActiva(pestana.clave)}
                className={claseDePestana(pestanaActiva === pestana.clave)}
              >
                {pestana.etiqueta}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4">
            {pestanaActiva === 'descriptivas' && <EstadisticasDescriptivasSeccion sesionId={sesionId} onReiniciar={onReiniciar} />}
            {pestanaActiva === 'univariado' && (
              <AnalisisUnivariadoSeccion sesionId={sesionId} columnas={diagnostico.columnas} onReiniciar={onReiniciar} />
            )}
            {pestanaActiva === 'correlacion' && <CorrelacionSeccion sesionId={sesionId} onReiniciar={onReiniciar} />}
            {pestanaActiva === 'outliers' && <OutliersSeccion sesionId={sesionId} onReiniciar={onReiniciar} />}
          </div>

          <section className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Informe completo</h2>
            <div className="flex items-end gap-3">
              <div>
                <label htmlFor="formato-informe-dataset" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Formato
                </label>
                <select
                  id="formato-informe-dataset"
                  value={formatoInforme}
                  onChange={(evento) => setFormatoInforme(evento.target.value as FormatoInformeDataset)}
                  className="campo-formulario mt-1 py-1.5"
                >
                  <option value="pdf">PDF</option>
                  <option value="docx">Word (.docx)</option>
                </select>
              </div>
              <button
                type="button"
                disabled={mutacionInforme.isPending}
                onClick={onDescargarInforme}
                className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300 disabled:opacity-50"
              >
                {mutacionInforme.isPending ? 'Generando…' : 'Descargar informe'}
              </button>
            </div>
            {mutacionInforme.isPending && <Spinner etiqueta="Generando informe…" />}
            {mutacionInforme.isError && <AvisoErrorSeccion error={mutacionInforme.error} onReiniciar={onReiniciar} />}
          </section>
        </>
      )}
    </div>
  );
}
