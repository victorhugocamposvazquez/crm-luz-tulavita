import { useState, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

interface GeolocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface UseGeolocationReturn {
  location: GeolocationData | null;
  loading: boolean;
  error: string | null;
  requestLocation: () => Promise<GeolocationData | null>;
  hasPermission: boolean;
}

export function useGeolocation(): UseGeolocationReturn {
  const [location, setLocation] = useState<GeolocationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    checkPermission();
  }, []);

  const checkPermission = async () => {
    if (!navigator.geolocation) {
      setError('La geolocalización no está soportada en este navegador');
      return;
    }

    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      setHasPermission(permission.state === 'granted');
    } catch (err) {
      console.warn('Error checking geolocation permission:', err);
    }
  };

  const requestLocation = (): Promise<GeolocationData | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        const errorMsg = 'La geolocalización no está soportada en este navegador';
        setError(errorMsg);
        toast({
          title: "Error de geolocalización",
          description: errorMsg,
          variant: "destructive",
        });
        resolve(null);
        return;
      }

      setLoading(true);
      setError(null);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const locationData: GeolocationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          
          setLocation(locationData);
          setHasPermission(true);
          setLoading(false);
          resolve(locationData);
        },
        (error) => {
          let errorMessage = 'Error desconocido al obtener la ubicación';
          
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Los permisos de geolocalización han sido denegados. Por favor, actívalos en la configuración del navegador.';
              setHasPermission(false);
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'La información de ubicación no está disponible.';
              break;
            case error.TIMEOUT:
              errorMessage = 'Se agotó el tiempo de espera para obtener la ubicación.';
              break;
          }
          
          setError(errorMessage);
          setLoading(false);
          
          toast({
            title: "Error de geolocalización",
            description: errorMessage,
            variant: "destructive",
          });
          
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        }
      );
    });
  };

  return {
    location,
    loading,
    error,
    requestLocation,
    hasPermission,
  };
}