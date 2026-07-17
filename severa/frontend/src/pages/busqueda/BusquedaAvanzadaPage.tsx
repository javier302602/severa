import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import {
  useBuscarVulnerabilidades,
  useExportarBusqueda,
  useFiltrosFavoritos,
  useGuardarFiltroFavorito
} from '../../hooks/useBusqueda';
import type { CriteriosBusqueda } from '../../api/busquedaService';
import type { FiltroFavorito } from '../../api/filtroFavoritoService';
import type { EstadoRemediacion } from '../../types/EstadoRemediacion';
import { BadgeEstadoRemediacion } from '../../components/ui/BadgeEstadoRemediacion';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { descargarArchivo } from '../../utils/descargarArchivo';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { RUTAS } from '../../routes/paths';

// Mismas 8 columnas combinables de FiltroVulnerabilidad.ts (backend), con
// fechaDesde/fechaHasta agregadas — CatalogoPage (M-04) ya cubre un
// subconjunto de esto para la búsqueda rápida del catálogo; esta pantalla es
// la versión completa: agrega rango de fechas, exportar y filtros favoritos.
const esquemaFiltro = z
  .object({
    cve: z.string().trim(),
    cvssMin: z.string().trim(),
    cvssMax: z.string().trim(),
    severidad: z.string().trim(),
    componente: z.string().trim(),
    estadoRemediacion: z.string().trim(),
    fechaDesde: z.string().trim(),
    fechaHasta: z.string().trim()
  })
  .superRefine((datos, ctx) => {
    const algunoPresente = Object.values(datos).some((valor) => valor !== '');
    if (!algunoPresente) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Elegí al menos un criterio de búsqueda', path: ['cve'] });
    }
    // Regla replicada de IdentificadorCVE.ts (backend): /^CVE-\d{4}-\d{4,}$/.
    if (datos.cve !== '' && !/^CVE-\d{4}-\d{4,}$/i.test(datos.cve)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Formato inválido (ej. CVE-2024-0001)', path: ['cve'] });
    }
  });

type DatosFiltro = z.infer<typeof esquemaFiltro>;

const VALORES_POR_DEFECTO: DatosFiltro = {
  cve: '',
  cvssMin: '',
  cvssMax: '',
  severidad: '',
  componente: '',
  estadoRemediacion: '',
  fechaDesde: '',
  fechaHasta: ''
};

function aCriterios(datos: DatosFiltro): CriteriosBusqueda {
  return {
    cve: datos.cve || undefined,
    cvssMin: datos.cvssMin !== '' ? Number(datos.cvssMin) : undefined,
    cvssMax: datos.cvssMax !== '' ? Number(datos.cvssMax) : undefined,
    severidad: datos.severidad || undefined,
    componente: datos.componente || undefined,
    estadoRemediacion: (datos.estadoRemediacion || undefined) as EstadoRemediacion | undefined,
    fechaDesde: datos.fechaDesde || undefined,
    fechaHasta: datos.fechaHasta || undefined
  };
}

function aDatosFiltro(criterios: CriteriosBusqueda): DatosFiltro {
  return {
    cve: criterios.cve ?? '',
    cvssMin: criterios.cvssMin !== undefined ? String(criterios.cvssMin) : '',
    cvssMax: criterios.cvssMax !== undefined ? String(criterios.cvssMax) : '',
    severidad: criterios.severidad ?? '',
    componente: criterios.componente ?? '',
    estadoRemediacion: criterios.estadoRemediacion ?? '',
    fechaDesde: criterios.fechaDesde ?? '',
    fechaHasta: criterios.fechaHasta ?? ''
  };
}

