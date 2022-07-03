import { path } from "../dependencies.ts";

export async function parseENV(location = "./") {
  const env: Map<string, string> = new Map();
  try {
    const file = path.join(location, ".env"),
      data = new TextDecoder().decode(await Deno.readFile(file)),
      lines = data.split("\n"),
      pattern = new RegExp(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/),
      isQuoted = new RegExp(/^'|"[^\1].*(\1)$/);
    lines.forEach((line) => {
      if (pattern.test(line)) {
        const record = line.match(pattern),
          [_, key, value] = record as string[];
        env.set(
          key,
          (((isQuoted.test(value)) ? value.slice(1, -1) : value) || "").trim(),
        );
      }
    });
  } catch {
    // Suppress error
  }
  return env;
}
