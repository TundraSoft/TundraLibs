export const getFreePort = (min = 1024, max = 65535): number => {
  if (max < min) {
    throw new RangeError('Invalid range');
  }
  while (true) {
    const port = Math.floor(Math.random() * (max - min + 1)) + min;
    try {
      const listener = Deno.listen({ port });
      listener.close();
      return port;
    } catch {
      continue;
    }
  }
};
