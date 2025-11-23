import { createClient } from 'db-vendo-client';
// @ts-ignore
import { profile as dbnavProfile } from 'db-vendo-client/p/dbnav/index.js';
import type { NextApiRequest, NextApiResponse } from 'next';

const client = createClient(dbnavProfile, 'split-ticketing-app');

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { query } = req.query;

  if (!query || typeof query !== 'string' || query.length < 2) {
    return res.status(400).json({ message: 'Query must be at least 2 characters' });
  }

  try {
    const locations = await client.locations(query, { results: 5 });
    // Filter to only keep stations/stops to avoid addresses if possible, or just return all
    // The client.locations returns various types. Let's prefer stations.
    const stations = locations.filter((l: any) => l.type === 'station' || l.type === 'stop');
    
    res.status(200).json(stations);
  } catch (error: any) {
    console.error('Locations error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
