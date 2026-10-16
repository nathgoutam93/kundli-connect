// deno-lint-ignore-file no-explicit-any require-await -- minimal async fake standing in for Supabase Storage
import { removeUserFolder } from "../_shared/storage.ts";

/** In-memory bucket: list() returns up to `limit` names under a folder, remove() deletes paths. */
function fakeStorage(files: string[]) {
  const store = new Set(files);
  const removedBatches: string[][] = [];
  const client: any = {
    storage: {
      from: () => ({
        list: async (folder: string, options: { limit: number }) => ({
          data: [...store].filter((path) => path.startsWith(`${folder}/`)).slice(0, options.limit)
            .map((path) => ({ name: path.slice(folder.length + 1) })),
          error: null,
        }),
        remove: async (paths: string[]) => {
          removedBatches.push(paths);
          paths.forEach((path) => store.delete(path));
          return { data: null, error: null };
        },
      }),
    },
  };
  return { client, store, removedBatches };
}

Deno.test("removes every file in the user's folder, across pages, and nothing else", async () => {
  const mine = Array.from({ length: 230 }, (_, index) => `user-1/${index}.jpg`);
  const { client, store, removedBatches } = fakeStorage([...mine, "user-2/keep.jpg"]);

  const removed = await removeUserFolder(client, "profile-photos", "user-1");

  if (removed !== 230) throw new Error(`removed ${removed}`);
  if (removedBatches.length !== 3) throw new Error(`expected 3 batches, got ${removedBatches.length}`);
  if (store.size !== 1 || !store.has("user-2/keep.jpg")) throw new Error(`left behind: ${[...store]}`);
});

Deno.test("an empty folder is a no-op", async () => {
  const { client, removedBatches } = fakeStorage(["someone-else/a.png"]);
  if ((await removeUserFolder(client, "kundli-charts", "user-1")) !== 0) throw new Error("removed something");
  if (removedBatches.length) throw new Error("called remove");
});
