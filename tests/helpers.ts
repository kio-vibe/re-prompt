import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function fixturePath(name: string): string {
  return join(here, "fixtures", "codex", name);
}

export async function readFixture(name: string): Promise<string> {
  return readFile(fixturePath(name), "utf8");
}
