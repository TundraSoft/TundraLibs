export const lovValidator = <T extends string | number | bigint | Date>(
  name: string,
  lov: T[],
): (value: T) => T => {
  return (value: T) => {
    if (!lov.includes(value)) {
      throw new Error('Out of range');
    }
    return value;
  };
};
