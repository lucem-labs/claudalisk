using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Spike.Modules.Billing.Persistence;
using Spike.Modules.Orders.Persistence;
using Spike.Persistence.Interfaces;
using Xunit;

namespace Spike.Tests;

[Collection(nameof(PostgresCollection))]
public sealed class UnitOfWorkTests(PostgresFixture postgres)
{
    private sealed record Counts(int Orders, int Charges, int Queued);

    /// <summary>Thrown by the tests' own composition logic, so no infrastructure error can pass for it.</summary>
    private sealed class CompositionFailed(string message) : Exception(message);

    private static async Task<Counts> CountAsync(IServiceProvider app)
    {
        await using var scope = app.CreateAsyncScope();
        var orders = scope.ServiceProvider.GetRequiredService<IOrderStore>();
        var billing = scope.ServiceProvider.GetRequiredService<IBillingStore>();
        return new Counts(
            await orders.CountAsync(CancellationToken.None),
            await billing.CountChargesAsync(CancellationToken.None),
            await billing.CountQueuedAsync(CancellationToken.None));
    }

    private static (IUnitOfWork Uow, IOrderStore Orders, IBillingStore Billing) Resolve(IServiceProvider scope) =>
        (scope.GetRequiredService<IUnitOfWork>(), scope.GetRequiredService<IOrderStore>(), scope.GetRequiredService<IBillingStore>());

    [Fact]
    public async Task Work_from_two_modules_commits_together()
    {
        await using var app = await postgres.CreateAppAsync();
        await using (var scope = app.CreateAsyncScope())
        {
            var (uow, orders, billing) = Resolve(scope.ServiceProvider);
            var orderId = Guid.NewGuid();
            await uow.RunAsync(async ct =>
            {
                await orders.PlaceAsync(orderId, "A-1", ct);
                await billing.ChargeAsync(orderId, 10m, ct);
            });
        }

        Assert.Equal(new Counts(1, 1, 0), await CountAsync(app));
    }

    [Fact]
    public async Task A_database_error_in_the_second_module_rolls_back_the_first()
    {
        await using var app = await postgres.CreateAppAsync();
        await using (var scope = app.CreateAsyncScope())
        {
            var (uow, orders, billing) = Resolve(scope.ServiceProvider);
            var orderId = Guid.NewGuid();
            await Assert.ThrowsAsync<DbUpdateException>(() => uow.RunAsync(async ct =>
            {
                await orders.PlaceAsync(orderId, "A-1", ct);
                await billing.ChargeAsync(orderId, -5m, ct); // violates the check constraint
            }));
        }

        Assert.Equal(new Counts(0, 0, 0), await CountAsync(app));
    }

    [Fact]
    public async Task An_exception_after_both_saves_rolls_back_both()
    {
        await using var app = await postgres.CreateAppAsync();
        await using (var scope = app.CreateAsyncScope())
        {
            var (uow, orders, billing) = Resolve(scope.ServiceProvider);
            var orderId = Guid.NewGuid();
            await Assert.ThrowsAsync<CompositionFailed>(() => uow.RunAsync(async ct =>
            {
                await orders.PlaceAsync(orderId, "A-1", ct);
                await billing.ChargeAsync(orderId, 10m, ct);
                throw new CompositionFailed("composition rule failed");
            }));
        }

        Assert.Equal(new Counts(0, 0, 0), await CountAsync(app));
    }

    [Fact]
    public async Task Without_a_unit_of_work_each_module_commits_on_its_own()
    {
        await using var app = await postgres.CreateAppAsync();
        await using (var scope = app.CreateAsyncScope())
        {
            var (_, orders, billing) = Resolve(scope.ServiceProvider);
            var orderId = Guid.NewGuid();
            await orders.PlaceAsync(orderId, "A-1", CancellationToken.None);
            await Assert.ThrowsAsync<DbUpdateException>(() => billing.ChargeAsync(orderId, -5m, CancellationToken.None));
        }

        Assert.Equal(new Counts(1, 0, 0), await CountAsync(app));
    }

    [Fact]
    public async Task A_multi_statement_save_joins_the_unit_of_work_instead_of_starting_its_own()
    {
        await using var app = await postgres.CreateAppAsync();
        await using (var scope = app.CreateAsyncScope())
        {
            var (uow, orders, billing) = Resolve(scope.ServiceProvider);
            var orderId = Guid.NewGuid();
            await Assert.ThrowsAsync<DbUpdateException>(() => uow.RunAsync(async ct =>
            {
                await orders.PlaceManyAsync([(orderId, "A-1"), (Guid.NewGuid(), "A-2"), (Guid.NewGuid(), "A-3")], ct);
                await billing.ChargeAsync(orderId, -5m, ct);
            }));
        }

        Assert.Equal(new Counts(0, 0, 0), await CountAsync(app));
    }

