import { MensajeError } from '../../components/ui/MensajeError';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { esSesionNoEncontrada } from '../../utils/esSesionNoEncontrada';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { useReapertura } from './contextoDeReapertura';

const CLASE_BOTON = 'mt-3 rounded-md px-4 py-1.5 text-sm font-medium disabled:opacity-50';
const CLASE_BOTON_PRINCIPAL = `${CLASE_BOTON} bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300`;
const CLASE_BOTON_ALTERNATIVO = `${CLASE_BOTON} text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-700`;

// Compartido por todas las secciones de Análisis de Datos y por la descarga
// del informe: mismo criterio de error en todas las rutas que reciben
// sesionId. Sesión expirada/inexistente (404) es un caso esperado, no un
// error genérico — se distingue con un aviso claro y una acción concreta en
// vez de un cartel rojo.
//
// Desde que los datasets quedan guardados (RF-136), la acción principal ya no
// es volver a subir el archivo sino reabrir el dataset: lo ofrece cuando la
// página que lo contiene sabe cuál es (ver contextoDeReapertura.ts).
export function AvisoErrorSeccion({ error, onReiniciar }: { error: unknown; onReiniciar: () => void }) {
  const reapertura = useReapertura();

  if (esSesionNoEncontrada(error)) {
    if (reapertura) {
      return (
        <EstadoVacio
          mensaje={
            <>
              <span className="block">Tu sesión de análisis expiró. El dataset sigue guardado: podés reabrirlo y continuar.</span>
              <span className="flex justify-center gap-3">
                <button type="button" onClick={reapertura.reabrir} disabled={reapertura.reabriendo} className={CLASE_BOTON_PRINCIPAL}>
                  {reapertura.reabriendo ? 'Reabriendo…' : 'Reabrir el dataset'}
                </button>
                <button type="button" onClick={onReiniciar} className={CLASE_BOTON_ALTERNATIVO}>
                  Subir otro archivo
                </button>
              </span>
            </>
          }
        />
      );
    }

    return (
      <EstadoVacio
        mensaje={
          <>
            <span className="block">Tu sesión de análisis expiró o no se encontró. Volvé a subir el archivo para continuar.</span>
            <button type="button" onClick={onReiniciar} className={CLASE_BOTON_PRINCIPAL}>
              Subir otro archivo
            </button>
          </>
        }
      />
    );
  }

  return <MensajeError mensaje={mensajeDeError(error)} />;
}
