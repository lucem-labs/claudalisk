using Claudalisk.Modules;
using Claudalisk.Persistence;
using <Root>.Api;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Testcontainers.PostgreSql;

namespace <Root>.Testing;

public static class PostgresServer
{
    private static readonly Lazy<Task<PostgreSqlContainer>> Container = new(StartAsync);

    public static async Task<string> CreateDatabaseAsync(CancellationToken cancellationToken = default)
    {
        var container = await Container.Value;
        var name = $"test_{Guid.NewGuid():N}";
        await using (var connection = new NpgsqlConnection(container.GetConnectionString()))
        {
            await connection.OpenAsync(cancellationToken);
            await using var command = new NpgsqlCommand($"CREATE DATABASE {name}", connection);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        return new NpgsqlConnectionStringBuilder(container.GetConnectionString()) { Database = name }.ConnectionString;
    }

    public static async Task<string> CreateMigratedDatabaseAsync(CancellationToken cancellationToken = default)
    {
        var connectionString = await CreateDatabaseAsync(cancellationToken);
        await using var provider = BuildAppServices(connectionString);
        await using var scope = provider.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().MigrateAsync(cancellationToken);
        return connectionString;
    }

    public static ServiceProvider BuildAppServices(string connectionString) =>
        BuildServices(connectionString, AppModules.All());

    public static ServiceProvider BuildServices(string connectionString, params IModule[] modules) =>
        CreateServices(connectionString, modules).BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true });

    public static ServiceCollection CreateServices(string connectionString, params IModule[] modules)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddClaudaliskPersistence(connectionString);
        services.AddClaudaliskModules(new ConfigurationBuilder().Build(), modules);
        return services;
    }

    private static async Task<PostgreSqlContainer> StartAsync()
    {
        var container = new PostgreSqlBuilder("postgres:18-alpine").Build();
        await container.StartAsync();
        return container;
    }
}
