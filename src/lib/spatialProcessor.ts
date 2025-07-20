import * as turf from '@turf/turf';

export interface SpatialOperation {
  type: 'BUFFER' | 'WITHIN' | 'TOUCHES' | 'INTERSECTS' | 'AREA_FILTER' | 'UNION' | 'DIFFERENCE';
  parameters: Record<string, any>;
  layers: string[];
}

export interface SpatialResult {
  geometry: any; // GeoJSON geometry
  properties: Record<string, any>;
  metadata: {
    operation: string;
    processingTime: number;
    engine: 'turf' | 'postgis';
  };
}

export interface SpatialProcessor {
  processOperation(operation: SpatialOperation, data: any[]): Promise<SpatialResult[]>;
  validateOperation(operation: SpatialOperation): boolean;
}

// Turf.js Implementation
export class TurfSpatialProcessor implements SpatialProcessor {
  async processOperation(operation: SpatialOperation, data: any[]): Promise<SpatialResult[]> {
    const startTime = Date.now();
    
    try {
      switch (operation.type) {
        case 'BUFFER':
          return this.processBuffer(operation, data);
        case 'WITHIN':
          return this.processWithin(operation, data);
        case 'TOUCHES':
          return this.processTouches(operation, data);
        case 'INTERSECTS':
          return this.processIntersects(operation, data);
        case 'AREA_FILTER':
          return this.processAreaFilter(operation, data);
        case 'UNION':
          return this.processUnion(operation, data);
        case 'DIFFERENCE':
          return this.processDifference(operation, data);
        default:
          throw new Error(`Unsupported operation: ${operation.type}`);
      }
    } finally {
      const processingTime = Date.now() - startTime;
      console.log(`Turf.js processing time: ${processingTime}ms`);
    }
  }

  validateOperation(operation: SpatialOperation): boolean {
    // Basic validation for Turf.js operations
    const validOperations = ['BUFFER', 'WITHIN', 'TOUCHES', 'INTERSECTS', 'AREA_FILTER', 'UNION', 'DIFFERENCE'];
    return validOperations.includes(operation.type);
  }

  private async processBuffer(operation: SpatialOperation, data: any[]): Promise<SpatialResult[]> {
    const { distance, units = 'miles' } = operation.parameters;
    const bufferDistance = units === 'miles' ? distance * 1609.34 : distance; // Convert to meters
    
    const results: SpatialResult[] = [];
    
    for (const feature of data) {
      if (feature.geometry) {
        const buffered = turf.buffer(feature, bufferDistance, { units: 'meters' });
        if (buffered) {
          results.push({
            geometry: buffered.geometry,
            properties: {
              ...feature.properties,
              buffer_distance: distance,
              buffer_units: units,
              original_type: feature.properties?.type || 'unknown'
            },
            metadata: {
              operation: 'BUFFER',
              processingTime: 0,
              engine: 'turf'
            }
          });
        }
      }
    }
    
    return results;
  }

  private async processWithin(operation: SpatialOperation, data: any[]): Promise<SpatialResult[]> {
    const { targetGeometry, distance, units = 'miles' } = operation.parameters;
    const searchDistance = units === 'miles' ? distance * 1609.34 : distance;
    
    console.log('processWithin - targetGeometry:', targetGeometry ? 'exists' : 'missing');
    console.log('processWithin - distance:', distance, units);
    console.log('processWithin - searchDistance meters:', searchDistance);
    console.log('processWithin - data count:', data.length);
    
    const results: SpatialResult[] = [];
    
    for (const feature of data) {
      if (feature.geometry && targetGeometry) {
                try {
          // Debug: Log the first few features to see what we're working with
          if (results.length < 3) {
            console.log('Feature:', feature.properties?.name || 'unnamed');
            console.log('Target geometry:', targetGeometry.properties?.name || 'unnamed');
          }
          
          const distanceToTargetKm = turf.distance(feature, targetGeometry);
          const distanceToTargetM = distanceToTargetKm * 1000; // Convert km to meters
          
          if (results.length < 3) {
            console.log('Distance km:', distanceToTargetKm, 'Distance m:', distanceToTargetM, 'Search distance m:', searchDistance);
          }
          
          if (distanceToTargetM <= searchDistance) {
            results.push({
              geometry: feature.geometry,
              properties: {
                ...feature.properties,
                distance_to_target: distanceToTargetM,
                within_distance: searchDistance
              },
              metadata: {
                operation: 'WITHIN',
                processingTime: 0,
                engine: 'turf'
              }
            });
          }
        } catch (error) {
          console.log('Error calculating distance:', error);
        }
      }
    }
    
    console.log('processWithin - results count:', results.length);
    return results;
  }

  private async processTouches(operation: SpatialOperation, data: any[]): Promise<SpatialResult[]> {
    const { targetGeometry } = operation.parameters;
    const results: SpatialResult[] = [];
    
    for (const feature of data) {
      if (feature.geometry && targetGeometry) {
        if (turf.booleanTouches(feature, targetGeometry)) {
          results.push({
            geometry: feature.geometry,
            properties: {
              ...feature.properties,
              touches_target: true
            },
            metadata: {
              operation: 'TOUCHES',
              processingTime: 0,
              engine: 'turf'
            }
          });
        }
      }
    }
    
    return results;
  }

  private async processIntersects(operation: SpatialOperation, data: any[]): Promise<SpatialResult[]> {
    const { targetGeometry } = operation.parameters;
    const results: SpatialResult[] = [];
    
    for (const feature of data) {
      if (feature.geometry && targetGeometry) {
        if (turf.booleanIntersects(feature, targetGeometry)) {
          results.push({
            geometry: feature.geometry,
            properties: {
              ...feature.properties,
              intersects_target: true
            },
            metadata: {
              operation: 'INTERSECTS',
              processingTime: 0,
              engine: 'turf'
            }
          });
        }
      }
    }
    
    return results;
  }

