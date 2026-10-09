import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useExportarFrecuencias, useFrecuenciasAgrupadas, useFrecuenciasSinAgrupar } from '../../hooks/useEstadisticas';
import {
  NUMERO_MAXIMO_DE_INTERVALOS,
  NUMERO_MINIMO_DE_INTERVALOS,
  VARIABLES_DE_FRECUENCIAS,
  type ConsultaDeFrecuencias,
  type VariableDeFrecuencias
} from '../../api/estadisticaService';
import { PestanasEstadisticas } from './PestanasEstadisticas';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { esCatalogoVacio } from '../../utils/esCatalogoVacio';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { descargarArchivo } from '../../utils/descargarArchivo';
import { RUTAS } from '../../routes/paths';

type Vista = 'agrupada' | 'sinAgrupar';

// RF-39: lo que el analista escribió en "Número de intervalos", ya decidido.
// Vacío es una elección válida (que el sistema elija); un valor fuera de
// rango no se manda al backend — se avisa acá y la tabla queda como estaba.
type Intervalos = { estado: 'automatico' } | { estado: 'valido'; valor: number } | { estado: 'invalido' };

function interpretarIntervalos(texto: string): Intervalos {
  const limpio = texto.trim();
  if (limpio === '') return { estado: 'automatico' };
  const valor = Number(limpio);
  const esValido = Number.isInteger(valor) && valor >= NUMERO_MINIMO_DE_INTERVALOS && valor <= NUMERO_MAXIMO_DE_INTERVALOS;
  return esValido ? { estado: 'valido', valor } : { estado: 'invalido' };
}

// Un valor del catálogo tal cual es: 7.5 es "7.5" y 30 es "30" (no "30.0").
// El tope de 6 decimales solo quita restos de coma flotante.
function formatearValor(valor: number): string {
  return String(Number(valor.toFixed(6)));
}

const CLASE_BOTON_VISTA_ACTIVA = 'bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900';
const CLASE_BOTON_VISTA_INACTIVA = 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-600';

