import { NextRequest, NextResponse } from 'next/server';
import { SpatialAIEngine } from '@/lib/openai';
import { SpatialUtils } from '@/lib/spatialProcessor';

const AVAILABLE_LAYERS = ['states', 'coastline', 'cities', 'rivers', 'lakes'];

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    console.log('ENV KEY:', process.env.OPENAI_API_KEY);
    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required and must be a string' },
        { status: 400 }
      );
    }

    // Always use the AI engine to interpret the query
    const aiResult = await SpatialAIEngine.interpretQuery(query, AVAILABLE_LAYERS);
    if (!aiResult || !aiResult.operation) {
      return NextResponse.json(
        { error: 'AI could not interpret the query.' },
        { status: 400 }
      );
    }

    // Map NEAR to WITHIN for compatibility
    if (aiResult.operation.type === 'NEAR') {
      aiResult.operation.type = 'WITHIN';
    }

    // Log AI parameters for debugging
    console.log('AI operation parameters:', aiResult.operation.parameters);

    // Validate and cast the operation type
    const validOperationTypes = ['BUFFER', 'WITHIN', 'TOUCHES', 'INTERSECTS', 'AREA_FILTER', 'UNION', 'DIFFERENCE'] as const;
    if (!validOperationTypes.includes(aiResult.operation.type as any)) {
      return NextResponse.json(
        { error: `Invalid operation type: ${aiResult.operation.type}` },
        { status: 400 }
      );
    }

    let spatialOperation = {
      type: aiResult.operation.type as 'BUFFER' | 'WITHIN' | 'TOUCHES' | 'INTERSECTS' | 'AREA_FILTER' | 'UNION' | 'DIFFERENCE',
      parameters: aiResult.operation.parameters,
      layers: aiResult.operation.layers
    };

    // If WITHIN and targetGeometry is a string, look up the city in the cities layer
    let cityName: string | undefined = undefined;
    if (spatialOperation.type === 'WITHIN') {
      if (typeof spatialOperation.parameters.targetGeometry === 'string') {
        cityName = spatialOperation.parameters.targetGeometry;
      } else if (typeof spatialOperation.parameters.location === 'string') {
        cityName = spatialOperation.parameters.location;
      }
      if (cityName) {
        // Load cities data
        const citiesData = await SpatialUtils.loadGeoJSONData('cities', req.nextUrl.origin);
        
        // Debug: Check what San Francisco cities are available
        const sanFranciscoCities = citiesData.filter(city => 
          city.properties?.name?.toLowerCase().includes('san francisco') ||
          city.properties?.NAME?.toLowerCase().includes('san francisco')
        ).slice(0, 5); // Show first 5
        
        console.log('Available cities:', sanFranciscoCities.map(city => ({
          name: city.properties?.name || city.properties?.NAME,
          country: city.properties?.country || city.properties?.COUNTRY,
          coords: city.geometry.coordinates
        })));
        
        const cityFeature = SpatialUtils.findFeatureByName(citiesData, cityName);
        
        // Debug: Log what city was found
        if (cityFeature) {
          console.log('Found city:', cityFeature.properties?.name, 'Country:', cityFeature.properties?.country, 'Coordinates:', cityFeature.geometry.coordinates);
          spatialOperation.parameters.targetGeometry = cityFeature;
        } else {
          return NextResponse.json(
            { error: `Could not find city: ${cityName}` },
            { status: 400 }
          );
        }
      }
    }

    // Load required data for the layers
    const dataPromises = spatialOperation.layers.map((layer: string) => 
      SpatialUtils.loadGeoJSONData(layer, req.nextUrl.origin)
    );
    const data = (await Promise.all(dataPromises)).flat();
    
    console.log('Loaded data count:', data.length);
    console.log('Spatial operation:', spatialOperation);

    // Run the spatial operation using Turf.js
    const processor = new (await import('@/lib/spatialProcessor')).TurfSpatialProcessor();
    const results = await processor.processOperation(spatialOperation, data);
    
    console.log('Spatial results count:', results.length);

    return NextResponse.json({
      success: true,
      method: 'ai',
      operation: spatialOperation.type,
      explanation: aiResult.explanation || '',
      confidence: aiResult.confidence || 1.0,
      layers: spatialOperation.layers,
      parameters: spatialOperation.parameters,
      results,
    });
  } catch (error) {
    console.error('Query API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

// GET endpoint to return available layers and examples
export async function GET() {
  return NextResponse.json({
    availableLayers: AVAILABLE_LAYERS,
    examples: [
      "coastline within 15 miles of California",
      "cities within 50 miles of San Francisco", 
      "states that border Texas",
      "rivers that flow through Colorado",
      "lakes larger than 100 square miles"
    ]
  });
} 