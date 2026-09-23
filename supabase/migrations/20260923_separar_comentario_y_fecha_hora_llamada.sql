-- COMENTARIO, FECHA Y HORA -> dos campos: comentario y fecha/hora de la llamada
alter table public.llamadas_bienvenida rename column comentario_fecha_hora to comentario_llamada;
alter table public.llamadas_bienvenida add column fecha_hora_llamada timestamptz;
