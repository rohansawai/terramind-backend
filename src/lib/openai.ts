import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
export interface SpatialQueryRequest {
  query: string;
  availableLayers: string[];
  context?: string;
}

export interface SpatialQueryResponse {
  sql: string;
  explanation: string;
  confidence: number;
  layers: string[];
  operation: string;
}

export interface SpatialOperationAIResult {
  operation: {
    type: string;
    parameters: Record<string, any>;
    layers: string[];
  };
  explanation: string;
  confidence: number;
}

export class SpatialAIEngine {
  private static readonly SYSTEM_PROMPT = `You are a spatial query expert that converts natural language into spatial operations for GIS systems. You can output both PostGIS SQL and structured spatial operations for Turf.js or PostGIS.

Available spatial layers:
- states: Administrative boundaries (states, provinces)
- coastline: Coastal boundaries
- cities: Populated places (cities, towns)
- rivers: River centerlines
- lakes: Lake polygons

Common spatial operations:
- WITHIN: Find features within a certain area
- BUFFER: Create a buffer around features
- INTERSECT: Find overlapping areas
- NEAR: Find features within a certain distance
- CONTAINS: Find areas containing specific features
- TOUCHES: Find features that touch a boundary
- AREA_FILTER: Find features larger than a certain area

When asked, return a JSON object with:
- operation: { type: string, parameters: object, layers: string[] }
- explanation: string
- confidence: number (0-1)

Example:
{
  "operation": {
    "type": "BUFFER",
    "parameters": { "distance": 50, "units": "miles" },
    "layers": ["coastline"]
  },
  "explanation": "Creates a 50 mile buffer around the coastline.",
  "confidence": 0.95
}
`;

  static async interpretQuery(query: string, availableLayers: string[]): Promise<SpatialOperationAIResult> {
    try {
      // Debug: Check if API key is loaded
      const apiKey = process.env.OPENAI_API_KEY;
      console.log('OpenAI API Key loaded:', apiKey ? 'Yes (length: ' + apiKey.length + ')' : 'No');
      
      if (!apiKey) {
        throw new Error('OpenAI API key not found in environment variables');
      }

      const userPrompt = `Interpret this natural language query as a spatial operation for GIS:
"${query}"

Available layers: ${availableLayers.join(', ')}

Return a JSON object with:
- operation: { type: string, parameters: object, layers: string[] }
- explanation: string
- confidence: number (0-1)`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: this.SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1000,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      // Parse the JSON response
      const parsedResponse = JSON.parse(response);
      return parsedResponse;
    } catch (error) {
      console.error('OpenAI interpretQuery error:', error);
      throw new Error('Failed to interpret query as spatial operation');
    }
  }

  static async convertToSQL(request: SpatialQueryRequest): Promise<SpatialQueryResponse> {
    try {
      const userPrompt = `Convert this natural language query to PostGIS SQL: "${request.query}"

Available layers: ${request.availableLayers.join(', ')}

Return a JSON object with:
- sql: The PostGIS SQL query
- explanation: Brief explanation of what the query does
- confidence: Confidence score (0-1)
- layers: List of layers used
- operation: Type of spatial operation (WITHIN, BUFFER, INTERSECT, etc.)`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: this.SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1000,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      // Parse the JSON response
      const parsedResponse = JSON.parse(response);
      
      return {
        sql: parsedResponse.sql,
        explanation: parsedResponse.explanation,
        confidence: parsedResponse.confidence || 0.8,
        layers: parsedResponse.layers || [],
        operation: parsedResponse.operation || 'UNKNOWN'
      };

    } catch (error) {
      console.error('OpenAI API error:', error);
      
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('401')) {
          throw new Error('OpenAI API key is invalid or expired');
        } else if (error.message.includes('429')) {
          throw new Error('OpenAI API rate limit exceeded');
        } else if (error.message.includes('500')) {
          throw new Error('OpenAI API server error');
        } else {
          throw new Error(`OpenAI API error: ${error.message}`);
        }
      }
      
      throw new Error('Failed to convert query to SQL');
    }
  }

  static async validateQuery(sql: string): Promise<boolean> {
    // Basic SQL validation - check for common PostGIS functions
    const postgisFunctions = [
      'ST_AsGeoJSON', 'ST_Buffer', 'ST_Intersects', 'ST_Within', 
      'ST_DWithin', 'ST_Contains', 'ST_Area', 'ST_Distance'
    ];
    
    return postgisFunctions.some(func => sql.includes(func));
  }
} 