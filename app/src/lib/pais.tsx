import { createContext, useContext } from 'react'
import type { Pais } from '../types/database.types'

interface PaisCtx {
  pais: Pais
  paises: Pais[] // países que el usuario puede ver (uno solo si su perfil es de país)
  esRegional: boolean
  elegirPais: (id: string) => void // solo para perfiles regionales
}

export const PaisContext = createContext<PaisCtx | null>(null)

export function usePais(): PaisCtx {
  const c = useContext(PaisContext)
  if (!c) throw new Error('usePais debe usarse dentro de PaisContext')
  return c
}

const CLAVE = 'rn_pais_regional'

// Último país mirado por un perfil regional (comodidad; si no hay almacenamiento se usa el primero)
export function leerPaisRegional(): string | null {
  try {
    return window.localStorage.getItem(CLAVE)
  } catch {
    return null
  }
}

export function guardarPaisRegional(id: string): void {
  try {
    window.localStorage.setItem(CLAVE, id)
  } catch {
    // sin almacenamiento disponible
  }
}
