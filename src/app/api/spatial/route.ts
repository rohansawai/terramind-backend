import { NextRequest, NextResponse } from 'next/server';
import { SpatialProcessorFactory, SpatialUtils, SpatialOperation } from '@/lib/spatialProcessor';

export async function POST(req: NextRequest) {
  try {
    const { operation, engine = 'turf' } = await req.json();
    
    if (!operation || !operation.type) {
      return NextResponse.json(
        { error: 'Operation type is required' },
        { status: 400 }
      );
    }

    // Create spatial processor
    const processor = SpatialProcessorFactory.create(engine);
    
    // Validate operation
    if (!processor.validateOperation(operation)) {
      return NextResponse.json(
        { error: 'Invalid operation for the specified engine' },
        { status: 400 }
      );
    }

    // Load required data
    const dataPromises = operation.layers.map((layer: string) => 
      SpatialUtils.loadGeoJSONData(layer, req.nextUrl.origin)
    );
    
    const allData = await Promise.all(dataPromises);
    const flatData = allData.flat();

    // Process the operation
    const results = await processor.processOperation(operation, flatData);

    // Convert results to GeoJSON format
    const geoJSON = {
      type: 'FeatureCollection',
      features: results.map(result => ({
        type: 'Feature',
        geometry: result.geometry,
        properties: result.properties
      }))
    };

    return NextResponse.json({
      success: true,
      engine,
      operation: operation.type,
      results: geoJSON,
      metadata: {
        featureCount: results.length,
        processingEngine: engine
      }
    });

  } catch (error) {
    console.error('Spatial processing error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to process spatial operation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET endpoint to return available operations and engines
export async function GET() {
  return NextResponse.json({
    availableEngines: ['turf', 'postgis'],
    availableOperations: [
      'BUFFER',
      'WITHIN', 
      'TOUCHES',
      'INTERSECTS',
      'AREA_FILTER',
      'UNION',
      'DIFFERENCE'
    ],
    examples: [
      {
        operation: {
          type: 'BUFFER',
          parameters: { distance: 50, units: 'miles' },
          layers: ['states']
        },
        description: 'Create a 50-mile buffer around all states'
      },
      {
        operation: {
          type: 'WITHIN',
          parameters: { distance: 100, units: 'miles' },
          layers: ['cities']
        },
        description: 'Find cities within 100 miles of a point'
      }
    ]
  });
} 