function SeccionFavoritos({
  criteriosActivos,
  onUsarFavorito
}: {
  criteriosActivos: CriteriosBusqueda | null;
  onUsarFavorito: (favorito: FiltroFavorito) => void;
}) {
  const { data, isLoading, isError, error } = useFiltrosFavoritos();
  const [nombreNuevoFavorito, setNombreNuevoFavorito] = useState('');
  const guardar = useGuardarFiltroFavorito();

  const onGuardar = () => {
    if (!criteriosActivos || !nombreNuevoFavorito.trim()) return;
    guardar.mutate(
      { nombre: nombreNuevoFavorito.trim(), criterios: criteriosActivos },
      { onSuccess: () => setNombreNuevoFavorito('') }
    );
  };

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Filtros favoritos</h2>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="nombre-favorito" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Guardar la búsqueda actual como favorito
          </label>
          <input
            id="nombre-favorito"
            value={nombreNuevoFavorito}
            onChange={(evento) => setNombreNuevoFavorito(evento.target.value)}
            placeholder="Nombre del filtro"
            disabled={!criteriosActivos}
            className="campo-formulario mt-1 w-full py-1.5 disabled:opacity-50"
          />
        </div>
        <button
          type="button"
          disabled={!criteriosActivos || !nombreNuevoFavorito.trim() || guardar.isPending}
          onClick={onGuardar}
          className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      {!criteriosActivos && <p className="text-xs text-slate-500 dark:text-slate-400">Hacé una búsqueda primero para poder guardarla.</p>}
      {guardar.isError && <MensajeError mensaje={mensajeDeError(guardar.error)} />}

      {isLoading && <Spinner etiqueta="Cargando filtros favoritos…" />}
      {isError && <MensajeError mensaje={mensajeDeError(error)} />}
      {data && data.length === 0 && <EstadoVacio mensaje="Todavía no guardaste ningún filtro favorito." />}
      {data && data.length > 0 && (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {data.map((favorito) => (
            <li key={favorito.id} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-slate-800 dark:text-slate-200">{favorito.nombre}</span>
              <button
                type="button"
                onClick={() => onUsarFavorito(favorito)}
                className="shrink-0 rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Usar este filtro
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// M-11 (RF-84 a RF-90).
export function BusquedaAvanzadaPage() {
  const [criteriosActivos, setCriteriosActivos] = useState<CriteriosBusqueda | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<DatosFiltro>({ resolver: zodResolver(esquemaFiltro), defaultValues: VALORES_POR_DEFECTO });

  const { data, isLoading, isError, error } = useBuscarVulnerabilidades(criteriosActivos);
  const exportar = useExportarBusqueda();

  const onSubmit = (datos: DatosFiltro) => setCriteriosActivos(aCriterios(datos));

  const onUsarFavorito = (favorito: FiltroFavorito) => {
    reset(aDatosFiltro(favorito.criterios));
    setCriteriosActivos(favorito.criterios);
  };

  const onExportar = () => {
    if (!criteriosActivos) return;
    exportar.mutate(criteriosActivos, {
      onSuccess: (csv) => descargarArchivo(csv, 'busqueda-vulnerabilidades.csv', 'text/csv')
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Búsqueda avanzada</h1>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6 md:grid-cols-4"
      >
        <div className="col-span-2">
          <label htmlFor="cve" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            CVE
          </label>
          <input
            id="cve"
            placeholder="CVE-2024-0001"
            {...register('cve')}
            className="campo-formulario mt-1 w-full"
          />
        </div>

        <div>
          <label htmlFor="cvssMin" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            CVSS mín.
          </label>
          <input
            id="cvssMin"
            type="number"
            min={0}
            max={10}
            step={0.1}
            {...register('cvssMin')}
            className="campo-formulario mt-1 w-full"
          />
        </div>

        <div>
          <label htmlFor="cvssMax" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            CVSS máx.
          </label>
          <input
            id="cvssMax"
            type="number"
            min={0}
            max={10}
            step={0.1}
            {...register('cvssMax')}
            className="campo-formulario mt-1 w-full"
          />
        </div>

        <div>
          <label htmlFor="severidad" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Severidad
          </label>
          <select
            id="severidad"
            {...register('severidad')}
            className="campo-formulario mt-1 w-full"
          >
            <option value="">—</option>
            <option value="Baja">Baja</option>
            <option value="Media">Media</option>
            <option value="Alta">Alta</option>
            <option value="Crítica">Crítica</option>
          </select>
        </div>

        <div>
          <label htmlFor="estadoRemediacion" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Estado
          </label>
          <select
            id="estadoRemediacion"
            {...register('estadoRemediacion')}
            className="campo-formulario mt-1 w-full"
          >
            <option value="">—</option>
            <option value="Pendiente">Pendiente</option>
            <option value="EnProceso">En proceso</option>
            <option value="Remediada">Remediada</option>
          </select>
        </div>

        <div className="col-span-2">
          <label htmlFor="componente" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Software / componente (coincidencia exacta)
          </label>
          <input
            id="componente"
            placeholder="Apache Log4j, Microsoft Exchange…"
            {...register('componente')}
            className="campo-formulario mt-1 w-full"
          />
        </div>

        <div>
          <label htmlFor="fechaDesde" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Cargado desde
          </label>
          <input
            id="fechaDesde"
            type="date"
            {...register('fechaDesde')}
            className="campo-formulario mt-1 w-full"
          />
        </div>

        <div>
          <label htmlFor="fechaHasta" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Cargado hasta
          </label>
          <input
            id="fechaHasta"
            type="date"
            {...register('fechaHasta')}
            className="campo-formulario mt-1 w-full"
          />
        </div>
        <p className="col-span-full -mt-2 text-xs text-slate-500 dark:text-slate-400">
          "Cargado desde/hasta" filtra por cuándo se importó el registro a SEVERA, no por la fecha de publicación real del
          CVE en NVD (ese dato no está disponible en el dataset).
        </p>

        <div className="col-span-full flex flex-wrap items-center gap-3">
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300">
            Buscar
          </button>
          <button
            type="button"
            disabled={!criteriosActivos || exportar.isPending}
            onClick={onExportar}
            className="rounded-md border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            {exportar.isPending ? 'Exportando…' : 'Exportar resultados (CSV)'}
          </button>
          {errors.cve && <p className="text-sm text-red-600 dark:text-red-400">{errors.cve.message}</p>}
        </div>
      </form>

      {exportar.isError && <MensajeError mensaje={mensajeDeError(exportar.error)} />}

      {criteriosActivos === null && <EstadoVacio mensaje="Elegí al menos un filtro y presioná «Buscar» para ver resultados." />}
      {isLoading && <Spinner etiqueta="Buscando…" />}
      {isError && <MensajeError mensaje={mensajeDeError(error)} />}
      {data && data.length === 0 && <EstadoVacio mensaje="No se encontraron vulnerabilidades con esos criterios." />}

      {data && data.length > 0 && (
        <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-slate-600 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">CVE</th>
              <th className="px-4 py-2">Software</th>
              <th className="px-4 py-2">CVSS</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Fecha de carga</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr key={item.cve} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60">
                <td className="px-4 py-2">
                  <Link to={RUTAS.vulnerabilidadDetalle(item.cve)} className="font-medium text-slate-900 dark:text-slate-100 underline">
                    {item.cve}
                  </Link>
                </td>
                <td className="px-4 py-2">{item.software}</td>
                <td className="px-4 py-2">{item.cvssScore.toFixed(1)}</td>
                <td className="px-4 py-2">
                  <BadgeEstadoRemediacion estado={item.estadoRemediacion} />
                </td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{new Date(item.fechaCarga).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <SeccionFavoritos criteriosActivos={criteriosActivos} onUsarFavorito={onUsarFavorito} />
    </div>
  );
}
