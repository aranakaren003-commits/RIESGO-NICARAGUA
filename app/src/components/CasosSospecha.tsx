import ListaAnalisis from './ListaAnalisis'
import type { Permisos } from '../lib/permisos'

export default function CasosSospecha({ permisos }: { permisos: Permisos }) {
  return (
    <ListaAnalisis
      titulo="Casos sospechosos"
      columna="caso_sospecha"
      valor="SI"
      comentarioCampo="comentario_llamada"
      comentarioLabel="COMENTARIO"
      archivoBase="casos_sospechosos"
      permisos={permisos}
    />
  )
}
