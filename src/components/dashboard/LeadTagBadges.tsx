/**
 * Muestra las etiquetas de un lead como badges de color (solo lectura)
 */

import { getLeadTagById } from '@/data/lead-tags';
import { cn } from '@/lib/utils';

export interface LeadTagBadgesProps {
  tagIds: string[] | null | undefined;
  max?: number;
  className?: string;
}

export function LeadTagBadges({ tagIds, max = 5, className }: LeadTagBadgesProps) {
  const list = Array.isArray(tagIds) ? tagIds : [];
  const toShow = max > 0 ? list.slice(0, max) : list;
  const rest = max > 0 ? list.length - max : 0;

  if (list.length === 0) {
    return <span className={cn('text-muted-foreground text-xs', className)}>—</span>;
  }

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {toShow.map((tagId) => {
        const def = getLeadTagById(tagId);
        if (!def) return null;
        return (
          <span
            key={tagId}
            className="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: def.color }}
            title={def.name}
          >
            {def.name}
          </span>
        );
      })}
      {rest > 0 && (
        <span className="text-[10px] text-muted-foreground">+{rest}</span>
      )}
    </div>
  );
}
