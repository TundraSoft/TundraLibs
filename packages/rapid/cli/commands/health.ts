/**
 * @fileoverview `rapid health [url] [--path /health]` — hit a running
 * app's health path and report; exit 0 on 2xx, 1 otherwise. A CI/ops smoke.
 * @module
 */

/** The `health` command. Returns the process exit code. */
export async function healthCommand(
  url: string,
  opts: { path?: string } = {},
): Promise<number> {
  // Parsed INSIDE the try: a scheme-less `localhost:3000` is a TypeError from
  // the URL constructor, and it must print like any other probe failure.
  let target = `${url}${opts.path ?? '/healthz'}`;
  try {
    target = new URL(opts.path ?? '/healthz', url).href;
    const res = await fetch(target);
    // The body is remote-controlled — collapse control characters so a
    // crafted response cannot forge extra log lines.
    const body = (await res.text()).replace(/[\r\n\t]+/g, ' ');
    const ok = res.status >= 200 && res.status < 300;
    console.log(`${ok ? '✓' : '✗'} ${target} → ${res.status} ${body}`.trim());
    return ok ? 0 : 1;
  } catch (error) {
    console.error(
      `✗ ${target} → ${error instanceof Error ? error.message : error}`,
    );
    return 1;
  }
}
