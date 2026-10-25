using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Spike.Modules.Billing.Persistence;
using Spike.Modules.Orders.Persistence;
using Spike.Persistence;
using Testcontainers.PostgreSql;
using Xunit;

namespace Spike.Tests;

/// <summary>One PostgreSQL container per test run; every test gets its own, freshly migrated database.</summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer container = new PostgreSqlBuilder("postgres:17-alpine").Build();

    public Task InitializeAsync() => container.StartAsync();

    public Task DisposeAsync() => container.DisposeAsync().AsTask();

    /// <summary>Creates an empty database, builds the app's services against it and migrates both modules.</summary>
    public async Task<ServiceProvider> CreateAppAsync()
    {
        var name = "t_" + Guid.NewGuid().ToString("N");
        await using (var admin = new NpgsqlConnection(container.GetConnectionString()))
        {
            await admin.OpenAsync();
            await using var create = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", admin);
            await create.ExecuteNonQueryAsync();
        }

        var connectionString = new NpgsqlConnectionStringBuilder(container.GetConnectionString()) { Database = name }.ConnectionString;
        var app = new ServiceCollection()
            .AddSharedPersistence(connectionString)
            .AddOrdersPersistence()
            .AddBillingPersistence()
            .BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true, ValidateOnBuild = true });

        // Each module migrates independently, as the deploy step's migrate service would.
        await using var scope = app.CreateAsyncScope();
        await scope.ServiceProvider.MigrateOrdersAsync(CancellationToken.None);
        await scope.ServiceProvider.MigrateBillingAsync(CancellationToken.None);
        return app;
    }
}

[CollectionDefinition(nameof(PostgresCollection))]
public sealed class PostgresCollection : ICollectionFixture<PostgresFixture>;
