import React from 'react';
import { MapboxMapSelector } from './mapbox-map-selector';

interface MapSelectorProps {
  latitude?: number;
  longitude?: number;
  onCoordinatesSelect: (lat: number, lng: number) => void;
  children?: React.ReactNode;
}

export function MapSelector(props: MapSelectorProps) {
  return <MapboxMapSelector {...props} />;
}