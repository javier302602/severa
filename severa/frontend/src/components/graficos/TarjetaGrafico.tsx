import { useDescargarGrafico, useGrafico } from '../../hooks/useGraficos';
import type { FormatoDescargaGrafico, TipoGrafico } from '../../api/graficoService';
import { descargarArchivo } from '../../utils/descargarArchivo';
import { Spinner } from '../ui/Spinner';
import { MensajeError } from '../ui/MensajeError';
import { EstadoVacio } from '../ui/EstadoVacio';
import { esCatalogoVacio } from '../../utils/esCatalogoVacio';
import { mensajeDeError } from '../../utils/mensajeDeError';

interface TarjetaGraficoProps {
  tipo: TipoGrafico;
  titulo: string;
  limite?: number;
}

// Inserta el SVG que devuelve el backend tal cual (Sprint 07) — no se
// reimplementa la visualización en el cliente. dangerouslySetInnerHTML es
// aceptable acá porque el SVG lo genera nuestro propio backend
// (SvgGraficosAdapter), no contenido de un tercero ni de otro usuario.
//
// Mejora "interpretación en prosa en Gráficos": debajo del SVG se muestra
// el mismo texto de "análisis" que ya tenía cada gráfico en el PDF/Word
// (InterpretacionDeGraficos.ts, servicio compartido) — no se pide el
// informe completo solo para leerlo.
//
// RF-61: debajo, la descarga del gráfico suelto. PNG y PDF se piden al
// backend (300 dpi y vectorial); el SVG es el mismo que ya está en pantalla.
const ESTILO_BOTON_DESCARGA =
  'rounded border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700';

export function TarjetaGrafico({ tipo, titulo, limite }: TarjetaGraficoProps) {
  const { data, isLoading, isError, error } = useGrafico(tipo, limite);
  const descarga = useDescargarGrafico(tipo, limite);

  const onDescargar = (formato: FormatoDescargaGrafico) => {
    descarga.mutate(formato, { onSuccess: (blob) => descargarArchivo(blob, `${tipo}.${formato}`) });
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4">
      <h2 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{titulo}</h2>
      {isLoading && <Spinner etiqueta="Generando…" />}
      {isError && esCatalogoVacio(error) && <EstadoVacio mensaje="Sin datos todavía." />}
      {isError && !esCatalogoVacio(error) && <MensajeError mensaje={`Gráfico falló: ${mensajeDeError(error)}`} />}
      {data && (
        <>
          <div className="[&_svg]:mx-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: data.svg }} />
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{data.interpretacion}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label={`Descargar el gráfico "${titulo}"`}>
            <span className="text-xs text-slate-500 dark:text-slate-400">Descargar:</span>
            <button type="button" className={ESTILO_BOTON_DESCARGA} disabled={descarga.isPending} onClick={() => onDescargar('png')}>
              PNG
            </button>
            <button type="button" className={ESTILO_BOTON_DESCARGA} disabled={descarga.isPending} onClick={() => onDescargar('pdf')}>
              PDF
            </button>
            <button
              type="button"
              className={ESTILO_BOTON_DESCARGA}
              onClick={() => descargarArchivo(data.svg, `${tipo}.svg`, 'image/svg+xml')}
            >
              SVG
            </button>
            {descarga.isPending && <span className="text-xs text-slate-500 dark:text-slate-400">Generando…</span>}
          </div>
          {descarga.isError && <MensajeError mensaje={`No se pudo descargar: ${mensajeDeError(descarga.error)}`} />}
        </>
      )}
    </div>
  );
}
