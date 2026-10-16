import { createPhotonGeocoder } from '@/services/geocoding/photon';

export type { Geocoder, PlaceResult } from '@/services/geocoding/types';

/**
 * The place search used for birthplaces. Photon's public server by default; set
 * EXPO_PUBLIC_PHOTON_URL to a self-hosted Photon, or swap in another Geocoder here.
 */
export const geocoder = createPhotonGeocoder(process.env.EXPO_PUBLIC_PHOTON_URL || 'https://photon.komoot.io');
