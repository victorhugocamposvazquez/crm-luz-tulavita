// Utility functions for coordinate formatting

export function formatCoordinates(latitude: number, longitude: number): string {
  const formatDMS = (decimal: number, isLatitude: boolean): string => {
    const abs = Math.abs(decimal);
    const degrees = Math.floor(abs);
    const minutes = Math.floor((abs - degrees) * 60);
    const seconds = ((abs - degrees) * 60 - minutes) * 60;
    
    const direction = isLatitude 
      ? (decimal >= 0 ? 'N' : 'S')
      : (decimal >= 0 ? 'E' : 'W');
    
    return `${degrees}°${minutes}'${seconds.toFixed(1)}"${direction}`;
  };

  const latFormatted = formatDMS(latitude, true);
  const lonFormatted = formatDMS(longitude, false);
  
  return `${latFormatted} ${lonFormatted}`;
}

export function parseCoordinates(coordinateString: string): { latitude: number; longitude: number } | null {
  // Parse DMS format like "43°16'59.7"N 1°40'39.8"W"
  const regex = /(\d+)°(\d+)'([\d.]+)"([NS])\s+(\d+)°(\d+)'([\d.]+)"([EW])/;
  const match = coordinateString.match(regex);
  
  if (!match) return null;
  
  const [, latDeg, latMin, latSec, latDir, lonDeg, lonMin, lonSec, lonDir] = match;
  
  const latitude = (parseInt(latDeg) + parseInt(latMin) / 60 + parseFloat(latSec) / 3600) * (latDir === 'S' ? -1 : 1);
  const longitude = (parseInt(lonDeg) + parseInt(lonMin) / 60 + parseFloat(lonSec) / 3600) * (lonDir === 'W' ? -1 : 1);
  
  return { latitude, longitude };
}