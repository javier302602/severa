import { useState, type FormEvent } from 'react';
import {
  useAplicarPlantilla,
  useEliminarPlantilla,
  useGuardarPlantilla,
  usePlantillas,
  useVistaPreviaDePlantilla
} from '../../hooks/useAnalisisDatos';
import { Spinner } from '../../components/ui/Spinner';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { MensajeError } from '../../components/ui/MensajeError';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { AvisoErrorSeccion } from './AvisoErrorSeccion';
import type {
  CambioDePlantilla,
  ConfiguracionDePlantilla,
  CriterioDeClasificacion,
  DecisionVariableObjetivo,
  PlantillaDeAnalisis,
  ResultadoDeAplicacionDePlantilla,
  TipoColumnaDetallado,
  VistaPreviaDePlantilla
} from '../../api/analisisDatosService';
import { ETIQUETA_DE_TIPO_DETALLADO } from '../../constants/tiposDeVariable';
import {
  CLASE_AVISO_DE_ATENCION,
  CLASE_AVISO_DE_EXITO,
  CLASE_AVISO_INFORMATIVO,
  CLASE_BOTON_PRIMARIO,
  CLASE_BOTON_SECUNDARIO,
  CLASE_SELECTOR
} from './estilos';

const LARGO_MAXIMO_DEL_NOMBRE = 80;

// El nombre del tipo en medio de una frase ("edad como numérica continua").
function tipoEnFrase(tipo: TipoColumnaDetallado): string {
  return ETIQUETA_DE_TIPO_DETALLADO[tipo].toLowerCase();
}

function describirCriterio(criterio: CriterioDeClasificacion): string {
  if (criterio.tipo === 'numerica') {
    const umbrales = (criterio.umbrales ?? []).map((umbral) => `${umbral.etiqueta} desde ${umbral.minimo}`).join(', ');
    return `«${criterio.nombreColumna}» por umbrales (${umbrales})`;
  }
  return `«${criterio.nombreColumna}» por orden de categorías (${(criterio.ordenCategorias ?? []).join(' < ')})`;
}

function describirDecision(decision: DecisionVariableObjetivo): string {
  if (decision.estado === 'confirmada') return `hoy es «${decision.columna}»`;
  return decision.estado === 'rechazada' ? 'hoy está descartada' : 'hoy no hay ninguna confirmada';
}

// Lo que trae la plantilla, en una línea por cada tipo de ajuste.
function resumenDeConfiguracion(configuracion: ConfiguracionDePlantilla): string[] {
  const lineas: string[] = [];
  const tipos = Object.entries(configuracion.tiposCorregidos);
  if (tipos.length > 0) {
    lineas.push(`Tipos: ${tipos.map(([columna, tipo]) => `${columna} como ${tipoEnFrase(tipo)}`).join('; ')}`);
  }
  if (configuracion.variableObjetivo !== null) {
    lineas.push(`Variable objetivo: ${configuracion.variableObjetivo}`);
  }
  if (configuracion.clasificacion) {
    const clave = configuracion.clasificacion.columnaClave ? `; columna clave: ${configuracion.clasificacion.columnaClave}` : '';
    lineas.push(`Criterio de clasificación: ${describirCriterio(configuracion.clasificacion.criterio)}${clave}`);
  }
  return lineas;
}

function DescripcionDelCambio({ cambio }: { cambio: CambioDePlantilla }) {
  switch (cambio.tipo) {
    case 'tipo_de_variable':
      return (
        <>
          Tipo de <strong>{cambio.columna}</strong>: {tipoEnFrase(cambio.tipoActual)} → {tipoEnFrase(cambio.tipoNuevo)}
        </>
      );
    case 'variable_objetivo':
      // RF-110: el analista ve exactamente qué variable va a confirmar.
      return (
        <>
          Se confirma <strong>{cambio.columna}</strong> como variable objetivo ({describirDecision(cambio.actual)})
        </>
      );
    case 'criterio_de_clasificacion':
      return (
        <>
          Criterio de clasificación: {describirCriterio(cambio.criterioNuevo)}
          {cambio.columnaClaveNueva && <>; columna clave «{cambio.columnaClaveNueva}»</>}
          {cambio.criterioActual && <> (reemplaza a {describirCriterio(cambio.criterioActual)})</>}
        </>
      );
  }
}

