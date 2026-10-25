# CLA-0051: Database names are lowercase snake_case, set by convention

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** data-and-migrations
- **Enforced by:** the naming convention on every module context; architecture tests (identifier length, column suffixes); reviewer

## Context

The existing apps used EF Core's default names, which PostgreSQL stores as quoted PascalCase identifiers, such as `"OrderLines"` and `"CreatedAtUtc"`. PostgreSQL folds unquoted names to lowercase, so every hand-written query and every migration's SQL (CLA-0012) has to quote them. Table names drifted between plural and singular. One generated foreign key name passed PostgreSQL's 63-byte limit and was cut short with a `~`.

## Decision

- **Every identifier is lowercase `snake_case`, and none is quoted.** Every module DbContext calls `UseSnakeCaseNamingConvention()` from `EFCore.NamingConventions`. Tables, columns, keys, foreign keys and indexes get their names from the convention, never from hand-written `ToTable` or `HasColumnName` calls.
- **Schemas** are the module's name in snake_case: `<Root>.Modules.OrderHistory` owns `order_history` (CLA-0007).
- **Tables** are plural nouns from the module's ubiquitous language (CLA-0041), such as `orders` and `order_lines`. They have no prefixes such as `tbl_`, and don't repeat the schema's name.
- **Keys:**
  - the primary key column is `id`;
  - a reference to another row is `<thing>_id`, such as `order_id`;
  - inside a module, a reference has a foreign key; across modules it is an id only, with no foreign key (CLA-0007).
- **Columns by kind:**
  - an instant is `<event>_timestamp`, stored as `timestamptz` in UTC, such as `canceled_timestamp`, with no `_utc` suffix;
  - a calendar date is `<name>_date`, stored as `date`, such as `due_date`;
  - a boolean is `is_<state>` or `has_<thing>`, such as `is_archived`.
- **Constraints and indexes** take the convention's names: `pk_<table>`, `fk_<table>_<target>_<column>`, `ix_<table>_<columns>` and `ak_<table>_<columns>`. A check constraint is named `ck_<table>_<rule>`.
- **No identifier is longer than 63 bytes.** An architecture test fails any table, column, constraint or index name that is, before PostgreSQL can cut it short.
- **Migrations** are named as PascalCase verb phrases saying what they do, such as `AddOrderNotes` or `RenameOrderStatusToState`.
- Names are in US English, as in code (CLA-0052).

## Consequences

- SQL in migrations, data fixes and ad hoc queries never needs quotes, and the same name reads the same way in C#, SQL and the API.
- C# property names drive column names. A property named `CanceledTimestamp` becomes `canceled_timestamp`, so the suffix rules apply to entity properties too.
- Existing apps keep their names, and list this ADR as a deviation in their `AGENTS.md` (CLA-0028). Renaming an existing table or column is a migration of its own.
