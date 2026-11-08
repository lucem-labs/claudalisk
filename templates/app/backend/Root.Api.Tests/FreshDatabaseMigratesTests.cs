using Claudalisk.Persistence;
using <Root>.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;

namespace <Root>.Api.Tests;

public sealed class FreshDatabaseMigratesTests
{
    [Fact]
    public async Task FreshDatabaseMigrates()
    {
        ModulesExist.OrSkip();
        var cancellationToken = TestContext.Current.CancellationToken;
        var connectionString = await PostgresServer.CreateDatabaseAsync(cancellationToken);
        await using var provider = PostgresServer.BuildAppServices(connectionString);

        await MigrateUpAsync(provider, cancellationToken);
        await MigrateDownAsync(provider, cancellationToken);
        await MigrateUpAsync(provider, cancellationToken);

        await using var scope = provider.CreateAsyncScope();
        var initializer = scope.ServiceProvider.GetRequiredService<DatabaseInitializer>();
        Assert.NotEmpty(initializer.Contexts);
        Assert.Empty(await initializer.GetPendingMigrationsAsync(cancellationToken));
    }

    private static async Task MigrateUpAsync(IServiceProvider provider, CancellationToken cancellationToken)
    {
        await using var scope = provider.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().MigrateAsync(cancellationToken);
    }

    private static async Task MigrateDownAsync(IServiceProvider provider, CancellationToken cancellationToken)
    {
        await using var scope = provider.CreateAsyncScope();
        var initializer = scope.ServiceProvider.GetRequiredService<DatabaseInitializer>();
        foreach (var registration in initializer.Contexts.Reverse())
        {
            var context = (DbContext)scope.ServiceProvider.GetRequiredService(registration.ContextType);
            await context.GetService<IMigrator>().MigrateAsync(Migration.InitialDatabase, cancellationToken);
        }
    }
}