    [Fact]
    public async Task A_nested_unit_of_work_joins_the_outer_one()
    {
        await using var app = await postgres.CreateAppAsync();
        await using (var scope = app.CreateAsyncScope())
        {
            var (uow, orders, billing) = Resolve(scope.ServiceProvider);
            var orderId = Guid.NewGuid();
            await Assert.ThrowsAsync<CompositionFailed>(() => uow.RunAsync(async ct =>
            {
                await orders.PlaceAsync(orderId, "A-1", ct);
                await uow.RunAsync(inner => billing.ChargeAsync(orderId, 10m, inner), ct); // must not commit on its own
                throw new CompositionFailed("outer work failed after the nested call");
            }));
        }

        Assert.Equal(new Counts(0, 0, 0), await CountAsync(app));
    }

    [Fact]
    public async Task A_context_used_before_the_unit_of_work_still_joins_it()
    {
        await using var app = await postgres.CreateAppAsync();
        await using (var scope = app.CreateAsyncScope())
        {
            var (uow, orders, billing) = Resolve(scope.ServiceProvider);
            Assert.Equal(0, await orders.CountAsync(CancellationToken.None)); // context created and used first
            Assert.Equal(0, await billing.CountChargesAsync(CancellationToken.None));
            var orderId = Guid.NewGuid();
            await Assert.ThrowsAsync<DbUpdateException>(() => uow.RunAsync(async ct =>
            {
                await orders.PlaceAsync(orderId, "A-1", ct);
                await billing.ChargeAsync(orderId, -5m, ct);
            }));
        }

        Assert.Equal(new Counts(0, 0, 0), await CountAsync(app));
    }

    [Fact]
    public async Task Contexts_are_not_left_on_a_finished_transaction()
    {
        await using var app = await postgres.CreateAppAsync();
        await using (var scope = app.CreateAsyncScope())
        {
            var (uow, orders, billing) = Resolve(scope.ServiceProvider);
            await uow.RunAsync(ct => orders.PlaceAsync(Guid.NewGuid(), "A-1", ct));          // commits
            await orders.PlaceAsync(Guid.NewGuid(), "A-2", CancellationToken.None);           // no unit of work
            var orderId = Guid.NewGuid();
            await Assert.ThrowsAsync<DbUpdateException>(() => uow.RunAsync(async ct =>      // second unit of work fails
            {
                await orders.PlaceAsync(orderId, "A-3", ct);
                await billing.ChargeAsync(orderId, -5m, ct);
            }));
            await uow.RunAsync(ct => orders.PlaceAsync(Guid.NewGuid(), "A-4", ct));          // and the scope still works
        }

        Assert.Equal(new Counts(3, 0, 0), await CountAsync(app));
    }

    [Fact]
    public async Task Queued_work_commits_and_rolls_back_with_the_data()
    {
        await using var app = await postgres.CreateAppAsync();
        await using (var scope = app.CreateAsyncScope())
        {
            var (uow, orders, billing) = Resolve(scope.ServiceProvider);
            var failed = Guid.NewGuid();
            await Assert.ThrowsAsync<CompositionFailed>(() => uow.RunAsync(async ct =>
            {
                await orders.PlaceAsync(failed, "A-1", ct);
                await billing.ChargeAsync(failed, 10m, ct);
                await billing.EnqueueReceiptAsync(failed, ct);
                throw new CompositionFailed("rolled back");
            }));

            var placed = Guid.NewGuid();
            await uow.RunAsync(async ct =>
            {
                await orders.PlaceAsync(placed, "A-2", ct);
                await billing.ChargeAsync(placed, 10m, ct);
                await billing.EnqueueReceiptAsync(placed, ct);
            });
        }

        Assert.Equal(new Counts(1, 1, 1), await CountAsync(app));
    }

    [Fact]
    public async Task Uncommitted_work_is_invisible_to_another_scope()
    {
        await using var app = await postgres.CreateAppAsync();
        await using var scope = app.CreateAsyncScope();
        var (uow, orders, _) = Resolve(scope.ServiceProvider);
        await uow.RunAsync(async ct =>
        {
            await orders.PlaceAsync(Guid.NewGuid(), "A-1", ct);
            Assert.Equal(1, await orders.CountAsync(ct));                // visible inside the unit of work
            Assert.Equal(0, (await CountAsync(app)).Orders);             // another scope: another connection
        });

        Assert.Equal(1, (await CountAsync(app)).Orders);
    }

    [Fact]
    public async Task Each_module_keeps_its_own_schema_and_migrations_history()
    {
        await using var app = await postgres.CreateAppAsync();
        await using var scope = app.CreateAsyncScope();
        var connection = (NpgsqlConnection)scope.ServiceProvider.GetRequiredService<NpgsqlDataSource>().CreateConnection();
        await using (connection)
        {
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand(
                """
                SELECT table_schema || '.' || table_name FROM information_schema.tables
                WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY 1
                """, connection);
            var tables = new List<string>();
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                tables.Add(reader.GetString(0));
            }

            Assert.Equal(
                ["billing.__EFMigrationsHistory", "billing.charges", "billing.jobs", "orders.__EFMigrationsHistory", "orders.orders"],
                tables);
        }
    }
}
