import { createContext, useContext } from 'react'
import type { Pais } from '../types/database.types'

interface PaisCtx {
  pais: Pais
  cambiarPais: () => void
}

export const PaisContext = createContext<PaisCtx | null>(null)

export function usePais(): PaisCtx {
  const c = useContext(PaisContext)
  if (!c) throw new Error('usePais debe usarse dentro de PaisContext')
  return c
}

const CLAVE = 'rn_pais_id'

export function leerPaisGuardado(): string | null {
  try {
    return window.localStorage.getItem(CLAVE)
  } catch {
    return null
  }
}

export function guardarPais(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(CLAVE, id)
    else window.localStorage.removeItem(CLAVE)
  } catch {
    // sin almacenamiento disponible: se pedirá el país de nuevo
  }
}
