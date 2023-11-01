function debounce(milliseconds: number) {
  return function (
    target: unknown,
    key: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    let timeoutId: number;
    let lastCallTime: number;

    descriptor.value = function (...args: unknown[]) {
      const currentTime = Date.now();

      if (lastCallTime && currentTime - lastCallTime < milliseconds) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          lastCallTime = currentTime;
          originalMethod.apply(this, args);
        }, milliseconds);
      } else {
        lastCallTime = currentTime;
        originalMethod.apply(this, args);
      }
    };

    return descriptor;
  };
}

class A {
  @debounce(5000)
  public doThis() {
    console.log('doThis');
  }
}

const ad = new A();

ad.doThis();
ad.doThis();
ad.doThis();
