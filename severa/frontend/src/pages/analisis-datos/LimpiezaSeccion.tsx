import { useState } from 'react';
import { useAplicarLimpieza, usePrevisualizarLimpieza, usePropuestaDeLimpieza } from '../../hooks/useAnalisisDatos';
import { Spinner } from '../../components/ui/Spinner';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { MensajeError } from '../../components/ui/MensajeError';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { AvisoErrorSeccion } from './AvisoErrorSeccion';
import type {
  DecisionDeTratamiento,
  EstrategiaDeFaltantes,
  MetodoDeImputacion,
  PropuestaDeTratamiento,
  ResultadoDeLimpiezaAplicada,
  ResumenDeLimpieza
} from '../../api/analisisDatosService';
import { ETIQUETA_DE_ESTRATEGIA, ETIQUETA_DE_OPERACION, ETIQUETA_DE_TIPO_DETALLADO } from '../../constants/tiposDeVariable';
import {
  CLASE_AVISO_DE_ATENCION,
  CLASE_AVISO_INFORMATIVO,
  CLASE_BOTON_PRIMARIO,
  CLASE_BOTON_SECUNDARIO,
  CLASE_CABECERA_DE_TABLA,
  CLASE_SELECTOR,
  CLASE_TARJETA
} from './estilos';

// Lo que el analista eligió para una variable, como un solo valor de
// selector: '' (no tratar), 'eliminar_registros', 'eliminar_columna' o
// 'imputar:<método>'.
type Eleccion = '' | 'eliminar_registros' | 'eliminar_columna' | `imputar:${MetodoDeImputacion}`;

const ETIQUETA_DE_METODO: Record<MetodoDeImputacion, string> = { media: 'la media', mediana: 'la mediana', moda: 'la moda' };

function eleccionRecomendada(propuesta: PropuestaDeTratamiento): Eleccion {
  const { estrategia, metodo } = propuesta.recomendacion;
  if (estrategia === 'no_tratar') return '';
  if (estrategia === 'imputar') return metodo ? `imputar:${metodo}` : '';
  return estrategia;
}

function textoDeRecomendacion(propuesta: PropuestaDeTratamiento): string {
  const { estrategia, metodo } = propuesta.recomendacion;
  if (estrategia === 'no_tratar') return 'No tratarla';
  if (estrategia === 'imputar') return metodo ? `Imputar por ${ETIQUETA_DE_METODO[metodo]}` : 'Imputar';
  return ETIQUETA_DE_ESTRATEGIA[estrategia];
}

function aDecisiones(elecciones: Record<string, Eleccion>): DecisionDeTratamiento[] {
  return Object.entries(elecciones)
    .filter(([, eleccion]) => eleccion !== '')
    .map(([columna, eleccion]) => {
      if (eleccion.startsWith('imputar:')) {
        return { columna, estrategia: 'imputar' as const, metodo: eleccion.slice('imputar:'.length) as MetodoDeImputacion };
      }
      return { columna, estrategia: eleccion as EstrategiaDeFaltantes };
    });
}

function valorLegible(valor: number | string | boolean): string {
  return typeof valor === 'number' ? String(Number(valor.toFixed(4))) : String(valor);
}