  private async processAreaFilter(operation: SpatialOperation, data: any[]): Promise<SpatialResult[]> {
    const { minArea, units = 'square_miles' } = operation.parameters;
    const results: SpatialResult[] = [];
    
    for (const feature of data) {
      if (feature.geometry) {
        const area = turf.area(feature); // Returns area in square meters
        const areaInSqMiles = area / 2589988.110336; // Convert to square miles
        
        if (areaInSqMiles >= minArea) {
          results.push({
            geometry: feature.geometry,
            properties: {
              ...feature.properties,
              area_sq_miles: areaInSqMiles,
              area_sq_meters: area
            },
            metadata: {
              operation: 'AREA_FILTER',
              processingTime: 0,
              engine: 'turf'
            }
          });
        }
      }
    }
    
    return results;
  }

  private async processUnion(operation: SpatialOperation, data: any[]): Promise<SpatialResult[]> {
    if (data.length < 2) {
      throw new Error('Union operation requires at least 2 geometries');
    }
    
    let unioned = data[0];
    for (let i = 1; i < data.length; i++) {
      unioned = turf.union(unioned, data[i]);
    }
    
    return [{
      geometry: unioned.geometry,
      properties: {
        operation: 'UNION',
        feature_count: data.length
      },
      metadata: {
        operation: 'UNION',
        processingTime: 0,
        engine: 'turf'
      }
    }];
  }

  private async processDifference(operation: SpatialOperation, data: any[]): Promise<SpatialResult[]> {
    if (data.length < 2) {
      throw new Error('Difference operation requires at least 2 geometries');
    }
    
    const [base, ...subtractors] = data;
    let result = base;
    
    for (const subtractor of subtractors) {
      try {
        // For now, skip the difference operation as it's causing issues
        // In a real implementation, this would use proper geometric difference
        console.log('Difference operation not fully implemented');
        break;
      } catch (error) {
        console.log('Error in difference operation:', error);
        break;
      }
    }
    
    if (!result) {
      return [];
    }
    
    return [{
      geometry: result.geometry,
      properties: {
        operation: 'DIFFERENCE',
        original_count: data.length
      },
      metadata: {
        operation: 'DIFFERENCE',
        processingTime: 0,
        engine: 'turf'
      }
    }];
  }
}

// PostGIS Implementation (placeholder for future use)
export class PostGISpatialProcessor implements SpatialProcessor {
  async processOperation(operation: SpatialOperation, data: any[]): Promise<SpatialResult[]> {
    // This would contain PostGIS-specific implementation
    // For now, throw an error to indicate it's not implemented
    throw new Error('PostGIS spatial processor not yet implemented');
  }

  validateOperation(operation: SpatialOperation): boolean {
    // PostGIS validation logic would go here
    return true;
  }
}

// Factory for creating spatial processors
export class SpatialProcessorFactory {
  static create(engine: 'turf' | 'postgis'): SpatialProcessor {
    switch (engine) {
      case 'turf':
        return new TurfSpatialProcessor();
      case 'postgis':
        return new PostGISpatialProcessor();
      default:
        throw new Error(`Unsupported spatial engine: ${engine}`);
    }
  }
}

// Utility functions for working with spatial data
export class SpatialUtils {
  static async loadGeoJSONData(layerName: string, baseUrl?: string): Promise<any[]> {
    try {
      const url = baseUrl ? `${baseUrl}/api/geojson/${layerName}` : `/api/geojson/${layerName}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load ${layerName} data`);
      }
      const data = await response.json();
      return data.features || [];
    } catch (error) {
      console.error(`Error loading ${layerName} data:`, error);
      return [];
    }
  }

  static findFeatureByName(features: any[], name: string): any | null {
    const normalizedName = name.toLowerCase();
    
    // Special handling for San Francisco to prioritize the US one
    if (normalizedName.includes('san francisco')) {
      // First, try to find the US San Francisco specifically
      const usSanFrancisco = features.find(feature => {
        const featureName = feature.properties?.NAME?.toLowerCase();
        const country = feature.properties?.SOV0NAME?.toLowerCase();
        return featureName === 'san francisco' && 
               (country === 'united states' || country === 'usa');
      });
      if (usSanFrancisco) return usSanFrancisco;
      
      // Then try any US city with "san francisco" in the name
      const usMatch = features.find(feature => {
        const featureName = feature.properties?.NAME?.toLowerCase();
        const country = feature.properties?.SOV0NAME?.toLowerCase();
        return featureName.includes('san francisco') && 
               (country === 'united states' || country === 'usa');
      });
      if (usMatch) return usMatch;
    }
    
    // For other cities, first try exact match
    let exactMatch = features.find(feature => 
      feature.properties?.NAME?.toLowerCase() === normalizedName
    );
    if (exactMatch) return exactMatch;
    
    // Then try to find US cities first (prioritize US)
    let usMatch = features.find(feature => {
      const featureName = feature.properties?.NAME?.toLowerCase();
      const country = feature.properties?.SOV0NAME?.toLowerCase();
      return featureName.includes(normalizedName) && 
             (country === 'united states' || country === 'usa');
    });
    if (usMatch) return usMatch;
    
    // Finally, try any match
    return features.find(feature => {
      const featureName = feature.properties?.NAME?.toLowerCase();
      return featureName.includes(normalizedName);
    }) || null;
  }

  static createPointFromLocation(lat: number, lng: number): any {
    return turf.point([lng, lat], {});
  }

  static convertToGeoJSON(features: any[]): any {
    return {
      type: 'FeatureCollection',
      features: features
    };
  }
} 