import { useMutation } from '@tanstack/react-query';
import { informeService, type FormatoInforme, type FrecuenciaInformePeriodico } from '../api/informeService';

export function useDescargarInformeCompleto() {
  return useMutation({
    mutationFn: (formato: FormatoInforme) => informeService.descargarCompleto(formato)
  });
}

export function useDescargarResumenEjecutivo() {
  return useMutation({
    mutationFn: () => informeService.descargarResumenEjecutivo()
  });
}

export function useProgramarInforme() {
  return useMutation({
    mutationFn: (frecuencia: FrecuenciaInformePeriodico) => informeService.programar(frecuencia)
  });
}
