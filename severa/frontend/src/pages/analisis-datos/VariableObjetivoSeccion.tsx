import { useState } from 'react';
import { useDefinirVariableObjetivo, useVariableObjetivo } from '../../hooks/useAnalisisDatos';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { AvisoErrorSeccion } from './AvisoErrorSeccion';
import type { DecisionVariableObjetivo } from '../../api/analisisDatosService';
import { ETIQUETA_DE_TIPO_DETALLADO } from '../../constants/tiposDeVariable';
import {
  CLASE_AVISO_DE_EXITO,
  CLASE_AVISO_INFORMATIVO,
  CLASE_BOTON_PRIMARIO,
  CLASE_BOTON_SECUNDARIO,
  CLASE_SELECTOR,
  CLASE_TARJETA
} from './estilos';

function EstadoDeLaDecision({ decision }: { decision: DecisionVariableObjetivo }) {
  if (decision.estado === 'confirmada') {
    return (
      <p className={CLASE_AVISO_DE_EXITO} role="status">
        Variable objetivo: <span className="font-semibold">{decision.columna}</span> (confirmada por vos).
      </p>
    );
  }
  return (
    <p className={CLASE_AVISO_INFORMATIVO} role="status">
      {decision.estado === 'rechazada'
        ? 'Indicaste que este análisis no tiene variable objetivo.'
        : 'Todavía no definiste una variable objetivo. El sistema no la fija por su cuenta: la decisión es tuya.'}
    </p>
  );
}

interface Props {
  sesionId: string;
  onReiniciar: () => void;
  onDecisionCambiada?: (decision: DecisionVariableObjetivo) => void;
}

// RF-110: el sistema sugiere hasta tres variables candidatas a ser el
// objetivo del análisis, cada una con sus motivos. El analista puede
// confirmar una, elegir cualquier otra columna o indicar que no hay ninguna.
// Nada queda fijado hasta que el analista aprieta un botón.
export function VariableObjetivoSeccion({ sesionId, onReiniciar, onDecisionCambiada }: Props) {
  const { data, isLoading, isError, error } = useVariableObjetivo(sesionId);
  const definir = useDefinirVariableObjetivo(sesionId);
  const [elegidaAMano, setElegidaAMano] = useState('');

  if (isLoading) return <Spinner etiqueta="Buscando variables candidatas…" />;
  if (isError) return <AvisoErrorSeccion error={error} onReiniciar={onReiniciar} />;
  if (!data) return null;

  const decidir = (columna: string | null) => {
    definir.mutate(columna, { onSuccess: (resultado) => onDecisionCambiada?.(resultado.decision) });
  };
  const confirmada = data.decision.estado === 'confirmada' ? data.decision.columna : null;

  return (
    <div className="space-y-4">
      <EstadoDeLaDecision decision={data.decision} />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sugerencias del sistema</h3>
        {data.candidatas.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-400">El sistema no encontró candidatas.</p>}
        {data.candidatas.map((candidata) => (
          <div key={candidata.columna} className={`flex flex-wrap items-start justify-between gap-3 p-3 ${CLASE_TARJETA}`}>
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {candidata.columna}{' '}
                <span className="font-normal text-slate-500 dark:text-slate-400">({ETIQUETA_DE_TIPO_DETALLADO[candidata.tipo]})</span>
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-600 dark:text-slate-400">
                {candidata.motivos.map((motivo) => (
                  <li key={motivo}>{motivo}</li>
                ))}
              </ul>
            </div>
            {confirmada === candidata.columna ? (
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Confirmada</span>
            ) : (
              <button type="button" className={CLASE_BOTON_PRIMARIO} disabled={definir.isPending} onClick={() => decidir(candidata.columna)}>
                Confirmar {candidata.columna}
              </button>
            )}
          </div>
        ))}
        <p className="text-xs text-slate-500 dark:text-slate-400">{data.nota}</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Elegir otra</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-slate-700 dark:text-slate-300">
            <span className="mb-1 block">Otra columna</span>
            <select className={CLASE_SELECTOR} value={elegidaAMano} onChange={(evento) => setElegidaAMano(evento.target.value)}>
              <option value="">— elegí una columna —</option>
              {data.columnasElegibles.map((columna) => (
                <option key={columna} value={columna}>
                  {columna}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={CLASE_BOTON_SECUNDARIO}
            disabled={elegidaAMano === '' || elegidaAMano === confirmada || definir.isPending}
            onClick={() => decidir(elegidaAMano)}
          >
            Usar como variable objetivo
          </button>
          <button
            type="button"
            className={CLASE_BOTON_SECUNDARIO}
            disabled={data.decision.estado === 'rechazada' || definir.isPending}
            onClick={() => decidir(null)}
          >
            Este análisis no tiene variable objetivo
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          No se pueden elegir identificadores, textos libres ni fechas. La variable objetivo queda registrada en el dataset, en su
          bitácora y en el informe; SIADE todavía no construye modelos a partir de ella.
        </p>
      </section>

      {definir.isPending && <Spinner etiqueta="Guardando tu decisión…" />}
      {definir.isError && <MensajeError mensaje={mensajeDeError(definir.error)} />}
    </div>
  );
}