export function DistribucionFrecuenciasPage() {
  const [vista, setVista] = useState<Vista>('agrupada');
  const [variable, setVariable] = useState<VariableDeFrecuencias>('cvssScore');
  const [textoIntervalos, setTextoIntervalos] = useState('');
  // Último número de intervalos válido: es el que se consulta. Mientras el
  // campo tenga algo inválido se sigue mostrando la tabla anterior en vez de
  // vaciar la pantalla a mitad de tipeo.
  const [numeroDeIntervalos, setNumeroDeIntervalos] = useState<number | undefined>(undefined);

  const intervalos = interpretarIntervalos(textoIntervalos);
  const consulta: ConsultaDeFrecuencias = { variable, numeroDeIntervalos };

  // Solo se pide la tabla que se está mirando.
  const agrupada = useFrecuenciasAgrupadas(consulta, vista === 'agrupada');
  const sinAgrupar = useFrecuenciasSinAgrupar(consulta, vista === 'sinAgrupar');
  const activa = vista === 'agrupada' ? agrupada : sinAgrupar;
  const exportar = useExportarFrecuencias();

  const etiquetaVariable = VARIABLES_DE_FRECUENCIAS.find((opcion) => opcion.valor === variable)?.etiqueta ?? variable;
  const hayTabla = activa.data !== undefined && activa.data.length > 0;

  const alCambiarIntervalos = (texto: string) => {
    setTextoIntervalos(texto);
    const interpretado = interpretarIntervalos(texto);
    if (interpretado.estado === 'automatico') setNumeroDeIntervalos(undefined);
    if (interpretado.estado === 'valido') setNumeroDeIntervalos(interpretado.valor);
  };

  const alExportar = () => {
    exportar.mutate(
      { tipo: vista, consulta },
      { onSuccess: (blob) => descargarArchivo(blob, `distribucion-de-frecuencias-${variable}.xlsx`) }
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Estadísticas</h1>
      <PestanasEstadisticas />

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="frecuencias-variable" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Variable
          </label>
          <select
            id="frecuencias-variable"
            value={variable}
            onChange={(evento) => setVariable(evento.target.value as VariableDeFrecuencias)}
            className="campo-formulario mt-1 py-1.5"
          >
            {VARIABLES_DE_FRECUENCIAS.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </div>

        {vista === 'agrupada' && (
          <div>
            <label htmlFor="frecuencias-intervalos" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Número de intervalos
            </label>
            <input
              id="frecuencias-intervalos"
              type="number"
              inputMode="numeric"
              min={NUMERO_MINIMO_DE_INTERVALOS}
              max={NUMERO_MAXIMO_DE_INTERVALOS}
              step={1}
              placeholder="Automático"
              value={textoIntervalos}
              onChange={(evento) => alCambiarIntervalos(evento.target.value)}
              aria-invalid={intervalos.estado === 'invalido'}
              aria-describedby="frecuencias-intervalos-ayuda"
              className="campo-formulario mt-1 w-36 py-1.5"
            />
          </div>
        )}

        <button
          type="button"
          onClick={alExportar}
          disabled={!hayTabla || exportar.isPending}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300 disabled:opacity-50"
        >
          {exportar.isPending ? 'Exportando…' : 'Exportar a Excel'}
        </button>
      </div>

      {vista === 'agrupada' && (
        <p
          id="frecuencias-intervalos-ayuda"
          className={`text-xs ${intervalos.estado === 'invalido' ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}
        >
          {intervalos.estado === 'invalido'
            ? `Escribí un número entero entre ${NUMERO_MINIMO_DE_INTERVALOS} y ${NUMERO_MAXIMO_DE_INTERVALOS}, o dejá el campo vacío para que se elija solo.`
            : variable === 'cvssScore'
              ? 'Vacío: las 5 bandas de 2 puntos de la escala CVSS (0 a 10). Con un número, la misma escala se reparte en esa cantidad de intervalos iguales.'
              : 'Vacío: la cantidad se calcula con la regla de Sturges según cuántos valores hay. Los intervalos cubren del mínimo al máximo real de los datos.'}
        </p>
      )}

      {exportar.isError && <MensajeError mensaje={mensajeDeError(exportar.error)} />}

      <div className="flex gap-2">
        <button
          type="button"
          aria-pressed={vista === 'agrupada'}
          onClick={() => setVista('agrupada')}
          className={`rounded-md px-3 py-1.5 text-sm ${vista === 'agrupada' ? CLASE_BOTON_VISTA_ACTIVA : CLASE_BOTON_VISTA_INACTIVA}`}
        >
          Con intervalos agrupados
        </button>
        <button
          type="button"
          aria-pressed={vista === 'sinAgrupar'}
          onClick={() => setVista('sinAgrupar')}
          className={`rounded-md px-3 py-1.5 text-sm ${vista === 'sinAgrupar' ? CLASE_BOTON_VISTA_ACTIVA : CLASE_BOTON_VISTA_INACTIVA}`}
        >
          Sin agrupar
        </button>
      </div>

      {activa.isLoading && <Spinner etiqueta="Calculando…" />}

      {activa.isError && esCatalogoVacio(activa.error) && (
        <EstadoVacio
          mensaje={
            <>
              {variable === 'cvssScore'
                ? 'Todavía no hay vulnerabilidades cargadas.'
                : `Ninguna vulnerabilidad cargada tiene un valor de «${etiquetaVariable}».`}{' '}
              <Link to={RUTAS.dataset} className="underline">
                Importá un dataset
              </Link>{' '}
              para ver la distribución de frecuencias.
            </>
          }
        />
      )}
      {activa.isError && !esCatalogoVacio(activa.error) && <MensajeError mensaje={mensajeDeError(activa.error)} />}

      {vista === 'agrupada' && agrupada.data && (
        <div className="overflow-x-auto">
          <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm text-sm">
            <caption className="sr-only">Distribución de frecuencias agrupada de {etiquetaVariable}</caption>
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-slate-600 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-2">Intervalo</th>
                <th scope="col" className="px-4 py-2">Marca de clase</th>
                <th scope="col" className="px-4 py-2">Frec. absoluta</th>
                <th scope="col" className="px-4 py-2">Frec. relativa</th>
                <th scope="col" className="px-4 py-2">Frec. acumulada</th>
                <th scope="col" className="px-4 py-2">Frec. rel. acumulada</th>
              </tr>
            </thead>
            <tbody>
              {agrupada.data.map((fila) => (
                <tr key={fila.intervalo} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2">{fila.intervalo}</td>
                  <td className="px-4 py-2">{formatearValor(fila.marcaDeClase)}</td>
                  <td className="px-4 py-2">{fila.frecuenciaAbsoluta}</td>
                  <td className="px-4 py-2">{fila.frecuenciaRelativaPorcentaje.toFixed(1)}%</td>
                  <td className="px-4 py-2">{fila.frecuenciaAcumulada}</td>
                  <td className="px-4 py-2">{(fila.frecuenciaRelativaAcumulada * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {vista === 'sinAgrupar' && sinAgrupar.data && (
        <table className="w-full max-w-sm overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm text-sm">
          <caption className="sr-only">Distribución de frecuencias sin agrupar de {etiquetaVariable}</caption>
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-slate-600 dark:text-slate-400">
            <tr>
              <th scope="col" className="px-4 py-2">{etiquetaVariable}</th>
              <th scope="col" className="px-4 py-2">Frecuencia</th>
            </tr>
          </thead>
          <tbody>
            {sinAgrupar.data.map((fila) => (
              <tr key={fila.valor} className="border-t border-slate-100 dark:border-slate-800">
                {/* Un puntaje CVSS se escribe siempre con un decimal ("7.0"). */}
                <td className="px-4 py-2">{variable === 'cvssScore' ? fila.valor.toFixed(1) : formatearValor(fila.valor)}</td>
                <td className="px-4 py-2">{fila.frecuencia}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
