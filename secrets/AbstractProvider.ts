export abstract class AbstractProvider {
  constructor() {
    Object.prototype.toString = () => {
      return 'sdf'
    }
  }
  public toString(): string {
    console.log('sdf')
    return '<PROTECTED>'
  }
}