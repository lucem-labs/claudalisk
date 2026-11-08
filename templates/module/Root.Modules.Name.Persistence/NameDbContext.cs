using Microsoft.EntityFrameworkCore;

namespace <Root>.Modules.<Name>.Persistence;

public sealed class <Name>DbContext(DbContextOptions<<Name>DbContext> options) : DbContext(options)
{
    public const string Schema = "<schema>";

    public DbSet<<Aggregate>Entity> <Aggregates> => Set<<Aggregate>Entity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.Entity<<Aggregate>Entity>(entity =>
        {
            entity.HasKey(aggregate => aggregate.Id);
            entity.Property(aggregate => aggregate.Name).HasMaxLength(200);
            entity.Property(aggregate => aggregate.Version).IsConcurrencyToken();
        });
    }
}
