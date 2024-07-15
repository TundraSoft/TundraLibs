export const simpleId = (seed = 0, minLen = 4): () => bigint => {
  let dt = new Date();
  let dtno = `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${
    String(dt.getDate()).padStart(2, '0')
  }`;
  return () => {
    if (dt.getDate() !== new Date().getDate()) {
      dt = new Date();
      dtno = `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${
        String(dt.getDate()).padStart(2, '0')
      }`;
      seed = 0;
    }
    seed++;
    const cnt = String(seed).padStart(minLen, '0');
    return BigInt(
      `${dtno}${cnt}`,
    );
  };
};