interface VistaPreviaProps {
  vista: VistaPreviaDePlantilla;
  aplicando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

function VistaPrevia({ vista, aplicando, onConfirmar, onCancelar }: VistaPreviaProps) {
  const { plan } = vista;

  if (!plan.aplicable) {
    return (
      <div className={CLASE_AVISO_DE_ATENCION} role="alert">
        <p className="font-medium">La plantilla «{vista.plantilla.nombre}» no se puede aplicar a este dataset. No se va a cambiar nada.</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {plan.columnasFaltantes.length > 0 && <li>Le faltan las columnas: {plan.columnasFaltantes.join(', ')}.</li>}
          {plan.problemas.map((problema) => (
            <li key={problema}>{problema.charAt(0).toUpperCase() + problema.slice(1)}.</li>
          ))}
        </ul>
      </div>
    );
  }

  if (plan.cambios.length === 0) {
    return (
      <p className={CLASE_AVISO_INFORMATIVO} role="status">
        Este dataset ya tiene todo lo que trae la plantilla «{vista.plantilla.nombre}»: no hay nada que cambiar.
      </p>
    );
  }

  const advertencias = plan.cambios.flatMap((cambio) =>
    cambio.tipo === 'criterio_de_clasificacion' && cambio.categoriasSinOrden.length > 0
      ? [{ columna: cambio.criterioNuevo.nombreColumna, categorias: cambio.categoriasSinOrden }]
      : []
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700 dark:text-slate-300">
        Si aplicás «{vista.plantilla.nombre}», esto es lo que cambia en este dataset, en este orden:
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300" aria-label="Cambios que se van a aplicar">
        {plan.cambios.map((cambio, indice) => (
          <li key={indice}>
            <DescripcionDelCambio cambio={cambio} />
          </li>
        ))}
      </ol>
      {plan.yaVigentes > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{plan.yaVigentes} ajuste(s) de la plantilla ya estaban aplicados y no se tocan.</p>
      )}
      {advertencias.map((advertencia) => (
        <p key={advertencia.columna} className={CLASE_AVISO_DE_ATENCION} role="alert">
          En este dataset, «{advertencia.columna}» tiene categorías que la plantilla no ordena: {advertencia.categorias.join(', ')}. Esas filas
          van a quedar «Sin clasificar».
        </p>
      ))}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Cada cambio queda anotado en la bitácora del dataset. Las correcciones de otras variables no se tocan.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={CLASE_BOTON_PRIMARIO} disabled={aplicando} onClick={onConfirmar}>
          {aplicando ? 'Aplicando…' : 'Confirmar y aplicar'}
        </button>
        <button type="button" className={CLASE_BOTON_SECUNDARIO} disabled={aplicando} onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

interface Props {
  sesionId: string;
  onReiniciar: () => void;
  // Para que la página refresque la tabla de variables con los tipos nuevos.
  onPlantillaAplicada: (resultado: ResultadoDeAplicacionDePlantilla) => void;
}

// RF-12 (M-02): "el analista puede guardar una plantilla con nombre. La
// plantilla puede reaplicarse sobre un nuevo dataset compatible." Se guarda la
// configuración de análisis del dataset abierto; aplicar una muestra primero
// qué va a cambiar y solo cambia algo si el analista lo confirma.
export function PlantillasSeccion({ sesionId, onReiniciar, onPlantillaAplicada }: Props) {
  const [nombre, setNombre] = useState('');
  const [guardada, setGuardada] = useState<string | null>(null);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [porEliminar, setPorEliminar] = useState<string | null>(null);
  const [aplicada, setAplicada] = useState<string | null>(null);

  const plantillas = usePlantillas();
  const guardar = useGuardarPlantilla(sesionId);
  const eliminar = useEliminarPlantilla();
  const vistaPrevia = useVistaPreviaDePlantilla(sesionId, seleccionada);
  const aplicar = useAplicarPlantilla(sesionId);

  const onGuardar = (evento: FormEvent) => {
    evento.preventDefault();
    setGuardada(null);
    guardar.mutate(nombre, {
      onSuccess: (plantilla) => {
        setNombre('');
        setGuardada(`Guardaste la plantilla «${plantilla.nombre}».`);
      }
    });
  };

  const onElegir = (plantilla: PlantillaDeAnalisis) => {
    setAplicada(null);
    aplicar.reset();
    setSeleccionada(plantilla.id);
  };

  const onConfirmar = () => {
    if (!vistaPrevia.data || !seleccionada) return;
    aplicar.mutate(
      { plantillaId: seleccionada, huella: vistaPrevia.data.huella },
      {
        onSuccess: (resultado) => {
          setSeleccionada(null);
          setAplicada(`Se aplicó la plantilla «${resultado.plantilla.nombre}»: ${resultado.cambiosAplicados.length} cambio(s).`);
          onPlantillaAplicada(resultado);
        }
      }
    );
  };

  const onEliminar = (plantillaId: string) => {
    eliminar.mutate(plantillaId, {
      onSuccess: () => {
        setPorEliminar(null);
        if (seleccionada === plantillaId) setSeleccionada(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Guardar como plantilla</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          La plantilla guarda lo que decidiste sobre este dataset —tipos corregidos, variable objetivo confirmada y criterio de
          clasificación— para que puedas reaplicarlo a otro dataset con las mismas columnas.
        </p>
        <form onSubmit={onGuardar} className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-700 dark:text-slate-300">
            <span className="sr-only">Nombre de la plantilla</span>
            <input
              type="text"
              value={nombre}
              maxLength={LARGO_MAXIMO_DEL_NOMBRE}
              placeholder="Nombre de la plantilla"
              onChange={(evento) => setNombre(evento.target.value)}
              className={`${CLASE_SELECTOR} w-72`}
            />
          </label>
          <button type="submit" className={CLASE_BOTON_PRIMARIO} disabled={nombre.trim() === '' || guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Guardar plantilla'}
          </button>
        </form>
        {guardada && (
          <p className={CLASE_AVISO_DE_EXITO} role="status">
            {guardada}
          </p>
        )}
        {guardar.isError && <AvisoErrorSeccion error={guardar.error} onReiniciar={onReiniciar} />}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tus plantillas</h3>
        {aplicada && (
          <p className={CLASE_AVISO_DE_EXITO} role="status">
            {aplicada} Los análisis de este dataset ya se recalcularon.
          </p>
        )}
        {plantillas.isPending && <Spinner etiqueta="Cargando tus plantillas…" />}
        {plantillas.isError && <MensajeError mensaje={mensajeDeError(plantillas.error)} />}
        {plantillas.data && plantillas.data.length === 0 && <EstadoVacio mensaje="Todavía no guardaste ninguna plantilla." />}
        {plantillas.data && plantillas.data.length > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {plantillas.data.map((plantilla) => (
              <li key={plantilla.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{plantilla.nombre}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Guardada el {new Date(plantilla.fechaCreacion).toLocaleString()}</p>
                    <ul className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      {resumenDeConfiguracion(plantilla.configuracion).map((linea) => (
                        <li key={linea}>{linea}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={CLASE_BOTON_SECUNDARIO}
                      onClick={() => onElegir(plantilla)}
                      aria-label={`Ver qué cambia si aplicás ${plantilla.nombre}`}
                    >
                      Aplicar a este dataset
                    </button>
                    {porEliminar === plantilla.id ? (
                      <>
                        <button
                          type="button"
                          className={CLASE_BOTON_SECUNDARIO}
                          disabled={eliminar.isPending}
                          onClick={() => onEliminar(plantilla.id)}
                        >
                          Sí, eliminarla
                        </button>
                        <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => setPorEliminar(null)}>
                          No
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className={CLASE_BOTON_SECUNDARIO}
                        onClick={() => setPorEliminar(plantilla.id)}
                        aria-label={`Eliminar ${plantilla.nombre}`}
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>

                {seleccionada === plantilla.id && (
                  <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                    {vistaPrevia.isPending && <Spinner etiqueta="Revisando qué cambiaría…" />}
                    {vistaPrevia.isError && <AvisoErrorSeccion error={vistaPrevia.error} onReiniciar={onReiniciar} />}
                    {vistaPrevia.data && (
                      <VistaPrevia
                        vista={vistaPrevia.data}
                        aplicando={aplicar.isPending}
                        onConfirmar={onConfirmar}
                        onCancelar={() => setSeleccionada(null)}
                      />
                    )}
                    {aplicar.isError && <AvisoErrorSeccion error={aplicar.error} onReiniciar={onReiniciar} />}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {eliminar.isError && <MensajeError mensaje={mensajeDeError(eliminar.error)} />}
      </section>
    </div>
  );
}
