# norm - Not a Object Relation Mapping
norm is meant to be a quick and easy way to interact with database objects without handling the fuss of 
relationship mapping and complex joins but still giving the benifits of db objects to strongly typed objects.
Its core principles are basis the MicroServices strategy where each "norm" object interacts with only one 
table and no more. It will handle the CRUD operations, removing the need for hardcoding sql statements in 
most scenarios, thereby giving the option to switch between databases.

## Core Features
- Dynamic SQL generator (simple)
- Perform CRUD operations
- Handle basic SQL securities (Injection attacks etc)
- Data validations - Custom and standard, example unique key validation, regex validation etc
- Interopability - example handle uuid generation in non supported databases
- Data encryption - encrypt & decrypt data on the fly
- Migration* -- This is planned and in hopeful stage.

