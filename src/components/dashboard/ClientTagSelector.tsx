/**
 * Selector de etiquetas de cliente: badges con colores + popover para elegir
 * estados comerciales del catálogo, sugerencias ya existentes en la base y la
 * posibilidad de añadir una etiqueta personalizada.
 */

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CLIENT_TAGS, getClientTagColor } from '@/data/client-tags';
import { Plus, Tag, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ClientTagSelectorProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Etiquetas ya usadas en otros clientes, para ofrecerlas como sugerencias. */
  suggestions?: string[];
  disabled?: boolean;
  placeholder?: string;
}

export function ClientTagSelector({
  value,
  onChange,
  suggestions = [],
  disabled,
  placeholder = 'Añadir etiqueta',
}: ClientTagSelectorProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');

  const currentSet = useMemo(() => new Set(value), [value]);

  // Catálogo + sugerencias de la base, sin duplicar, manteniendo el orden del
  // catálogo primero y luego el resto alfabéticamente.
  const options = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const t of CLIENT_TAGS) {
      if (!seen.has(t.value)) {
        seen.add(t.value);
        ordered.push(t.value);
      }
    }
    for (const s of [...suggestions].sort((a, b) => a.localeCompare(b, 'es'))) {
      const v = s.trim();
      if (v && !seen.has(v)) {
        seen.add(v);
        ordered.push(v);
      }
    }
    return ordered;
  }, [suggestions]);

  const addTag = (raw: string) => {
    const v = raw.trim();
    if (!v || currentSet.has(v)) return;
    onChange([...value, v]);
  };

  const removeTag = (v: string) => {
    onChange(value.filter((t) => t !== v));
  };

  const commitCustom = () => {
    const v = custom.trim();
    if (!v) return;
    addTag(v);
    setCustom('');
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span
              key={v}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-white',
                disabled && 'opacity-70',
              )}
              style={{ backgroundColor: getClientTagColor(v) }}
            >
              {v}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeTag(v)}
                  className="rounded hover:bg-white/20 p-0.5 -mr-0.5"
                  aria-label={`Quitar ${v}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="gap-2 h-8">
              <Tag className="h-3.5 w-3.5" />
              {placeholder}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <div className="max-h-[280px] overflow-y-auto p-2">
              <p className="text-xs font-semibold text-muted-foreground px-1 py-1">
                Estados comerciales
              </p>
              <div className="flex flex-wrap gap-1">
                {options.map((v) => {
                  const selected = currentSet.has(v);
                  const color = getClientTagColor(v);
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => addTag(v)}
                      disabled={selected}
                      className={cn(
                        'rounded-md px-2 py-1 text-xs font-medium transition-opacity',
                        selected && 'opacity-50 cursor-not-allowed',
                      )}
                      style={{
                        backgroundColor: selected ? color : undefined,
                        color: selected ? '#fff' : undefined,
                        border: selected ? undefined : `2px solid ${color}`,
                      }}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="border-t p-2">
              <p className="text-xs font-semibold text-muted-foreground px-1 pb-1">
                Otra etiqueta
              </p>
              <div className="flex items-center gap-1.5">
                <Input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitCustom();
                    }
                  }}
                  placeholder="Personalizada…"
                  className="h-8 text-sm"
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 gap-1 shrink-0"
                  disabled={!custom.trim()}
                  onClick={commitCustom}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Añadir
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
