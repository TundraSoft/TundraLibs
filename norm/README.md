# NORM

NORM is not really an ORM but an ORM which helps in querying with various Databases. It tries to stick to
the config driven approach instead of creation of classes to manage Models.

Aim is not to replace SQL but to make the entire process of building applications faster, easier and cross
database compatible. Aggregations and limited sql functionalities are supported via DAM.

Last note, Norm and DAM may support multiple databases and even support switching between them seamlessly,
that does not mean one should use this to "migrate" between databases!

## Usage

## Limitations

---

checker - Validate model definition

composer - Compose multiple definition to single definition along with type

migrator - Generate SQL files & diff

modeller - The data model linked to DAM
-- validator - Object validator
-- processor - Encrypt/Decrypt/Hash/pre & post processor
-- generator - Default generators
-- auditor - history table generator

reporter - Auto report generation utility

exporter - Export data as csv, tsv etc
