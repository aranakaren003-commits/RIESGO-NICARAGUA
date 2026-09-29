import ListaAnalisis from './ListaAnalisis'
import type { Permisos } from '../lib/permisos'

// Histórico: casos que en algún momento pasaron por número equivocado, aunque su estatus haya cambiado después.
export default function NumeroEquivocado({ permisos }: { permisos: Permisos }) {
  return (
    <ListaAnalisis
      titulo="Número equivocado"
      tabla="v_historial_numero_equivocado"
      comentarioCampo="numero_pertenece_a"
      comentarioLabel="COMENTARIO"
      archivoBase="numero_equivocado"
      permisos={permisos}
    />
  )
}
