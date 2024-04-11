export const isValidName = (name: string, dbName = false) => {
  if (dbName) {
    return /^[a-z][a-z0-9\_\-]*$/i.test(name);
  } else {
    return /^[a-z][a-z0-9]*$/i.test(name);
  }
};
