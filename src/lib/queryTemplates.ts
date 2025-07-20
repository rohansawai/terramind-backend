export interface QueryTemplate {
  pattern: string;
  sql: string;
  description: string;
  layers: string[];
  operation: string;
  spatialOperation?: {
    type: 'BUFFER' | 'WITHIN' | 'TOUCHES' | 'INTERSECTS' | 'AREA_FILTER' | 'UNION' | 'DIFFERENCE';
    parameters: Record<string, any>;
  };
}

export const SPATIAL_QUERY_TEMPLATES: QueryTemplate[] = [
  {
    pattern: "coastline within {distance} miles of {location}",
    sql: `
      SELECT 
        ST_AsGeoJSON(ST_Buffer(ST_GeomFromGeoJSON(geometry), {distance} * 1609.34)) as geometry,
        'coastline_buffer' as type,
        {distance} as buffer_distance_miles
      FROM (
        SELECT geometry 
        FROM coastline 
        WHERE ST_Intersects(geometry, ST_GeomFromText('POINT({longitude} {latitude})', 4326))
      ) as coastal_area
    `,
    description: "Creates a buffer around coastline near a specific location",
    layers: ["coastline"],
    operation: "BUFFER",
    spatialOperation: {
      type: "BUFFER",
      parameters: {
        distance: "{distance}",
        units: "miles"
      }
    }
  },
  {
    pattern: "cities within {distance} miles of {location}",
    sql: `
      SELECT 
        ST_AsGeoJSON(geometry) as geometry,
        properties->>'name' as city_name,
        properties->>'pop_max' as population
      FROM cities 
      WHERE ST_DWithin(
        geometry, 
        ST_GeomFromText('POINT({longitude} {latitude})', 4326), 
        {distance} * 1609.34
      )
      ORDER BY properties->>'pop_max' DESC
    `,
    description: "Finds cities within a specified distance of a location",
    layers: ["cities"],
    operation: "WITHIN",
    spatialOperation: {
      type: "WITHIN",
      parameters: {
        distance: "{distance}",
        units: "miles",
        targetGeometry: "{location}"
      }
    }
  },
  {
    pattern: "states that border {state}",
    sql: `
      SELECT 
        ST_AsGeoJSON(s2.geometry) as geometry,
        s2.properties->>'name' as state_name
      FROM states s1, states s2
      WHERE s1.properties->>'name' ILIKE '%{state}%' 
        AND s2.properties->>'name' != s1.properties->>'name'
        AND ST_Touches(s1.geometry, s2.geometry)
    `,
    description: "Finds states that share a border with the specified state",
    layers: ["states"],
    operation: "TOUCHES",
    spatialOperation: {
      type: "TOUCHES",
      parameters: {
        targetState: "{state}"
      }
    }
  },
  {
    pattern: "rivers that flow through {state}",
    sql: `
      SELECT 
        ST_AsGeoJSON(r.geometry) as geometry,
        r.properties->>'name' as river_name,
        r.properties->>'scalerank' as importance
      FROM rivers r, states s
      WHERE s.properties->>'name' ILIKE '%{state}%'
        AND ST_Intersects(r.geometry, s.geometry)
      ORDER BY r.properties->>'scalerank' ASC
    `,
    description: "Finds rivers that intersect with the specified state",
    layers: ["rivers", "states"],
    operation: "INTERSECTS",
    spatialOperation: {
      type: "INTERSECTS",
      parameters: {
        targetState: "{state}"
      }
    }
  },
  {
    pattern: "lakes larger than {area} square miles",
    sql: `
      SELECT 
        ST_AsGeoJSON(geometry) as geometry,
        properties->>'name' as lake_name,
        ST_Area(ST_Transform(geometry, 3857)) / 2589988.110336 as area_sq_miles
      FROM lakes 
      WHERE ST_Area(ST_Transform(geometry, 3857)) / 2589988.110336 > {area}
      ORDER BY area_sq_miles DESC
    `,
    description: "Finds lakes larger than the specified area",
    layers: ["lakes"],
    operation: "AREA_FILTER",
    spatialOperation: {
      type: "AREA_FILTER",
      parameters: {
        minArea: "{area}",
        units: "square_miles"
      }
    }
  },
  {
    pattern: "intersection of {layer1} and {layer2}",
    sql: `
      SELECT 
        ST_AsGeoJSON(ST_Intersection(l1.geometry, l2.geometry)) as geometry,
        'intersection' as type
      FROM {layer1} l1, {layer2} l2
      WHERE ST_Intersects(l1.geometry, l2.geometry)
    `,
    description: "Finds the intersection between two spatial layers",
    layers: ["{layer1}", "{layer2}"],
    operation: "INTERSECTS",
    spatialOperation: {
      type: "INTERSECTS",
      parameters: {
        layer1: "{layer1}",
        layer2: "{layer2}"
      }
    }
  }
];

