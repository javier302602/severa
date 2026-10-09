import { useState } from 'react';
import { FORMATOS_DE_INFORME, type FormatoInforme, type OpcionesDescargaDeInforme } from '../../api/formatosDeInforme';

interface Props {
  // Prefijo para los id de los controles: la página de Informes y la de
  // Análisis de Datos pueden convivir en el mismo documento en un test.
  idBase: string;
  enCurso: boolean;
  etiquetaBoton?: string;
  onDescargar: (opciones: OpcionesDescargaDeInforme) => void;
}

// M-10 (RF-77/78/79/80/132/133): elegir formato y descargar el informe
// completo. Compartido por las dos pantallas que lo ofrecen, para que una no
// se quede con menos formatos que la otra.
export function DescargaDeInforme({ idBase, enCurso, etiquetaBoton = 'Descargar', onDescargar }: Props) {
  const [formato, setFormato] = useState<FormatoInforme>('pdf');
  const [adjuntarGraficos, setAdjuntarGraficos] = useState(false);

  // El paquete LaTeX ya trae cada figura como archivo aparte: la opción no
  // cambia nada, así que se muestra marcada e inhabilitada en vez de dejar
  // tildar algo que no tiene efecto.
  const esLatex = formato === 'latex';
  const conGraficos = esLatex || adjuntarGraficos;
  const idFormato = `${idBase}-formato`;
  const idGraficos = `${idBase}-graficos`;
  const idAyuda = `${idBase}-ayuda`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={idFormato} className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Formato
          </label>
          <select
            id={idFormato}
            value={formato}
            onChange={(evento) => setFormato(evento.target.value as FormatoInforme)}
            className="campo-formulario mt-1 py-1.5"
          >
            {FORMATOS_DE_INFORME.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={enCurso}
          onClick={() => onDescargar({ formato, adjuntarGraficos: esLatex ? false : adjuntarGraficos })}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300 disabled:opacity-50"
        >
          {enCurso ? 'Generando…' : etiquetaBoton}
        </button>
      </div>

      <div className="flex items-start gap-2">
        <input
          id={idGraficos}
          type="checkbox"
          checked={conGraficos}
          disabled={esLatex}
          onChange={(evento) => setAdjuntarGraficos(evento.target.checked)}
          aria-describedby={idAyuda}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600"
        />
        <div>
          <label htmlFor={idGraficos} className="text-sm text-slate-700 dark:text-slate-300">
            Incluir cada gráfico como archivo aparte (PNG y SVG)
          </label>
          <p id={idAyuda} className="text-xs text-slate-500 dark:text-slate-400">
            {esLatex
              ? 'El paquete LaTeX siempre trae sus figuras como archivos aparte. Se descarga un .zip.'
              : conGraficos
                ? 'Se descarga un .zip con el informe y una carpeta de gráficos.'
                : 'Para pegarlos en una presentación u otro documento.'}
          </p>
        </div>
      </div>
    </div>
  );
}
