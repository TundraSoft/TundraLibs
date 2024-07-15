function applyDecoratorRecursively(obj: any, decorator: Function) {
Object.keys(obj).forEach((key) => {
const isAsyncFunction =
Object.prototype.toString.call(obj[key]) === '[object AsyncFunction]';
if (typeof obj[key] === 'function') {
// Apply decorator to function
const decorated = decorator(obj, key, {
value: obj[key],
async: isAsyncFunction,
});
obj[key] = isAsyncFunction
? async (...args: any[]) => decorated.value(...args)
: (...args: any[]) => decorated.value(...args);
} else if (typeof obj[key] === 'object' && obj[key] !== null) {
// Recursively apply to nested objects
applyDecoratorRecursively(obj[key], decorator);
}
});
}

// Modified tick function to handle both async and non-async functions
function tick(
target: object,
key: string,
descriptor: { value: any; async: boolean },
): { value: any } {
const originalMethod = descriptor.value;
const name = `${target.constructor.name}::${key}`;

if (descriptor.async) {
descriptor.value = async function (...args: unknown[]) {
const st = performance.now();
const result = await originalMethod.apply(this, args);
console.log(`Async function ${name} took ${performance.now() - st}ms`);
return result;
};
} else {
descriptor.value = function (...args: unknown[]) {
const st = performance.now();
const result = originalMethod.apply(this, args);
console.log(`Function ${name} took ${performance.now() - st}ms`);
return result;
};
}

return descriptor;
}

// Example object structure
const Modules = {
Customer: {
get: async () => {
console.log('Customer get');
},
search: async () => {
console.log('Customer search');
},
Status: {
get: () => {
console.log('Customer Status get');
},
},
},
};

// Apply the decorator to all functions within the Modules object
applyDecoratorRecursively(Modules, tick);

// Now calling any function within Modules will trigger the decorator logic
Modules.Customer.get();
Modules.Customer.Status.get();
