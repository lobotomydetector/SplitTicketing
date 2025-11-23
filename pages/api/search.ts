import { createClient } from "db-vendo-client";
// @ts-ignore
import { profile as dbnavProfile } from "db-vendo-client/p/dbnav/index.js";
import type { NextApiRequest, NextApiResponse } from "next";

const client = createClient(dbnavProfile, "split-ticketing-app");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { from, to, date, fromId, toId } = req.query;

  if ((!from && !fromId) || (!to && !toId)) {
    return res.status(400).json({ message: 'Missing from/to parameters' });
  }

  try {
    // Resolve locations if they look like names or use IDs
    let fromStation: { id: string; name: string } | undefined;
    let toStation: { id: string; name: string } | undefined;

    if (fromId) {
        // If ID is provided, we can construct the station object or fetch it.
        // client.journeys needs station IDs.
        // We can just pass the ID if we don't need the name for display immediately,
        // but we return `from` and `to` objects in the response.
        // Let's assume we can just use the ID.
        // However, for the response `from: fromStation`, we might want the name.
        // We can fetch location by ID or just trust the client provided name if we had it.
        // But `req.query` has `from` name too.
        fromStation = { id: fromId as string, name: from as string || fromId as string };
    } else {
        const fromLocations = await client.locations(from as string, { results: 1 });
        fromStation = fromLocations[0];
    }

    if (toId) {
        toStation = { id: toId as string, name: to as string || toId as string };
    } else {
        const toLocations = await client.locations(to as string, { results: 1 });
        toStation = toLocations[0];
    }

    if (!fromStation || !toStation) {
      return res.status(404).json({ message: 'Station not found' });
    }

    const departureDate = date ? new Date(date as string) : new Date();

    const journeys = await client.journeys(fromStation.id, toStation.id, {
      departure: departureDate,
      results: 2, // Limit to top 2 results for performance
      stopovers: true,
    });

    console.log(`Found ${journeys.journeys?.length} journeys`);

    if (!journeys.journeys || journeys.journeys.length === 0) {
      return res.status(404).json({ message: 'No journey found' });
    }

    // Process journeys in parallel
    const results = await Promise.all(journeys.journeys.map(async (journey: any) => {
        const directPrice = journey.price?.amount || null;
        const splitOptions: any[] = [];

        // Identify candidates: Transfer stations first, then intermediate stops
        const candidates: any[] = [];
        const seenStationIds = new Set<string>();

        // 1. Add Transfer Stations (destinations of all legs except the last one)
        if (journey.legs && journey.legs.length > 1) {
            for (let i = 0; i < journey.legs.length - 1; i++) {
                const leg = journey.legs[i];
                if (leg.destination && !seenStationIds.has(leg.destination.id)) {
                    candidates.push({
                        id: leg.destination.id,
                        name: leg.destination.name,
                        isTransfer: true
                    });
                    seenStationIds.add(leg.destination.id);
                }
            }
        }

        // 2. Add Intermediate Stops if we need more candidates (limit to 3 total)
        // Extract all stops from the journey
        let allStops: any[] = [];
        if (journey.legs) {
          for (const leg of journey.legs) {
            if (leg.stopovers) {
              allStops = allStops.concat(leg.stopovers);
            }
          }
        }

        if (allStops.length > 0 && candidates.length < 3) {
          const step = Math.max(1, Math.floor(allStops.length / 4));
          for (let i = step; i < allStops.length - 1; i += step) {
            if (candidates.length < 3) {
                const stop = allStops[i].stop;
                if (!seenStationIds.has(stop.id)) {
                    candidates.push({
                        id: stop.id,
                        name: stop.name,
                        isTransfer: false
                    });
                    seenStationIds.add(stop.id);
                }
            }
          }
        }

        // Check prices for candidates in parallel
        const candidatePromises = candidates.map(async (station) => {
            try {
                // Leg 1: Origin -> Stop
                const leg1Journeys = await client.journeys(fromStation!.id, station.id, {
                    departure: new Date(journey.legs[0].departure),
                    results: 1,
                });
                const leg1 = leg1Journeys.journeys[0];
                const price1 = leg1?.price?.amount;

                if (!price1) return null;

                // Leg 2: Stop -> Destination
                // For transfers, we should ideally use the departure time of the next leg from the original journey
                // to ensure a valid connection.
                let departureFromSplit;
                
                if (station.isTransfer) {
                    // Find the leg that starts at this station
                    const nextLeg = journey.legs.find((l: any) => l.origin.id === station.id);
                    if (nextLeg) {
                        departureFromSplit = new Date(nextLeg.departure);
                    } else {
                         // Fallback
                         departureFromSplit = new Date(leg1.legs[leg1.legs.length - 1].arrival);
                    }
                } else {
                    // Intermediate stop
                    const stopInJourney = allStops.find(s => s.stop.id === station.id);
                    departureFromSplit = stopInJourney ? new Date(stopInJourney.departure || stopInJourney.plannedDeparture) : new Date();
                }

                const leg2Journeys = await client.journeys(station.id, toStation!.id, {
                    departure: departureFromSplit,
                    results: 1,
                });
                const leg2 = leg2Journeys.journeys[0];
                const price2 = leg2?.price?.amount;

                if (!price2) return null;

                const totalPrice = price1 + price2;
                
                return {
                    splitStation: station,
                    price1,
                    price2,
                    totalPrice,
                    savings: directPrice ? directPrice - totalPrice : 0,
                    leg1: leg1,
                    leg2: leg2,
                    isCheaper: directPrice ? totalPrice < directPrice : false
                };

            } catch (e) {
                console.error(`Error checking split at ${station.name}`, e);
                return null;
            }
        });

        const candidateResults = await Promise.all(candidatePromises);
        
        // Filter out nulls and add to splitOptions
        candidateResults.forEach(r => {
            if (r) splitOptions.push(r);
        });

        // Sort by savings
        splitOptions.sort((a, b) => b.savings - a.savings);

        return {
            journey,
            directPrice,
            splitOptions
        };
    }));

    res.status(200).json({
      from: fromStation,
      to: toStation,
      results
    });
  } catch (error: any) {
    console.error("Search error:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
}
