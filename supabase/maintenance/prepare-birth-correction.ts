import { birthCorrectionSql, prepareBirthCorrection } from '../functions/_shared/birth-correction.ts';

// Offline preparation only: no database credentials, network requests or environment access.
if (import.meta.main) {
  try {
    const [input, output, ...extra] = Deno.args;
    if (!input || !output || extra.length) throw new Error('Usage: prepare-birth-correction.ts <private-input.json> <new-private-output.sql>');
    const artifact = prepareBirthCorrection(JSON.parse(await Deno.readTextFile(input)));
    const file = await Deno.open(output, { write:true,createNew:true,mode:0o600 });
    try {
      const bytes = new TextEncoder().encode(birthCorrectionSql(artifact));
      for (let offset=0; offset<bytes.length;) offset += await file.write(bytes.subarray(offset));
    } finally { file.close(); }
    console.log('Prepared a private dry-run script. No database changes made.');
  } catch (error) {
    console.error(error instanceof SyntaxError ? 'Input is not valid JSON.' : error instanceof Error ? error.message : 'Preparation failed.');
    Deno.exit(1);
  }
}
