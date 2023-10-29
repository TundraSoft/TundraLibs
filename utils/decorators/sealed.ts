/**
 * Decorator used to seal a class constructor and its prototype.
 *
 * @template T - The type of the class constructor.
 * @param {T} constructor - The class constructor to be sealed.
 */
export const sealed = <
  // deno-lint-ignore no-explicit-any
  T extends { new (...args: any[]): {} },
>(constructor: T) => {
  /* Seal the constructor */
  Object.seal(constructor);
  /* Seal the constructor prototype */
  Object.seal(constructor.prototype);
};

/**
 * A simple class for a Point object with x and y coordinates.
*/
@sealed
class Point {
  /**
   * The x coordinate of the point.
   */
  public x: number;
  
  /**
   * The y coordinate of the point.
   */
  public y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

class D extends Point {
  color: string;

  constructor(x: number, y: number, color: string) {
    super(x, y);
    this.color = color;
  }
}

const p1 = new D(5, 10, 'red');
console.log(p1); // Output: Point { x: 5, y: 10 }

