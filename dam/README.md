const a: ExpressionFunction = {
NOW: () => 'NOW()',
CURRENT_DATE: () => 'CURRENT_DATE()',
CURRENT_TIME: () => 'CURRENT_TIME()',
CURRENT_TIMESTAMP: () => 'CURRENT_TIMESTAMP()',
DATE_ADD: (a, b, c) => 'DATE_ADD()',
ABS: (a) => 'ABS()',
ADD: (a, b) => 'ADD()',
CEIL: (a) => 'CEIL()',
DATE_DIFF: (a, b, c) => 'DATE_DIFF()',
DIV: (a, b) => 'DIV()',
FLOOR: (a) => 'FLOOR()',
LENGTH: (a) => 'LENGTH()',
MOD: (a, b) => 'MOD()',
MUL: (a, b) => 'MUL()',
SUB: (a, b) => 'SUB()',
JSON_VALUE: (a, b) => 'JSON_VALUE()',
UUID: () => 'UUID()',
CONCAT: (a, b) => 'CONCAT()',
LOWER: (a) => 'LOWER()',
UPPER: (a) => 'UPPER()',
TRIM: (a) => 'TRIM()',
REPLACE: (a, b, c) => 'REPLACE()',
SUBSTR: (a, b, c) => {console.log(a); return 'SUBSTRING()'},
}

a.SUBSTR('dfsdf', 1, 2);

#### ColumnIdentifier

Column identifier is a representation of a column in a query object/builder. It is identifier by a `$` sign at the start.
This becomes useful when dealing with complex items such as expression, filters, aggregation etc as it helps differentiating between
plain string and a column representation. To identify columns part of join, the Alias name for the join should be used along with column.
example if the table alias is JOIN_TABLE and column name is Id then it can be represented as `$JOIN_TABLE.$Id`.

_NOTES_

- Columns in a join condition, $MAIN can be added to identify the main table. If no alias prefix present it will assume column to be part of main table.
- In assert (validation) both column name and expression names are passed as column names for validation

#### Aggregate

Aggregation is represented using a JSON object. Currently the aggregation is limited to SUM, MIN, MAX, AVG, COUNT and DISTINCT.
Columns of Expressions can also be used but is limited to SUM, MIN, MAX and AVG (number and date expression only). COUNT is
the only aggregate where a sub aggregate can be passed viz DISTINCT. Below table represents the allowed items

| Aggregate | Inputs                                               | Limitation                                                                                                           |
| --------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| SUM       | ColumnIdentifier, Number Expression                  | Any column irrespective of type can be used. but limits number expression                                            |
| AVG       | ColumnIdentifier, Number Expression                  | Any column irrespective of type can be used. but limits expression to number                                         |
| MIN       | ColumnIdentifier, Number Expression, Date Expression | Any column irrespective of type can be used. but limits expression to Date and number                                |
| MAX       | ColumnIdentifier, Number Expression, Date Expression | Any column irrespective of type can be used. but limits expression to Date and number                                |
| DISTINCT  | ColumnIdentifier                                     | Any column irrespective of type can be used.                                                                         |
| COUNT     | ColumnIdentifier, '*', Distinct Aggregate            | Any column irrespective of type can be used. * can be passed for all columns or sub aggregate DISTINCT can be passed |

#### Expressions

Expressions are basically representation of SQL Functions. These can be used to perform complex operations on the data. In most dialects, they are translated
to respective query function. However, in some cases where the function is not available it is ignored. Below table represents list of expressions supported
and their limitations

| Type   | Expression | Inputs | Notes          |
| ------ | ---------- | ------ | -------------- |
| String | UUID       | N/A    | Generated UUID |
| String | SUBSTR     |        |                |
