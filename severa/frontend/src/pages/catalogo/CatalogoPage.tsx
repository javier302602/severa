import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { useBuscarVulnerabilidades } from '../../hooks/useBusqueda';
import type { CriteriosBusqueda } from '../../api/busquedaService';
import type { EstadoRemediacion } from '../../types/EstadoRemediacion';
import { BadgeEstadoRemediacion } from '../../components/ui/BadgeEstadoRemediacion';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { RUTAS } from '../../routes/paths';

// M-04 (RF-84 a RF-90). El backend no tiene ningún endpoint de "listar todo"
// ni paginación (GET /vulnerabilidades sin filtros devuelve [], y
// GET /vulnerabilidades/buscar sin criterios lanza FiltroVacioError) — hueco
// reportado y decidido con el usuario: el catálogo exige elegir al menos un
// filtro antes de mostrar resultados, usando GET /vulnerabilidades/buscar.
//
// Todos los campos del formulario quedan como string (reflejan el <input>
// crudo) hasta el submit — evita la complejidad de coerción numérica de
// React Hook Form + Zod para un campo que puede estar vacío.
const esquemaFiltro = z
  .object({
    cve: z.string().trim(),
    cvssMin: z.string().trim(),
    cvssMax: z.string().trim(),
    severidad: z.string().trim(),
    componente: z.string().trim(),
    estadoRemediacion: z.string().trim()
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

function aCriterios(datos: DatosFiltro): CriteriosBusqueda {
  return {
    cve: datos.cve || undefined,
    cvssMin: datos.cvssMin !== '' ? Number(datos.cvssMin) : undefined,
    cvssMax: datos.cvssMax !== '' ? Number(datos.cvssMax) : undefined,
    severidad: datos.severidad || undefined,
    componente: datos.componente || undefined,
    estadoRemediacion: (datos.estadoRemediacion || undefined) as EstadoRemediacion | undefined
  };
}

export function CatalogoPage() {
  const [criteriosActivos, setCriteriosActivos] = useState<CriteriosBusqueda | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<DatosFiltro>({
    resolver: zodResolver(esquemaFiltro),
    defaultValues: { cve: '', cvssMin: '', cvssMax: '', severidad: '', componente: '', estadoRemediacion: '' }
  });

  const { data, isLoading, isError, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useBuscarVulnerabilidades(criteriosActivos);
  const resultados = data?.pages.flat() ?? [];

  const onSubmit = (datos: DatosFiltro) => setCriteriosActivos(aCriterios(datos));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Catálogo de vulnerabilidades</h1>

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
            Software / componente
          </label>
          <input
            id="componente"
            placeholder="Apache Log4j, Microsoft Exchange…"
            {...register('componente')}
            className="campo-formulario mt-1 w-full"
          />
        </div>

        <div className="col-span-full flex items-center gap-3">
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300">
            Buscar
          </button>
          {errors.cve && <p className="text-sm text-red-600 dark:text-red-400">{errors.cve.message}</p>}
        </div>
      </form>

      {criteriosActivos === null && <EstadoVacio mensaje="Elegí al menos un filtro y presioná «Buscar» para ver resultados." />}
      {isLoading && <Spinner etiqueta="Buscando…" />}
      {isError && <MensajeError mensaje={mensajeDeError(error)} />}
      {data && resultados.length === 0 && <EstadoVacio mensaje="No se encontraron vulnerabilidades con esos criterios." />}

      {data && resultados.length > 0 && (
        <>
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
              {resultados.map((item) => (
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

          {hasNextPage && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="rounded-md border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                {isFetchingNextPage ? 'Cargando…' : `Cargar más (mostrando ${resultados.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
