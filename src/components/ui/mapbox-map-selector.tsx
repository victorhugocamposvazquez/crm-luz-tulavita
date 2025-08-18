import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './dialog';
import { Button } from './button';
import { MapPin } from 'lucide-react';
import { formatCoordinates } from '@/lib/coordinates';
import { supabase } from '@/integrations/supabase/client';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface MapboxMapSelectorProps {
  latitude?: number;
  longitude?: number;
  onCoordinatesSelect: (lat: number, lng: number) => void;
  children?: React.ReactNode;
}

export function MapboxMapSelector({ latitude, longitude, onCoordinatesSelect, children }: MapboxMapSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLat, setSelectedLat] = useState(latitude || 40.4168);
  const [selectedLng, setSelectedLng] = useState(longitude || -3.7038);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);

  // Fetch Mapbox token from Supabase Edge Function
  useEffect(() => {
    const fetchMapboxToken = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase.functions.invoke('get-mapbox-token');
        
        if (error) {
          console.error('Error fetching Mapbox token:', error);
          return;
        }

        if (data?.token) {
          setMapboxToken(data.token);
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen) {
      fetchMapboxToken();
    }
  }, [isOpen]);

  // Initialize map when token is available
  useEffect(() => {
    if (!mapboxToken || !mapContainer.current || !isOpen) return;

    mapboxgl.accessToken = mapboxToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [selectedLng, selectedLat],
      zoom: 10
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Create marker
    marker.current = new mapboxgl.Marker({ draggable: true })
      .setLngLat([selectedLng, selectedLat])
      .addTo(map.current);

    // Handle marker drag
    marker.current.on('dragend', () => {
      if (marker.current) {
        const lngLat = marker.current.getLngLat();
        setSelectedLat(lngLat.lat);
        setSelectedLng(lngLat.lng);
      }
    });

    // Handle map click
    map.current.on('click', (e) => {
      const { lng, lat } = e.lngLat;
      setSelectedLat(lat);
      setSelectedLng(lng);
      if (marker.current) {
        marker.current.setLngLat([lng, lat]);
      }
    });

    return () => {
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
  }, [mapboxToken, isOpen, selectedLat, selectedLng]);

  const handleConfirm = () => {
    onCoordinatesSelect(selectedLat, selectedLng);
    setIsOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      map.current?.remove();
      map.current = null;
      marker.current = null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm">
            <MapPin className="h-4 w-4 mr-2" />
            Seleccionar en mapa
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Seleccionar Ubicación</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isLoading ? (
            <div className="w-full h-96 bg-gray-200 border rounded-lg flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                <p>Cargando mapa...</p>
              </div>
            </div>
          ) : !mapboxToken ? (
            <div className="w-full h-96 bg-gray-200 border rounded-lg flex items-center justify-center">
              <div className="text-center text-gray-500">
                <MapPin className="h-8 w-8 mx-auto mb-2" />
                <p>Error cargando el mapa</p>
                <p className="text-sm">Verifica la configuración de Mapbox</p>
              </div>
            </div>
          ) : (
            <div 
              ref={mapContainer}
              className="w-full h-96 border rounded-lg"
            />
          )}
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <strong>Latitud:</strong> {selectedLat.toFixed(6)}
            </div>
            <div>
              <strong>Longitud:</strong> {selectedLng.toFixed(6)}
            </div>
          </div>
          
          <div className="text-center text-sm text-muted-foreground">
            Coordenadas: {formatCoordinates(selectedLat, selectedLng)}
          </div>

          <div className="text-xs text-muted-foreground text-center">
            Haz clic en el mapa o arrastra el marcador para seleccionar la ubicación
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleConfirm} className="flex-1">
              Confirmar Ubicación
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}