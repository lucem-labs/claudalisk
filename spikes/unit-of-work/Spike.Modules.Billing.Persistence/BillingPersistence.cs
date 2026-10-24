using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Spike.Persistence;

namespace Spike.Modules.Billing.Persistence;

// In an app, IBillingStore lives in the module's Persistence.Interfaces project and takes messages.
public interface IBillingStore
{
    /// <summary>Records a charge. A non-positive amount violates a database check constraint.</summary>
    Task ChargeAsync(Guid orderId, decimal amount, CancellationToken cancellationToken);

    /// <summary>Queues follow-up work in the module's own queue table: the outbox, in the same transaction.</summary>
    Task EnqueueReceiptAsync(Guid orderId, CancellationToken cancellationToken);

    Task<int> CountChargesAsync(CancellationToken cancellationToken);

    Task<int> CountQueuedAsync(CancellationToken cancellationToken);
}

internal sealed class Charge
{
    public Guid Id { get; set; }

    public Guid OrderId { get; set; }

    public decimal Amount { get; set; }
}

internal sealed class BillingDbContext(DbContextOptions<BillingDbContext> options) : DbContext(options)
{
    public const string Schema = "billing";

    public DbSet<Charge> Charges => Set<Charge>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.Entity<Charge>(charge =>
            charge.ToTable("charges", table => table.HasCheckConstraint("CK_charges_amount_positive", "\"Amount\" > 0")));
    }
}

internal sealed class BillingStore(BillingDbContext db) : IBillingStore
{
    public async Task ChargeAsync(Guid orderId, decimal amount, CancellationToken cancellationToken)
    {
        db.Charges.Add(new Charge { Id = Guid.NewGuid(), OrderId = orderId, Amount = amount });
        await db.SaveChangesAsync(cancellationToken);
    }

    public Task EnqueueReceiptAsync(Guid orderId, CancellationToken cancellationToken) =>
        db.Database.ExecuteSqlInterpolatedAsync(
            $"INSERT INTO billing.jobs (kind, order_id) VALUES ('receipt', {orderId})", cancellationToken);

    public Task<int> CountChargesAsync(CancellationToken cancellationToken) => db.Charges.CountAsync(cancellationToken);

    public Task<int> CountQueuedAsync(CancellationToken cancellationToken) =>
        db.Database.SqlQuery<int>($"SELECT count(*)::int AS \"Value\" FROM billing.jobs").SingleAsync(cancellationToken);
}

public static class BillingPersistenceRegistration
{
    public static IServiceCollection AddBillingPersistence(this IServiceCollection services)
    {
        services.AddDbContext<BillingDbContext>((sp, options) => options.UseModuleSchema(sp, BillingDbContext.Schema));
        services.AddScoped<IBillingStore, BillingStore>();
        return services;
    }

    public static Task MigrateBillingAsync(this IServiceProvider services, CancellationToken cancellationToken) =>
        services.GetRequiredService<BillingDbContext>().Database.MigrateAsync(cancellationToken);
}
