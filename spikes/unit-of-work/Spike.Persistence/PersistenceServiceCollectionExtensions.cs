using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Spike.Persistence.Interfaces;

namespace Spike.Persistence;

public static class PersistenceServiceCollectionExtensions
{
    public static IServiceCollection AddSharedPersistence(this IServiceCollection services, string connectionString)
    {
        services.AddSingleton(_ => NpgsqlDataSource.Create(connectionString));
        services.AddScoped<DbSession>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        return services;
    }

    public static DbContextOptionsBuilder UseModuleSchema(
        this DbContextOptionsBuilder options, IServiceProvider services, string schema)
    {
        var session = services.GetRequiredService<DbSession>();
        return options
            .UseNpgsql(session.Connection, npgsql => npgsql.MigrationsHistoryTable("__EFMigrationsHistory", schema))
            .AddInterceptors(new EnlistInSessionTransaction(session));
    }
}
