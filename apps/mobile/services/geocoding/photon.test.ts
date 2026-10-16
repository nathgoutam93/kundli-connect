import { createPhotonGeocoder } from '@/services/geocoding/photon';

function feature(name: string, value: string, extra: Record<string, unknown> = {}, coordinates: [number, number] = [80.94, 26.84]) {
  return { geometry: { coordinates }, properties: { osm_id: name.length, osm_type: 'N', osm_value: value, name, ...extra } };
}

function fakeFetch(features: unknown[]) {
  return jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ features }) })) as unknown as typeof fetch;
}

describe('Photon geocoder', () => {
  it('builds readable labels with coordinates, preferring towns over whole states', async () => {
    const fetcher = fakeFetch([
      feature('Uttar Pradesh', 'state', { country: 'India' }),
      feature('Lucknow', 'city', { state: 'Uttar Pradesh', country: 'India' }),
      feature('Lucknow', 'city', { state: 'Uttar Pradesh', country: 'India' }),
    ]);
    const geocoder = createPhotonGeocoder('https://photon.example/', fetcher);

    const results = await geocoder.search(' Lucknow ');

    expect(results).toEqual([{ id: 'N7', label: 'Lucknow, Uttar Pradesh, India', latitude: 26.84, longitude: 80.94 }]);
    const url = (fetcher as jest.Mock).mock.calls[0][0] as string;
    expect(url).toBe('https://photon.example/api/?q=Lucknow&limit=8&lang=en&osm_tag=place');
  });

  it('caches repeat queries so typing back and forth stays within fair use', async () => {
    const fetcher = fakeFetch([feature('Pune', 'city', { country: 'India' })]);
    const geocoder = createPhotonGeocoder('https://photon.example', fetcher);
    await geocoder.search('Pune');
    await geocoder.search('pune');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reports server errors', async () => {
    const fetcher = jest.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(createPhotonGeocoder('https://photon.example', fetcher).search('Delhi')).rejects.toThrow('429');
  });
});
