# Schedule Syntax

Cron expression fields, extensions, and matching semantics.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Fields](#fields)
- [Field syntax](#field-syntax)
- [Day-of-month vs day-of-week (POSIX OR)](#day-of-month-vs-day-of-week-posix-or)
- [Matching semantics](#matching-semantics)
- [Examples](#examples)
- [API Reference](#api-reference)
- [Related Documentation](#related-documentation)

## Fields

Standard 5-field cron, minute resolution — seconds and years are
deliberately out of scope:

```
┌───────────── minute        (0-59)
│ ┌─────────── hour          (0-23)
│ │ ┌───────── day of month  (1-31)
│ │ │ ┌─────── month         (1-12 or JAN-DEC)
│ │ │ │ ┌───── day of week   (0-7 or SUN-SAT; 0 and 7 = Sunday)
│ │ │ │ │
* * * * *
```

## Field syntax

| Form    | Meaning                           | Example                         |
| ------- | --------------------------------- | ------------------------------- |
| `*`     | every value                       | `* * * * *` — every minute      |
| `n`     | exact value                       | `30 6 * * *` — 06:30 daily      |
| `a-b`   | inclusive range                   | `0 9-17 * * *` — hourly 9→17    |
| `a,b,c` | list (mixes with ranges/steps)    | `0,30 * * * *` — on :00 & :30   |
| `*/n`   | every `n` from the field minimum  | `*/15 * * * *` — every 15 min   |
| `a/n`   | every `n` starting at `a`         | `5/10 * * * *` — :05,:15,:25…   |
| `a-b/n` | every `n` within the range        | `10-20/5 * * * *` — :10,:15,:20 |
| names   | month/day names, case-insensitive | `0 0 * JAN mon-fri`             |

Malformed fields throw
[InvalidScheduleError](../errors/Cronus-Errors.md) at parse time —
out-of-range values, zero steps (`*/0`), steps wider than their span
(`*/60` in minutes), reversed (`5-1`) or half-open (`-5`, `5-`)
ranges, and unknown names are all rejected loudly rather than
silently mis-read. Names must be complete tokens: `JAN1` is an error,
never a silent misparse. Ranges do not wrap — use a list (`SAT,SUN`)
instead of `SAT-SUN`.

## Day-of-month vs day-of-week (POSIX OR)

When **both** day fields are restricted, a date matches if it
satisfies **either** — the standard cron rule. As in Vixie cron, a
field **beginning with `*`** (`*` or `*/n`) counts as UNrestricted:
`0 0 */2 * 1` means "every 2nd day AND Monday", while `0 0 13 * 5`
means "the 13th OR Friday":

```
0 0 13 * 5   →  midnight on the 13th OR any Friday
```

When only one is restricted, only that one applies (`0 0 15 * *` is
strictly the 15th).

## Matching semantics

- **Local time.** Matching reads the host's local wall clock
  (`getMinutes()`/`getHours()`/…), with Vixie cron's DST semantics:
  - **Fall-back** (an hour repeats): a _fixed-time_ job — minute AND
    hour both concrete, e.g. `30 1 * * *` — fires **once**, not twice;
    wildcard jobs (`* * * * *`, `*/5 …`, `30 * * * *`) keep firing
    every physical minute through the repeated hour.
  - **Spring-forward** (an hour never occurs): jobs scheduled in the
    skipped hour do not run that day (no catch-up).
- **Minute boundary.** The ticker fires at each `:00` second boundary
  and evaluates every job against that minute; there is no
  sub-minute scheduling.
- **No next-run computation.** An expression that can never match
  (e.g. `0 0 30 2 *`) parses fine and simply never fires — validity
  is syntactic, fireability is not checked.
- **Sunday.** Day-of-week accepts `0` and `7`; both fold to Sunday.

## Examples

| Expression         | Meaning                           |
| ------------------ | --------------------------------- |
| `* * * * *`        | every minute                      |
| `*/5 * * * *`      | every 5 minutes                   |
| `0 * * * *`        | hourly, on the hour               |
| `30 6 * * *`       | daily at 06:30                    |
| `0 3 * * MON`      | Mondays at 03:00                  |
| `0 9-17/2 * * 1-5` | weekdays at 09,11,13,15,17:00     |
| `0 0 1 JAN,JUL *`  | Jan 1 and Jul 1 at midnight       |
| `0 0 13 * 5`       | the 13th OR any Friday (POSIX OR) |

## API Reference

### `parseSchedule()`

Parse an expression into a `ParsedSchedule` (per-field value sets plus
restriction flags).

```typescript
parseSchedule(expression: string): ParsedSchedule
```

**Parameters:**

- `expression` - A 5-field cron expression.

**Returns:** The compiled `ParsedSchedule`.

**Throws:**

- `InvalidScheduleError` - On the wrong field count or any malformed
  field.

**Example:**

```typescript
import { parseSchedule } from '@tundralibs/cronus';

const schedule = parseSchedule('*/15 9-17 * * MON-FRI');
```

### `matches()`

Does a `Date` (local time, minute resolution) satisfy a parsed
schedule?

```typescript
matches(schedule: ParsedSchedule, date: Date): boolean
```

**Example:**

```typescript
import { matches, parseSchedule } from '@tundralibs/cronus';

matches(parseSchedule('30 6 * * *'), new Date(2026, 0, 1, 6, 30)); // true
```

### `isValidSchedule()`

Validate without throwing.

```typescript
isValidSchedule(expression: string): boolean
```

### Static conveniences

`Cronus.isValid(schedule)` and `Cronus.matches(schedule, at?)` wrap the
above for one-off checks without importing the engine functions.

## Related Documentation

- [Cronus-Jobs](Cronus-Jobs.md) - How schedules drive job runs
- [Cronus-Errors](../errors/Cronus-Errors.md) - `InvalidScheduleError`
  context shape

---

[← Back to Cronus](../README.md)
