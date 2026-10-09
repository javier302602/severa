import { useMutation } from '@tanstack/react-query';
import { informeService, type FrecuenciaInformePeriodico } from '../api/informeService';
import type { OpcionesDescargaDeInforme } from '../api/formatosDeInforme';

export function useDescargarInformeCompleto() {
  return useMutation({
    mutationFn: (opciones: OpcionesDescargaDeInforme) => informeService.descargarCompleto(opciones)
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
