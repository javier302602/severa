import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useComparacionAcceso, useComparacionSoftware, useComparacionTipo, useSoftwareDisponible } from '../../hooks/useComparacion';
import type { ComparacionGrupos } from '../../api/comparacionService';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { esCatalogoVacio } from '../../utils/esCatalogoVacio';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { RUTAS } from '../../routes/paths';

// formatearEstadistico (2026-07-19, bug real: un lado sin vulnerabilidades —
// ej. comparar "Apache Log4j" con datos reales vs. "Nginx" sin ninguna —
// antes tiraba TODA la comparación abajo con un 400; ahora el backend
// devuelve ese lado en null y acá se muestra "N/A" solo para ESE valor, en
// vez de perder la comparación completa).
function formatearEstadistico(valor: number | null): string {
  return valor === null ? 'N/A' : valor.toFixed(2);
}

// La diferencia de medias específicamente se rotula "No comparable" (no
// "N/A" genérico) porque la razón de que falte es distinta: no es que este
// valor puntual no se pudiera calcular, es que no hay dos grupos para
// comparar entre sí.
function formatearDiferencia(valor: number | null): string {
  return valor === null ? 'No comparable' : valor.toFixed(2);
}

function TarjetasDeMedia({ datos, etiquetaA, etiquetaB }: { datos: ComparacionGrupos; etiquetaA: string; etiquetaB: string }) {
  return (
    <div className="space-y-2">
      {(datos.mediaA === null || datos.mediaB === null) && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {datos.mediaA === null && datos.mediaB === null
            ? `Ninguno de los dos grupos (${etiquetaA} / ${etiquetaB}) tiene vulnerabilidades registradas.`
            : `Solo hay datos para ${datos.mediaA !== null ? etiquetaA : etiquetaB}: media ${formatearEstadistico(datos.mediaA ?? datos.mediaB)}.`}
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4">
          <p className="text-xs text-slate-600 dark:text-slate-400">Media — {etiquetaA}</p>
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{formatearEstadistico(datos.mediaA)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4">
          <p className="text-xs text-slate-600 dark:text-slate-400">Media — {etiquetaB}</p>
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{formatearEstadistico(datos.mediaB)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4">
          <p className="text-xs text-slate-600 dark:text-slate-400">Diferencia de medias</p>
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{formatearDiferencia(datos.diferenciaMedias)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4">
          <p className="text-xs text-slate-600 dark:text-slate-400">Desv. estándar — {etiquetaA}</p>
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{formatearEstadistico(datos.sdA)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4">
          <p className="text-xs text-slate-600 dark:text-slate-400">Desv. estándar — {etiquetaB}</p>
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{formatearEstadistico(datos.sdB)}</p>
        </div>
      </div>
    </div>
  );
}

// Mensaje deliberadamente más cauto que el de Estadísticas/Priorización: acá
// "La lista de CVSS Score no puede estar vacía" puede significar que el
// catálogo entero está vacío, PERO también que la categoría elegida (ej. un
// software que no existe en el dataset) no tiene ninguna vulnerabilidad — el
// backend no distingue esos dos casos en el mensaje, así que el frontend
// tampoco puede afirmar cuál de los dos pasó.
function EstadoSinDatos({ mostrarSugerenciaDeImportar }: { mostrarSugerenciaDeImportar: boolean }) {
  return (
    <EstadoVacio
      mensaje={
        mostrarSugerenciaDeImportar ? (
          <>
            No hay suficientes vulnerabilidades para comparar estos grupos (alguno de los dos no tiene datos).{' '}
            <Link to={RUTAS.dataset} className="underline">
              Importá un dataset
            </Link>{' '}
            si el catálogo todavía está vacío.
          </>
        ) : (
          'No hay suficientes vulnerabilidades para comparar estos grupos (alguno de los dos no tiene datos) — revisá que las categorías elegidas existan en el catálogo.'
        )
      }
    />
  );
}

function SeccionAcceso() {
  const { data, isLoading, isError, error } = useComparacionAcceso();

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Por tipo de acceso: Remoto vs. Local</h2>
      {isLoading && <Spinner etiqueta="Comparando…" />}
      {isError && esCatalogoVacio(error) && <EstadoSinDatos mostrarSugerenciaDeImportar />}
      {isError && !esCatalogoVacio(error) && <MensajeError mensaje={mensajeDeError(error)} />}
      {data && <TarjetasDeMedia datos={data} etiquetaA="Remoto" etiquetaB="Local" />}
    </section>
  );
}

function SeccionComparacionConCategorias({
  titulo,
  placeholderA,
  placeholderB,
  usarHook
}: {
  titulo: string;
  placeholderA: string;
  placeholderB: string;
  usarHook: typeof useComparacionTipo;
}) {
  const [categoriaA, setCategoriaA] = useState('');
  const [categoriaB, setCategoriaB] = useState('');
  const [aplicado, setAplicado] = useState({ a: '', b: '' });

  const { data, isLoading, isError, error } = usarHook(aplicado.a, aplicado.b);

  const onSubmit = (evento: FormEvent) => {
    evento.preventDefault();
    setAplicado({ a: categoriaA.trim(), b: categoriaB.trim() });
  };

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{titulo}</h2>
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Categoría A</label>
          <input
            value={categoriaA}
            onChange={(evento) => setCategoriaA(evento.target.value)}
            placeholder={placeholderA}
            className="campo-formulario mt-1 py-1.5"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Categoría B</label>
          <input
            value={categoriaB}
            onChange={(evento) => setCategoriaB(evento.target.value)}
            placeholder={placeholderB}
            className="campo-formulario mt-1 py-1.5"
          />
        </div>
        <button type="submit" className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300">
          Comparar
        </button>
        <p className="w-full text-xs text-slate-500 dark:text-slate-400">Dejá un campo vacío para usar el valor por defecto del backend ({placeholderA} / {placeholderB}).</p>
      </form>

      {isLoading && <Spinner etiqueta="Comparando…" />}
      {isError && esCatalogoVacio(error) && <EstadoSinDatos mostrarSugerenciaDeImportar={false} />}
      {isError && !esCatalogoVacio(error) && <MensajeError mensaje={mensajeDeError(error)} />}
      {data && (
        <TarjetasDeMedia datos={data} etiquetaA={aplicado.a || placeholderA} etiquetaB={aplicado.b || placeholderB} />
      )}
    </section>
  );
}

// Bug real reportado: comparar "Apache Log4j" vs "Nginx" a mano (texto
// libre) decía "sin datos" para ambos aunque el catálogo real tuviera
// software cargado — el nombre real no coincidía con lo que el analista
// escribía a ciegas. Dropdown con los valores REALES del catálogo (GET
// /comparacion/software-disponible) en vez de texto libre — permite elegir
// el mismo software en A y B a propósito (caso especial: compara un grupo
// contra sí mismo, diferencia de medias siempre 0, sigue siendo un
// resultado válido, no un error).
function SeccionComparacionSoftware() {
  const disponibles = useSoftwareDisponible();
  const [categoriaA, setCategoriaA] = useState('');
  const [categoriaB, setCategoriaB] = useState('');

  // Apenas llega la lista real, precarga A/B con las dos primeras opciones
  // (o la única disponible en ambas) en vez de dejar el selector vacío.
  useEffect(() => {
    if (!disponibles.data || disponibles.data.length === 0) return;
    setCategoriaA((actual) => actual || disponibles.data[0]);
    setCategoriaB((actual) => actual || disponibles.data[1] || disponibles.data[0]);
  }, [disponibles.data]);

  const { data, isLoading, isError, error } = useComparacionSoftware(categoriaA, categoriaB);

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Por software</h2>

      {disponibles.isLoading && <Spinner etiqueta="Cargando software disponible…" />}
      {disponibles.isError && <MensajeError mensaje={mensajeDeError(disponibles.error)} />}
      {disponibles.data && disponibles.data.length === 0 && (
        <EstadoVacio
          mensaje={
            <>
              Todavía no hay software cargado para comparar.{' '}
              <Link to={RUTAS.dataset} className="underline">
                Importá un dataset
              </Link>
              .
            </>
          }
        />
      )}

      {disponibles.data && disponibles.data.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Categoría A</label>
            <select
              value={categoriaA}
              onChange={(evento) => setCategoriaA(evento.target.value)}
              className="campo-formulario mt-1 py-1.5"
            >
              {disponibles.data.map((software) => (
                <option key={software} value={software}>
                  {software}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Categoría B</label>
            <select
              value={categoriaB}
              onChange={(evento) => setCategoriaB(evento.target.value)}
              className="campo-formulario mt-1 py-1.5"
            >
              {disponibles.data.map((software) => (
                <option key={software} value={software}>
                  {software}
                </option>
              ))}
            </select>
          </div>
          {categoriaA && categoriaB && categoriaA === categoriaB && (
            <p className="w-full text-xs text-slate-500 dark:text-slate-400">
              Mismo software en A y B: la diferencia de medias va a dar 0 (se compara el grupo contra sí mismo).
            </p>
          )}
        </div>
      )}

      {isLoading && <Spinner etiqueta="Comparando…" />}
      {isError && <MensajeError mensaje={mensajeDeError(error)} />}
      {data && <TarjetasDeMedia datos={data} etiquetaA={categoriaA} etiquetaB={categoriaB} />}
    </section>
  );
}

// M-08 (RF-62 a RF-68): tres comparaciones de a pares (acceso, tipo de
// vulnerabilidad, software) contra la misma forma de respuesta
// (ComparadorDeCategorias.compararGrupos) — una sección por endpoint, mismo
// estilo de tarjetas que ResumenEstadisticoPage.
export function ComparacionPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Comparación</h1>

      <SeccionAcceso />
      <SeccionComparacionConCategorias
        titulo="Por tipo de vulnerabilidad"
        placeholderA="N/A"
        placeholderB="N/A"
        usarHook={useComparacionTipo}
      />
      <SeccionComparacionSoftware />
    </div>
  );
}
