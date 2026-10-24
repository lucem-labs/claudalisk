# CLA-0004: Module registration is idempotent and declares dependencies

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** module registration tests

## Context

Two existing apps use the same registration code, which differs only in names. It keeps the Host down to a list of modules, while each module stays responsible for its own wiring. Registration order, repeated calls and ambiguous or circular dependencies are each handled explicitly and covered by tests, because a silent mistake in any of them would only show up as a confusing failure at run time.

## Decision

- Each module implements the app's module interface and registers its own internal implementations.
- A module declares the module contracts it depends on, as marker interfaces from Interfaces projects. It never declares implementation types.
- Registration resolves modules in dependency order and rejects missing, ambiguous and circular dependencies before any module registers a service.
- It adds each module's MVC application part.
- It is idempotent: registering a module twice is a no-op.
- Each module can be composed in isolation, with only its declared dependencies.

## How the two apps implement it

### The pieces

- **Module interface** in `<Root>.Shared`:

  ```csharp
  public interface I<Root>Module
  {
      IReadOnlyCollection<Type> Dependencies => [];
      void ConfigureServices(IServiceCollection services, IConfiguration configuration);
  }
  ```

- **Marker interface** in each module's Interfaces project: an empty `public interface I<Name>Module;`. Other modules name it in `Dependencies`, so they depend on the contract and never on the implementation (CLA-0002).
- **Module class** in the implementation project:
  - It is a `public sealed class <Name>Module : I<Root>Module, I<Name>Module`, and it is the project's only public entry point.
  - Everything it registers is `internal sealed`.
  - It reads its own configuration, for example a connection string by name, and fails fast when that is missing.
- **The API project is a module too** (`ApiModule`). It declares a dependency on every module whose contracts its controllers use, and it registers API-wide concerns such as MVC exception filters.
- **The Host** lists module instances and nothing else:

  ```csharp
  builder.Services.Add<Root>Modules(
      builder.Configuration,
      new PersistenceModule(),
      new <Name>Module(),
      new ApiModule());
  ```

### How `Add<Root>Modules` works

It is an extension on `IServiceCollection`, in `<Root>.Shared`:

1. **Registration state.** It reads its state from a private singleton held in that service collection, never from a static field, so each service collection is independent. Modules registered by an earlier call are available to satisfy dependencies.
2. **Merging.** It merges the new modules with the earlier ones by module type. The first instance of a type wins.
3. **Ordering.** It orders all modules with a depth-first walk over `Dependencies`. Each declared marker must match exactly one available module (`dependency.IsInstanceOfType(module)`). Otherwise it throws, and the message names:
   - the missing marker, and says to supply its implementation;
   - every ambiguous candidate;
   - the full cycle path, for a circular dependency.

   It does all of these checks **before** calling any `ConfigureServices`, so a failed registration leaves the service collection unchanged.
4. **Registration.** On the first call it runs `AddControllers()` and keeps the `IMvcBuilder`. Then, for each module not registered yet and in dependency order, it:
   - calls `ConfigureServices`;
   - adds the module's assembly as an MVC application part, once;
   - records the module.
5. **Return value.** It returns the `IMvcBuilder`.

Idempotency comes from that recorded state, not from the modules. The second app's modules also use `TryAdd*` for their registrations, as a second line of defence.

### Tests

One app carries the full set below; the other carries a subset (a missing dependency, idempotency, and that the Host's modules resolve their services). New apps get the full set.


- A missing dependency is rejected before any services are registered.
- A transitive dependency is required too.
- Dependencies register before their consumers, whatever the input order.
- Duplicate modules and repeated calls are idempotent.
- A dependency registered by an earlier call is reused.
- Registration state is isolated per service collection.
- A later call can't make an earlier dependency ambiguous.
- Circular and ambiguous dependencies are rejected before any services are registered.
- A module can be composed in isolation with only its declared dependencies.
- The Persistence module requires its connection string.
- The Host's module list resolves every registered service, and controllers are discovered from module assemblies.

### Where the two apps differed

- **Controllers.** One app let some modules contain controllers; that is why each module's application part is added. The other kept every controller in the API project, which CLA-0005 makes the rule. The application part step is still useful for the API module.
- **Hosted services.** One app registered hosted services in the Host instead of in their modules. New apps register them in the owning module.

## Consequences

- Adding a module means writing:
  - its marker interface;
  - its module class with its declared dependencies;
  - one line in the Host;
  - a dependency on its marker in each module that consumes it, including the API module.
- A module that needs another module's contract must declare it. Forgetting to fails at startup with a message that names the missing marker.
- Generated by new-app: the module interface, `Add<Root>Modules` and its tests.
