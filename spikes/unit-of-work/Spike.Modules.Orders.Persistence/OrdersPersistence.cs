using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Spike.Persistence;

namespace Spike.Modules.Orders.Persistence;

public interface IOrderStore
{
    Task PlaceAsync(Guid id, string reference, CancellationToken cancellationToken);

    Task PlaceManyAsync(IReadOnlyList<(Guid Id, string Reference)> orders, CancellationToken cancellationToken);

    Task<int> CountAsync(CancellationToken cancellationToken);
}

internal sealed class Order
{
    public Guid Id { get; set; }

    public required string Reference { get; set; }
}

internal sealed class OrdersDbContext(DbContextOptions<OrdersDbContext> options) : DbContext(options)
{
    public const string Schema = "orders";

    public DbSet<Order> Orders => Set<Order>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.Entity<Order>(order =>
        {
            order.ToTable("orders");
            order.HasIndex(o => o.Reference).IsUnique();
        });
    }
}

internal sealed class OrderStore(OrdersDbContext db) : IOrderStore
{
    public async Task PlaceAsync(Guid id, string reference, CancellationToken cancellationToken)
    {
        db.Orders.Add(new Order { Id = id, Reference = reference });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task PlaceManyAsync(IReadOnlyList<(Guid Id, string Reference)> orders, CancellationToken cancellationToken)
    {
        db.Orders.AddRange(orders.Select(o => new Order { Id = o.Id, Reference = o.Reference }));
        await db.SaveChangesAsync(cancellationToken);
    }

    public Task<int> CountAsync(CancellationToken cancellationToken) => db.Orders.CountAsync(cancellationToken);
}

public static class OrdersPersistenceRegistration
{
    public static IServiceCollection AddOrdersPersistence(this IServiceCollection services)
    {
        services.AddDbContext<OrdersDbContext>((sp, options) => options.UseModuleSchema(sp, OrdersDbContext.Schema));
        services.AddScoped<IOrderStore, OrderStore>();
        return services;
    }

    public static Task MigrateOrdersAsync(this IServiceProvider services, CancellationToken cancellationToken) =>
        services.GetRequiredService<OrdersDbContext>().Database.MigrateAsync(cancellationToken);
}
