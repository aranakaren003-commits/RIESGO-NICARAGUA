import ListaAnalisis from './ListaAnalisis'
import type { Permisos } from '../lib/permisos'

export default function NumeroEquivocado({ permisos }: { permisos: Permisos }) {
  return (
    <ListaAnalisis
      titulo="Número equivocado"
      columna="estatus_llamada"
      valor="NUMERO EQUIVOCADO"
      comentarioCampo="numero_pertenece_a"
      comentarioLabel="A QUIÉN PERTENECE EL NÚMERO"
      archivoBase="numero_equivocado"
      permisos={permisos}
    />
  )
}
