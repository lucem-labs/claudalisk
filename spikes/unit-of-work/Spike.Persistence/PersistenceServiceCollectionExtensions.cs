using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Spike.Persistence.Interfaces;

namespace Spike.Persistence;

public static class PersistenceServiceCollectionExtensions
{
    /// <summary>Registers the app's one physical database, the per-scope connection and the unit of work.</summary>
    public static IServiceCollection AddSharedPersistence(this IServiceCollection services, string connectionString)
    {
        services.AddSingleton(_ => NpgsqlDataSource.Create(connectionString));
        services.AddScoped<DbSession>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        return services;
    }

    /// <summary>
    /// Configures a module DbContext: the scope's shared connection, the module's own schema for the
    /// migrations history, and enlistment in the current unit of work. Don't use DbContext pooling or
    /// EnableRetryOnFailure with it.
    /// </summary>
    public static DbContextOptionsBuilder UseModuleSchema(
        this DbContextOptionsBuilder options, IServiceProvider services, string schema)
    {
        var session = services.GetRequiredService<DbSession>();
        return options
            .UseNpgsql(session.Connection, npgsql => npgsql.MigrationsHistoryTable("__EFMigrationsHistory", schema))
            .AddInterceptors(new EnlistInSessionTransaction(session));
    }
}
