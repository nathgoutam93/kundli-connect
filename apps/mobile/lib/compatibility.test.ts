import { realCompatibility } from './compatibility';

test('absent or incomplete reports stay absent', () => {
  for (const value of [null,undefined,{}, { overallScore: 87 }, { id: 'r', generatedAt: 'bad', overallScore: 87 }]) {
    expect(realCompatibility(value)).toBeNull();
  }
});

test('a genuine zero score survives and missing details are never invented', () => {
  expect(realCompatibility({ id: 'real', generatedAt: '2026-10-16T00:00:00Z', overallScore: 0 }))
    .toMatchObject({ overallScore: 0, breakdown: [], yogas: [], doshas: [] });
});
