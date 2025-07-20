import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const LAYER_MAP: Record<string, string> = {
  states: 'ne_10m_admin_1_states_provinces.json',
  coastline: 'ne_10m_coastline.json',
  cities: 'ne_10m_populated_places.json',
  rivers: 'ne_10m_rivers_lake_centerlines.json',
  lakes: 'ne_10m_lakes.json',
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ layer: string }> }
) {
  const { layer } = await params;
  const fileName = LAYER_MAP[layer];
  if (!fileName) {
    return NextResponse.json({ error: 'Layer not found' }, { status: 404 });
  }
  const filePath = path.join(process.cwd(), 'data', fileName);
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return new NextResponse(data, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 });
  }
} 