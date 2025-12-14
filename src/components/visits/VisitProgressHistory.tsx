import { useState, useEffect } from 'react';
import { getVisitProgressHistory, VisitProgressEntry } from '@/lib/visitProgressService';
import { Badge } from '@/components/ui/badge';
import { MapPin, Clock, FileText } from 'lucide-react';
import { formatCoordinates } from '@/lib/coordinates';

interface VisitProgressHistoryProps {
  visitId: string;
  expanded?: boolean;
}

export default function VisitProgressHistory({ visitId, expanded = true }: VisitProgressHistoryProps) {
  const [history, setHistory] = useState<VisitProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (expanded) {
      fetchHistory();
    }
  }, [visitId, expanded]);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    
    const { data, error: fetchError } = await getVisitProgressHistory(visitId);
    
    if (fetchError) {
      console.error('Error fetching progress history:', fetchError);
      setError('Error al cargar el historial');
    } else {
      setHistory(data || []);
    }
    
    setLoading(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStateName = (entry: VisitProgressEntry) => {
    if (entry.visit_states?.name) {
      return entry.visit_states.name.charAt(0).toUpperCase() + entry.visit_states.name.slice(1);
    }
    return entry.visit_state_code || 'Sin estado';
  };

  if (!expanded) {
    return null;
  }

  if (loading) {
    return (
      <div className="py-2 text-sm text-muted-foreground">
        Cargando historial...
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-2 text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="py-2 text-sm text-muted-foreground">
        Sin historial de progresos
      </div>
    );
  }

  return (
    <div className="space-y-3 py-2">
      <h4 className="text-sm font-medium text-muted-foreground">Historial de progresos</h4>
      <div className="space-y-2">
        {history.map((entry, index) => (
          <div 
            key={entry.id} 
            className="border rounded-lg p-3 bg-muted/30 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {formatDate(entry.recorded_at)}
                </span>
              </div>
              <Badge variant="outline" className="text-xs">
                {getStateName(entry)}
              </Badge>
            </div>
            
            {(entry.latitude && entry.longitude) && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <a 
                  href={`https://maps.google.com/?q=${entry.latitude},${entry.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {formatCoordinates(entry.latitude, entry.longitude)}
                </a>
                {entry.location_accuracy && (
                  <span className="text-xs text-muted-foreground">
                    (±{entry.location_accuracy.toFixed(0)}m)
                  </span>
                )}
              </div>
            )}
            
            {entry.note && (
              <div className="flex items-start gap-2">
                <FileText className="h-3 w-3 text-muted-foreground mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  {entry.note}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
