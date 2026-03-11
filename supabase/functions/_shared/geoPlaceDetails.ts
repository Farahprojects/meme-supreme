/**
 * Server-side geo helpers: fetch Place Details by place_id and write to geo_cache.
 * Used by initiate-auth-report to resolve lat/lng when client sends place_id only.
 * geo_cache is write-only; we never read from it for the payload.
 */

const GOOGLE_PLACE_DETAILS_FIELDS = "geometry,name";

export interface PlaceDetailsResult {
  lat: number;
  lng: number;
  name?: string;
}

/**
 * Fetch lat/lng (and name) from Google Place Details API by place_id.
 * Returns null on error or non-OK status.
 */
export async function fetchPlaceDetailsByPlaceId(
  placeId: string,
  apiKey: string
): Promise<PlaceDetailsResult | null> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&key=${apiKey}&fields=${GOOGLE_PLACE_DETAILS_FIELDS}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.status !== "OK" || !data.result?.geometry?.location) return null;
    const loc = data.result.geometry.location;
    return {
      lat: loc.lat,
      lng: loc.lng,
      name: data.result.name ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget write to geo_cache. Do not await in caller.
 * Uses upsert on place_id so duplicate place_ids update instead of failing.
 */
export function writeGeoCache(
  supabase: {
    from: (table: string) => {
      upsert: (row: object, opts?: { onConflict?: string }) => { then: (fn: (r: { error: unknown }) => void) => void };
    };
  },
  placeId: string,
  placeName: string,
  lat: number,
  lon: number
): void {
  supabase
    .from("geo_cache")
    .upsert({ place_id: placeId, place: placeName, lat, lon }, { onConflict: "place_id" })
    .then(({ error }: { error: unknown }) => {
      if (error) console.error("[geoPlaceDetails] geo_cache upsert failed:", error);
    });
}