function VistaPrevia({ resumen }: { resumen: ResumenDeLimpieza }) {
  return (
    <div className={`space-y-3 p-4 ${CLASE_TARJETA}`}>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Vista previa: qué pasaría</h3>
      <p className="text-sm text-slate-700 dark:text-slate-300">
        De {resumen.filasAntes} fila(s) quedarían {resumen.filasDespues} (se eliminan {resumen.filasEliminadas}).{' '}
        {resumen.columnasEliminadas.length === 0
          ? 'No se elimina ninguna variable.'
          : `Se eliminan ${resumen.columnasEliminadas.length} variable(s): ${resumen.columnasEliminadas.join(', ')}.`}{' '}
        Se imputan {resumen.celdasImputadas} valor(es).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className={CLASE_CABECERA_DE_TABLA}>
            <tr>
              <th className="px-3 py-1.5">Operación</th>
              <th className="px-3 py-1.5">Variable</th>
              <th className="px-3 py-1.5">Registros afectados</th>
              <th className="px-3 py-1.5">Método</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {resumen.operaciones.map((operacion) => (
              <tr key={`${operacion.operacion}-${operacion.variable}`}>
                <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{ETIQUETA_DE_OPERACION[operacion.operacion]}</td>
                <td className="px-3 py-1.5 font-medium text-slate-900 dark:text-slate-100">{operacion.variable}</td>
                <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{operacion.registrosAfectados}</td>
                <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">
                  {operacion.metodo}
                  {operacion.valorImputado !== undefined && ` (valor: ${valorLegible(operacion.valorImputado)})`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {resumen.operaciones
        .filter((operacion) => operacion.nota)
        .map((operacion) => (
          <p key={operacion.variable} className={CLASE_AVISO_DE_ATENCION}>
            <span className="font-medium">{operacion.variable}:</span> {operacion.nota}
          </p>
        ))}
    </div>
  );
}

interface Props {
  sesionId: string;
  onReiniciar: () => void;
  // Se llama cuando la limpieza generó una versión nueva: la página pasa a
  // trabajar sobre ella.
  onVersionGenerada: (resultado: ResultadoDeLimpiezaAplicada) => void;
}

// M-15, Ronda 2 — tratamiento de valores faltantes (RF-120, RF-121).
//
// El flujo tiene tres pasos y el sistema no aplica nada hasta el último:
//   1. Propuesta: por cada variable con faltantes, qué se puede hacer y qué
//      recomienda el sistema. Por defecto no hay nada elegido.
//   2. Vista previa: qué pasaría con lo elegido (filas que se van, valores
//      que se imputarían). No guarda nada.
//   3. Confirmación explícita: una casilla que hay que marcar y un botón.
// Si el analista cambia una elección después de ver la vista previa, la
// vista previa y la confirmación se descartan: lo que se confirma es siempre
// lo que se acaba de ver.
export function LimpiezaSeccion({ sesionId, onReiniciar, onVersionGenerada }: Props) {
  const { data, isLoading, isError, error } = usePropuestaDeLimpieza(sesionId);
  const previsualizar = usePrevisualizarLimpieza(sesionId);
  const aplicar = useAplicarLimpieza(sesionId);
  const [elecciones, setElecciones] = useState<Record<string, Eleccion>>({});
  const [confirmado, setConfirmado] = useState(false);

  if (isLoading) return <Spinner etiqueta="Buscando valores faltantes…" />;
  if (isError) return <AvisoErrorSeccion error={error} onReiniciar={onReiniciar} />;
  if (!data) return null;

  if (data.propuestas.length === 0) {
    return <EstadoVacio mensaje="Este dataset no tiene valores faltantes: no hay nada que tratar." />;
  }

  const decisiones = aDecisiones(elecciones);

  const descartarVistaPrevia = () => {
    previsualizar.reset();
    aplicar.reset();
    setConfirmado(false);
  };

  const elegir = (columna: string, eleccion: Eleccion) => {
    setElecciones((actuales) => ({ ...actuales, [columna]: eleccion }));
    descartarVistaPrevia();
  };

  const usarRecomendaciones = () => {
    setElecciones(Object.fromEntries(data.propuestas.map((propuesta) => [propuesta.columna, eleccionRecomendada(propuesta)])));
    descartarVistaPrevia();
  };

  const generarVersion = () => {
    // RF-120: sin la casilla marcada no se llama al backend (que, de todos
    // modos, tampoco aplicaría nada sin su propia confirmación).
    if (!confirmado || !previsualizar.data) return;
    aplicar.mutate(decisiones, { onSuccess: (resultado) => onVersionGenerada(resultado) });
  };

  return (
    <div className="space-y-4">
      <p className={CLASE_AVISO_INFORMATIVO}>
        Elegí qué hacer con cada variable que tiene valores faltantes. El sistema recomienda, pero no aplica nada por su cuenta:
        primero vas a ver qué pasaría y después tenés que confirmarlo. El resultado es una <strong>versión nueva</strong> del
        dataset; el original no se modifica y podés volver a él cuando quieras.
      </p>

      <div className={`overflow-x-auto ${CLASE_TARJETA}`}>
        <table className="w-full text-left text-sm">
          <thead className={CLASE_CABECERA_DE_TABLA}>
            <tr>
              <th className="px-4 py-2">Variable</th>
              <th className="px-4 py-2">Faltantes</th>
              <th className="px-4 py-2">Recomendación del sistema</th>
              <th className="px-4 py-2">Qué hacer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {data.propuestas.map((propuesta) => {
              const imputar = propuesta.opciones.find((opcion) => opcion.estrategia === 'imputar');
              return (
                <tr key={propuesta.columna} className="align-top">
                  <td className="px-4 py-2">
                    <span className="font-medium text-slate-900 dark:text-slate-100">{propuesta.columna}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{ETIQUETA_DE_TIPO_DETALLADO[propuesta.tipo]}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600 dark:text-slate-400">
                    {propuesta.valoresFaltantes} ({propuesta.porcentajeFaltante.toFixed(1)}%)
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{textoDeRecomendacion(propuesta)}</span>
                    <span className="block text-xs">{propuesta.recomendacion.motivo}</span>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      aria-label={`Qué hacer con ${propuesta.columna}`}
                      className={CLASE_SELECTOR}
                      value={elecciones[propuesta.columna] ?? ''}
                      disabled={aplicar.isPending}
                      onChange={(evento) => elegir(propuesta.columna, evento.target.value as Eleccion)}
                    >
                      <option value="">No tratar</option>
                      <option value="eliminar_registros">Eliminar los registros con faltantes</option>
                      <option value="eliminar_columna">Eliminar la variable</option>
                      {imputar?.disponible &&
                        imputar.metodos.map((metodo) => (
                          <option key={metodo} value={`imputar:${metodo}`}>
                            Imputar por {ETIQUETA_DE_METODO[metodo]}
                          </option>
                        ))}
                    </select>
                    {imputar && !imputar.disponible && imputar.motivoNoDisponible && (
                      <span className="mt-1 block max-w-xs text-xs text-slate-500 dark:text-slate-400">
                        No se puede imputar: {imputar.motivoNoDisponible}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" className={CLASE_BOTON_SECUNDARIO} disabled={aplicar.isPending} onClick={usarRecomendaciones}>
          Usar las recomendaciones
        </button>
        <button
          type="button"
          className={CLASE_BOTON_PRIMARIO}
          disabled={decisiones.length === 0 || previsualizar.isPending || aplicar.isPending}
          onClick={() => previsualizar.mutate(decisiones)}
        >
          Ver qué pasaría
        </button>
      </div>
      {decisiones.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">Todavía no elegiste ningún tratamiento.</p>
      )}

      {previsualizar.isPending && <Spinner etiqueta="Calculando la vista previa…" />}
      {previsualizar.isError && <MensajeError mensaje={mensajeDeError(previsualizar.error)} />}

      {previsualizar.data && (
        <>
          <VistaPrevia resumen={previsualizar.data} />

          <div className={`space-y-3 p-4 ${CLASE_TARJETA}`}>
            <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmado}
                disabled={aplicar.isPending}
                onChange={(evento) => setConfirmado(evento.target.checked)}
              />
              <span>
                Confirmo estos cambios. Se va a generar una versión nueva del dataset con ellos; el original no se modifica.
              </span>
            </label>
            <button type="button" className={CLASE_BOTON_PRIMARIO} disabled={!confirmado || aplicar.isPending} onClick={generarVersion}>
              {aplicar.isPending ? 'Generando la versión…' : 'Generar versión procesada'}
            </button>
            {aplicar.isError && <MensajeError mensaje={mensajeDeError(aplicar.error)} />}
          </div>
        </>
      )}
    </div>
  );
}
