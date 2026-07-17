import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useComparacionAcceso, useComparacionSoftware, useComparacionTipo } from '../../hooks/useComparacion';
import type { ComparacionGrupos } from '../../api/comparacionService';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { esCatalogoVacio } from '../../utils/esCatalogoVacio';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { RUTAS } from '../../routes/paths';

function TarjetasDeMedia({ datos, etiquetaA, etiquetaB }: { datos: ComparacionGrupos; etiquetaA: string; etiquetaB: string }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4">
        <p className="text-xs text-slate-600 dark:text-slate-400">Media — {etiquetaA}</p>
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{datos.mediaA.toFixed(2)}</p>
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4">
        <p className="text-xs text-slate-600 dark:text-slate-400">Media — {etiquetaB}</p>
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{datos.mediaB.toFixed(2)}</p>
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4">
        <p className="text-xs text-slate-600 dark:text-slate-400">Diferencia de medias</p>
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{datos.diferenciaMedias.toFixed(2)}</p>
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4">
        <p className="text-xs text-slate-600 dark:text-slate-400">Desv. estándar — {etiquetaA}</p>
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{datos.sdA.toFixed(2)}</p>
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4">
        <p className="text-xs text-slate-600 dark:text-slate-400">Desv. estándar — {etiquetaB}</p>
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{datos.sdB.toFixed(2)}</p>
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
      <SeccionComparacionConCategorias
        titulo="Por software"
        placeholderA="Apache Log4j"
        placeholderB="Nginx"
        usarHook={useComparacionSoftware}
      />
    </div>
  );
}
