# CLA-0051: Database names are lowercase snake_case, set by convention

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** data-and-migrations
- **Enforced by:** the naming convention on every module context; architecture tests (identifier length, column suffixes); reviewer

## Context

The existing apps used EF Core's default names. PostgreSQL stores these as quoted PascalCase identifiers, such as `"OrderLines"` and `"CreatedAtUtc"`. PostgreSQL folds unquoted names to lowercase, so every hand-written query and every migration SQL (CLA-0012) must quote them. Table names drifted between plural and singular. PostgreSQL cut one generated foreign key name short with a `~` because it passed the 63-byte limit.

## Decision

- **Every identifier is lowercase `snake_case`, and none is quoted.** Every module DbContext calls `UseSnakeCaseNamingConvention()` from `EFCore.NamingConventions`. Tables, columns, keys, foreign keys and indexes get their names from the convention, never from hand-written `ToTable` or `HasColumnName` calls.
- **Schemas** use the module's name in snake_case: `<Root>.Modules.OrderHistory` owns `order_history` (CLA-0007).
- **Tables** are plural nouns from the module's ubiquitous language (CLA-0041), such as `orders` and `order_lines`. They have no prefixes such as `tbl_`, and they do not repeat the schema's name.
- **Keys:**
  - The primary key column is `id`.
  - A reference to another row is `<thing>_id`, such as `order_id`.
  - Inside a module, a reference has a foreign key. Across modules, it is an id only, with no foreign key (CLA-0007).
- **Columns by kind:**
  - An instant is `<event>_timestamp`, stored as `timestamptz` in UTC, such as `canceled_timestamp`, with no `_utc` suffix.
  - A calendar date is `<name>_date`, stored as `date`, such as `due_date`.
  - A boolean is `is_<state>` or `has_<thing>`, such as `is_archived`.
- **Constraints and indexes** take the names from the convention: `pk_<table>`, `fk_<table>_<target>_<column>`, `ix_<table>_<columns>` and `ak_<table>_<columns>`. A check constraint is `ck_<table>_<rule>`.
- **No identifier is longer than 63 bytes.** An architecture test fails any table, column, constraint or index name that is longer, before PostgreSQL can cut it short.
- **Migrations** have PascalCase verb phrases as names that say what they do, such as `AddOrderNotes` or `RenameOrderStatusToState`.
- Names are in US English, as in code (CLA-0052).

## Consequences

- SQL in migrations, data fixes and ad hoc queries never needs quotes. The same name reads the same way in C#, SQL and the API.
- C# property names set column names. A property `CanceledTimestamp` becomes `canceled_timestamp`, so the suffix rules apply to entity properties too.
- Existing apps keep their names and list this ADR as a deviation in their `AGENTS.md` (CLA-0028). A rename of an existing table or column is a migration of its own.
