import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useEscalaDeClasificacion, useGuardarEscala, useVolverAEscalaCvss } from '../../hooks/useEscalaDeClasificacion';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { BadgeNivelRiesgo } from '../../components/ui/BadgeNivelRiesgo';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { ANCLA_ESCALA } from '../../routes/paths';
import type { CortesDeClasificacion, RangoDeNivel } from '../../api/escalaService';

type Campos = Record<keyof CortesDeClasificacion, string>;

const CAMPOS: Array<{ clave: keyof CortesDeClasificacion; etiqueta: string }> = [
  { clave: 'moderado', etiqueta: 'Moderado desde' },
  { clave: 'alto', etiqueta: 'Alto desde' },
  { clave: 'critico', etiqueta: 'Crítico desde' }
];

function aCampos(cortes: CortesDeClasificacion): Campos {
  return { moderado: cortes.moderado.toFixed(1), alto: cortes.alto.toFixed(1), critico: cortes.critico.toFixed(1) };
}

// Las mismas reglas que EscalaDeClasificacion.personalizada() en el backend,
// para avisar antes de guardar. El backend vuelve a validar igual.
function validar(campos: Campos): { cortes: CortesDeClasificacion } | { error: string } {
  const cortes = {} as CortesDeClasificacion;
  for (const { clave, etiqueta } of CAMPOS) {
    const texto = campos[clave].trim().replace(',', '.');
    const valor = Number(texto);
    const nombre = etiqueta.replace(' desde', '');
    if (texto === '' || !Number.isFinite(valor)) return { error: `Indicá desde qué valor empieza el nivel ${nombre}.` };
    if (!/^\d+(\.\d)?$/.test(texto)) return { error: `El corte de ${nombre} puede tener como máximo un decimal (como el CVSS).` };
    if (valor <= 0 || valor > 10) return { error: `El corte de ${nombre} tiene que estar entre 0.1 y 10.0.` };
    cortes[clave] = valor;
  }
  if (!(cortes.moderado < cortes.alto && cortes.alto < cortes.critico)) {
    return { error: 'Los cortes tienen que ir en orden: Moderado empieza antes que Alto, y Alto antes que Crítico, sin repetirse.' };
  }
  return { cortes };
}

function rangosDe({ moderado, alto, critico }: CortesDeClasificacion): RangoDeNivel[] {
  return [
    { nivel: 'Bajo', minimo: 0, menorQue: moderado },
    { nivel: 'Moderado', minimo: moderado, menorQue: alto },
    { nivel: 'Alto', minimo: alto, menorQue: critico },
    { nivel: 'Crítico', minimo: critico, menorQue: null }
  ];
}

function textoDeRango({ minimo, menorQue }: RangoDeNivel): string {
  if (minimo === 0) return `CVSS menor que ${menorQue!.toFixed(1)}`;
  if (menorQue === null) return `CVSS ${minimo.toFixed(1)} o más`;
  return `CVSS desde ${minimo.toFixed(1)} y menor que ${menorQue.toFixed(1)}`;
}

function mismosCortes(a: CortesDeClasificacion, b: CortesDeClasificacion): boolean {
  return a.moderado === b.moderado && a.alto === b.alto && a.critico === b.critico;
}

