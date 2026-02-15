/**
 * Selector de etiquetas para un lead: muestra badges y popover para añadir/quitar
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { LEAD_TAGS, getLeadTagById } from '@/data/lead-tags';
import { LEAD_TAG_CATEGORY_LABELS } from '@/data/lead-tags.types';
import type { LeadTagCategory } from '@/data/lead-tags.types';
import { Tag, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const CATEGORY_ORDER: LeadTagCategory[] = ['prioridad', 'estado', 'interes', 'accion'];

export interface LeadTagSelectorProps {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function LeadTagSelector({
  value,
  onChange,
  disabled,
  placeholder = 'Añadir etiqueta',
}: LeadTagSelectorProps) {
  const [open, setOpen] = useState(false);

  const currentSet = new Set(value);
  const tagsByCategory = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: LEAD_TAG_CATEGORY_LABELS[cat],
    tags: LEAD_TAGS.filter((t) => t.category === cat),
  }));

  const addTag = (id: string) => {
    if (currentSet.has(id)) return;
    onChange([...value, id]);
    setOpen(false);
  };

  const removeTag = (id: string) => {
    onChange(value.filter((t) => t !== id));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((tagId) => {
          const def = getLeadTagById(tagId);
          if (!def) return null;
          return (
            <span
              key={tagId}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-white',
                disabled && 'opacity-70'
              )}
              style={{ backgroundColor: def.color }}
            >
              {def.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeTag(tagId)}
                  className="rounded hover:bg-white/20 p-0.5 -mr-0.5"
                  aria-label={`Quitar ${def.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}
      </div>
      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 h-8">
              <Tag className="h-3.5 w-3.5" />
              {placeholder}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <div className="max-h-[320px] overflow-y-auto">
              {tagsByCategory.map(({ category, label, tags }) => (
                <div key={category} className="p-2 border-b last:border-b-0">
                  <p className="text-xs font-semibold text-muted-foreground px-2 py-1">{label}</p>
                  <div className="flex flex-wrap gap-1">
                    {tags.map((t) => {
                      const selected = currentSet.has(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => addTag(t.id)}
                          disabled={selected}
                          className={cn(
                            'rounded-md px-2 py-1 text-xs font-medium transition-opacity',
                            selected && 'opacity-50 cursor-not-allowed'
                          )}
                          style={{
                            backgroundColor: selected ? t.color : undefined,
                            color: selected ? '#fff' : undefined,
                            border: selected ? undefined : `2px solid ${t.color}`,
                          }}
                        >
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
