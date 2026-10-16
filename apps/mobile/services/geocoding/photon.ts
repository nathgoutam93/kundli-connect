import { type Geocoder, type PlaceResult } from '@/services/geocoding/types';

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    osm_value?: string;
    name?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    country?: string;
  };
};

/** Broad areas make poor birthplaces; they're shown only if nothing more specific matches. */
const BROAD_PLACE_TYPES = new Set(['continent', 'country', 'state', 'region', 'province']);

function toPlace(feature: PhotonFeature): (PlaceResult & { broad: boolean }) | null {
  const [longitude, latitude] = feature.geometry?.coordinates ?? [];
  const props = feature.properties ?? {};
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !props.name) {
    return null;
  }

  const parts: string[] = [];
  for (const part of [props.name, props.city, props.state, props.country]) {
    if (part && !parts.includes(part)) {
      parts.push(part);
    }
  }

  return {
    id: `${props.osm_type ?? 'X'}${props.osm_id ?? `${latitude},${longitude}`}`,
    label: parts.join(', '),
    latitude,
    longitude,
    broad: BROAD_PLACE_TYPES.has(props.osm_value ?? ''),
  };
}

/**
 * Photon (komoot), an OpenStreetMap geocoder built for search-as-you-type. The public server is
 * free and needs no key but is fair-use, so callers should debounce; point `baseUrl` at a
 * self-hosted Photon for heavy traffic.
 */
export function createPhotonGeocoder(baseUrl: string, fetcher: typeof fetch = fetch): Geocoder {
  const cache = new Map<string, PlaceResult[]>();

  return {
    attribution: 'Place search by Photon · © OpenStreetMap contributors',
    async search(query, signal) {
      const key = query.trim().toLowerCase();
      const cached = cache.get(key);
      if (cached) {
        return cached;
      }

      const params = new URLSearchParams({ q: query.trim(), limit: '8', lang: 'en', osm_tag: 'place' });
      const response = await fetcher(`${baseUrl.replace(/\/$/, '')}/api/?${params.toString()}`, { signal });
      if (!response.ok) {
        throw new Error(`Place search failed (${response.status}).`);
      }
      const data = (await response.json()) as { features?: PhotonFeature[] };
      const places = (data.features ?? []).map(toPlace).filter((place): place is NonNullable<typeof place> => place !== null);
      const specific = places.filter((place) => !place.broad);
      const results = (specific.length > 0 ? specific : places)
        .filter((place, index, all) => all.findIndex((other) => other.label === place.label) === index)
        .slice(0, 5)
        .map(({ broad: _broad, ...place }) => place);

      if (cache.size > 50) {
        cache.clear();
      }
      cache.set(key, results);
      return results;
    },
  };
}
