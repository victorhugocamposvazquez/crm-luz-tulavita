-- Actualizar los registros existentes en visit_states
UPDATE visit_states 
SET name = 'confirmado', description = 'Visita confirmada exitosamente'
WHERE code = 'completed';

UPDATE visit_states 
SET name = 'ausente', description = 'Cliente ausente durante la visita'
WHERE code = 'no_answer';

UPDATE visit_states 
SET name = 'nulo', description = 'Visita sin resultado'
WHERE code = 'not_interested';

UPDATE visit_states 
SET name = 'oficina', description = 'Derivado a oficina'
WHERE code = 'postponed';

-- Eliminar los registros que no se van a usar
DELETE FROM visit_states 
WHERE code NOT IN ('completed', 'no_answer', 'not_interested', 'postponed');

-- Renombrar columnas en sale_lines (1 por 1 como solicitado)
ALTER TABLE sale_lines 
RENAME COLUMN paid_cash TO financiada;

ALTER TABLE sale_lines 
RENAME COLUMN is_paid TO transferencia;

ALTER TABLE sale_lines 
RENAME COLUMN is_delivered TO nulo;