export const rangeValidator = <T extends string | number | bigint | Date>(
  name: string,
  start: T,
  end: T,
): (value: T) => T => {
  return (value: T) => {
    if (value < start || value > end) {
      throw new Error('Out of Range');
    }
    return value;
  };
};
