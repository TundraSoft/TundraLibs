# Vaccine

Vaccine is a lightweight and flexible Dependency Injection (DI) library. Its main goal is to make "injecting" dependencies as seamless as possible.

It currently supports vials (services) as:

- Singleton - The service class (vial) is instantiated once and passed where required. This is useful for services like logging etc
- Scoped - The service class (vial) is instantiated once per "scope". This can be used to initialize a class with specific configuration, example Database
- Transient - The service class (vial) is instantiated for every instance of injection.

## Getting Started
