/** A place someone can pick as their birthplace. */
export type PlaceResult = {
  id: string;
  /** Full label shown in the list and saved as the birth place, e.g. "Lucknow, Uttar Pradesh, India". */
  label: string;
  latitude: number;
  longitude: number;
};

/** Place search provider. Swap implementations in services/geocoding/index.ts. */
export type Geocoder = {
  search: (query: string, signal?: AbortSignal) => Promise<PlaceResult[]>;
  /** Credit line the provider's data licence requires, shown under the search field. */
  attribution: string;
};
