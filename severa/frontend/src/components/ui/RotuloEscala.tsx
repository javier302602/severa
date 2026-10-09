import { Link } from 'react-router-dom';
import { useEscalaDeClasificacion } from '../../hooks/useEscalaDeClasificacion';
import { RUTA_CONFIGURAR_ESCALA } from '../../routes/paths';

// RF-28 / RF-69: toda pantalla que muestra niveles de riesgo dice con qué
// escala los calculó, y el rótulo lleva a donde se configura.
export function RotuloEscala() {
  const { data } = useEscalaDeClasificacion();
  if (!data) return null;

  return (
    <Link
      to={RUTA_CONFIGURAR_ESCALA}
      className="inline-block text-xs text-slate-600 underline decoration-dotted underline-offset-2 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
      title="Configurar la escala de niveles de riesgo"
    >
      {data.descripcion}
    </Link>
  );
}