// RF-28 / RF-69 (M-04, M-09), "Modo B": el analista elige dónde empieza cada
// nivel de riesgo de su catálogo. Los nombres no cambian (Bajo, Moderado,
// Alto, Crítico); por defecto rige la escala CVSS. Todo lo que muestra o
// filtra por nivel de riesgo usa esta escala.
export function EscalaDeClasificacionSeccion() {
  const { data, isLoading, isError, error } = useEscalaDeClasificacion();
  const guardar = useGuardarEscala();
  const volver = useVolverAEscalaCvss();
  const [campos, setCampos] = useState<Campos | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const seccion = useRef<HTMLElement>(null);
  const location = useLocation();

  // Los campos arrancan con la escala vigente, y vuelven a ella cada vez que
  // se guarda o se restablece.
  useEffect(() => {
    if (data) setCampos(aCampos(data.cortes));
  }, [data]);

  // Los rótulos "Escala: …" de las demás pantallas llevan a esta sección.
  useEffect(() => {
    if (data && location.hash === `#${ANCLA_ESCALA}`) seccion.current?.scrollIntoView?.({ block: 'start' });
  }, [data, location.hash]);

  const validacion = campos ? validar(campos) : null;
  const cortesValidos = validacion && 'cortes' in validacion ? validacion.cortes : null;
  const sinCambios = data && cortesValidos ? mismosCortes(cortesValidos, data.cortes) : false;

  const onGuardar = (evento: FormEvent) => {
    evento.preventDefault();
    if (!cortesValidos) return;
    setAviso(null);
    volver.reset();
    guardar.mutate(cortesValidos, {
      onSuccess: (escala) =>
        setAviso(
          escala.personalizada
            ? 'Guardaste tu escala.'
            : 'Esos cortes son los de CVSS: volviste a la escala por defecto.'
        )
    });
  };

  const onVolverACvss = () => {
    setAviso(null);
    guardar.reset();
    volver.mutate(undefined, { onSuccess: () => setAviso('Volviste a la escala CVSS (por defecto).') });
  };

  return (
    <section
      id={ANCLA_ESCALA}
      ref={seccion}
      aria-labelledby="titulo-escala"
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      <div>
        <h2 id="titulo-escala" className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Escala de niveles de riesgo
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Con esta escala se clasifica tu catálogo en Bajo, Moderado, Alto y Crítico según el CVSS: la usan el filtro por nivel, la ficha,
          los gráficos, el ranking, los plazos, los informes y las exportaciones. Por defecto rige la escala oficial de CVSS.
        </p>
      </div>

      {isLoading && <Spinner etiqueta="Cargando tu escala…" />}
      {isError && <MensajeError mensaje={mensajeDeError(error)} />}

      {data && campos && (
        <form onSubmit={onGuardar} className="space-y-4" noValidate>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200" data-testid="escala-vigente">
            Vigente: {data.descripcion}
          </p>

          <div className="grid grid-cols-3 gap-3">
            {CAMPOS.map(({ clave, etiqueta }) => (
              <label key={clave} className="block text-sm text-slate-700 dark:text-slate-300">
                <span className="mb-1 block font-medium">{etiqueta}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0.1"
                  max="10"
                  value={campos[clave]}
                  onChange={(evento) => {
                    setAviso(null);
                    setCampos({ ...campos, [clave]: evento.target.value });
                  }}
                  className="campo-formulario w-full"
                />
              </label>
            ))}
          </div>

          {validacion && 'error' in validacion ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {validacion.error}
            </p>
          ) : (
            cortesValidos && (
              <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-300" aria-label="Cómo queda la escala">
                {rangosDe(cortesValidos).map((rango) => (
                  <li key={rango.nivel} className="flex items-center gap-2">
                    <BadgeNivelRiesgo nivel={rango.nivel} />
                    <span>{textoDeRango(rango)}</span>
                  </li>
                ))}
              </ul>
            )
          )}

          {aviso && (
            <p
              className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
              role="status"
            >
              {aviso}
            </p>
          )}
          {guardar.isError && <MensajeError mensaje={mensajeDeError(guardar.error)} />}
          {volver.isError && <MensajeError mensaje={mensajeDeError(volver.error)} />}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!cortesValidos || sinCambios || guardar.isPending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              {guardar.isPending ? 'Guardando…' : 'Guardar escala'}
            </button>
            <button
              type="button"
              onClick={onVolverACvss}
              disabled={!data.personalizada || volver.isPending}
              className="rounded-md bg-white px-4 py-2 text-sm text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-700"
            >
              Volver a la escala CVSS ({data.cortesCvss.moderado.toFixed(1)} / {data.cortesCvss.alto.toFixed(1)} /{' '}
              {data.cortesCvss.critico.toFixed(1)})
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
