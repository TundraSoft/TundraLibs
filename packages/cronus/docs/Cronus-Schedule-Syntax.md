# Schedule Syntax

Cron expression fields, extensions, and matching semantics.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)

## Table of Contents

- [Fields](#fields)
- [Field syntax](#field-syntax)
- [Worked examples](#worked-examples)
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

> A step is rejected only when it exceeds a REAL span. A degenerate
> single-value span — `59/1`, `0-0/1` — is a valid explicit single
> firing; any step on it is a no-op, not an error. Only a step wider
> than an actual multi-value span (`*/60` on 0-59, `*/12` on a 1-12
> month field) throws.

## Worked examples

Every field-syntax form from the table above, proven against the
real parser:

```ts
import { parseSchedule } from '@tundralibs/cronus';

// '*' — every value in the field's range.
console.assert(parseSchedule('* * * * *').minute.size === 60);

// 'n' — exact value.
console.assert(parseSchedule('30 6 * * *').minute.has(30));

// 'a-b' — inclusive range.
console.assert(
  [...parseSchedule('9-17 * * * *').hour].join(',') ===
    '9,10,11,12,13,14,15,16,17',
);

// 'a,b,c' — list (mixes with ranges/steps in the same field).
console.assert(
  [...parseSchedule('0,15,30,45 * * * *').minute].join(',') ===
    '0,15,30,45',
);

// '*/n' — every n minutes, counting from the field's MINIMUM (0).
console.assert(
  [...parseSchedule('*/15 * * * *').minute].join(',') === '0,15,30,45',
);

// 'a/n' — every n counting from a (NOT the field minimum): 5,15,25…55.
console.assert(
  [...parseSchedule('5/10 * * * *').minute].join(',') ===
    '5,15,25,35,45,55',
);

// 'a-b/n' — every n within an explicit range.
console.assert(
  [...parseSchedule('10-20/5 * * * *').minute].join(',') === '10,15,20',
);

// Month/day NAMES — case-insensitive, resolved to their numeric value.
console.assert(
  [...parseSchedule('0 0 * jan,dec *').month].join(',') === '1,12',
);

// Day-of-week accepts BOTH 0 and 7 for Sunday — 7 folds to 0.
console.assert([...parseSchedule('0 0 * * 7').dayOfWeek].join(',') === '0');
```

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

> **The star-flag check reads the field STRING's first character, not
> whether `*` appears anywhere in it.** `*,5` and `5,*` parse to the
> IDENTICAL value set (every value in the field), but only the one
> starting with `*` counts as unrestricted — list order changes the
> matching rule, not just the values:
>
> ```ts
> import { parseSchedule } from '@tundralibs/cronus';
>
> console.assert(parseSchedule('0 0 *,5 * 1').domRestricted === false); // '*' leads → unrestricted
> console.assert(parseSchedule('0 0 5,* * 1').domRestricted === true); // '*' trails → restricted
> ```
>
> With day-of-week fixed to Monday, `0 0 *,5 * 1` fires every Monday
> (AND — day-of-month is unrestricted), while `0 0 5,* * 1` fires
> every day (OR — day-of-month is restricted, and its value set
> already covers every day, so the OR is always satisfied).

> **A field that is "restricted" (doesn't start with `*`) can still
> cover every value — and the OR rule does not know the difference.**
> `0-6` for day-of-week matches every day, exactly like `*` would, but
> because it doesn't start with `*` it still counts as restricted. Pair
> it with a restricted day-of-month under the POSIX OR rule and the
> day-of-week side is _always_ satisfied, so the expression fires
> daily — not just on the day-of-month value it looks like it's
> pinned to:
>
> ```ts
> import { matches, parseSchedule } from '@tundralibs/cronus';
>
> // Looks like "the 13th, or any day 0-6" — reads as "the 13th only"
> // at a glance, but 0-6 covers every weekday, so the OR fires daily.
> const dailyByAccident = parseSchedule('0 0 13 * 0-6');
> console.assert(matches(dailyByAccident, new Date(2026, 7, 14))); // a Friday, NOT the 13th — still fires
> ```

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

```typescript ignore
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

```typescript ignore
matches(schedule: ParsedSchedule, date: Date): boolean
```

**Example:**

```typescript
import { matches, parseSchedule } from '@tundralibs/cronus';

matches(parseSchedule('30 6 * * *'), new Date(2026, 0, 1, 6, 30)); // true
```

### `isValidSchedule()`

Validate without throwing — `true` means syntactically parseable, NOT
that the schedule will ever match a real date (`0 0 30 2 *` validates
`true` and simply never fires).

```typescript ignore
isValidSchedule(expression: string): boolean
```

**Example:**

```ts
import { isValidSchedule } from '@tundralibs/cronus';

console.assert(isValidSchedule('*/15 9-17 * * MON-FRI') === true);
console.assert(isValidSchedule('*/60 * * * *') === false); // step wider than the span
console.assert(isValidSchedule('not a cron') === false);
```

### Static conveniences

`Cronus.isValid(schedule)` and `Cronus.matches(schedule, at?)` wrap the
above for one-off checks without importing the engine functions —
useful for validating a schedule from user input without constructing
a `Cronus` instance:

```ts
import { Cronus } from '@tundralibs/cronus';

console.assert(Cronus.isValid('*/5 * * * *') === true);
console.assert(Cronus.isValid('nope') === false);
console.assert(Cronus.matches('30 6 * * *', new Date(2026, 0, 1, 6, 30)));
```

## Related Documentation

- [Cronus-Jobs](Cronus-Jobs.md) - How schedules drive job runs
- [Cronus-Errors](../errors/Cronus-Errors.md) - `InvalidScheduleError`
  context shape

---

[← Back to Cronus](../README.md)