export function findMatchingTemplate(query: string): QueryTemplate | null {
  const normalizedQuery = query.toLowerCase();
  
  // More comprehensive pattern matching
  for (const template of SPATIAL_QUERY_TEMPLATES) {
    const pattern = template.pattern.toLowerCase();
    
    // States border queries - must include states and border (check this first)
    if (normalizedQuery.includes('states') && 
        (normalizedQuery.includes('border') || normalizedQuery.includes('borders'))) {
      return template;
    }
    
    // Coastline queries - must include coastline specifically
    if (normalizedQuery.includes('coastline') && 
        (normalizedQuery.includes('within') || normalizedQuery.includes('near')) && 
        (normalizedQuery.includes('miles') || normalizedQuery.includes('mile'))) {
      return template;
    }
    
    // Cities queries - must include cities specifically
    if (normalizedQuery.includes('cities') && 
        (normalizedQuery.includes('within') || normalizedQuery.includes('near')) && 
        (normalizedQuery.includes('miles') || normalizedQuery.includes('mile'))) {
      return template;
    }
    
    // Rivers queries - must include rivers and flow through
    if (normalizedQuery.includes('rivers') && 
        (normalizedQuery.includes('flow through') || normalizedQuery.includes('through'))) {
      return template;
    }
    
    // Lakes queries - must include lakes and size comparison
    if (normalizedQuery.includes('lakes') && 
        (normalizedQuery.includes('larger than') || normalizedQuery.includes('bigger than'))) {
      return template;
    }
    
    // Generic intersection queries
    if (normalizedQuery.includes('intersection') || 
        (normalizedQuery.includes('intersect') && normalizedQuery.includes('and'))) {
      return template;
    }
  }
  
  return null;
}

export function extractParameters(query: string, template: QueryTemplate): Record<string, any> {
  const params: Record<string, any> = {};
  
  // Extract distance
  const distanceMatch = query.match(/(\d+)\s*miles?/i);
  if (distanceMatch) {
    params.distance = parseInt(distanceMatch[1]);
  }
  
  // Extract location/state
  const locationMatch = query.match(/(?:of|near|through)\s+([A-Za-z\s]+)/i);
  if (locationMatch) {
    params.location = locationMatch[1].trim();
  }
  
  // Extract area
  const areaMatch = query.match(/(\d+)\s*square\s*miles?/i);
  if (areaMatch) {
    params.area = parseInt(areaMatch[1]);
  }
  
  return params;
}

export function createSpatialOperation(template: QueryTemplate, params: Record<string, any>) {
  if (!template.spatialOperation) {
    return null;
  }
  
  const operation = {
    type: template.spatialOperation.type,
    parameters: { ...template.spatialOperation.parameters },
    layers: template.layers
  };
  
  // Replace placeholders with actual values
  Object.keys(operation.parameters).forEach(key => {
    const value = operation.parameters[key];
    if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
      const paramName = value.slice(1, -1);
      operation.parameters[key] = params[paramName];
    }
  });
  
  return operation;
} 