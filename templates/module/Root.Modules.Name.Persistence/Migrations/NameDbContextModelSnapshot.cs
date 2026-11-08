using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace <Root>.Modules.<Name>.Persistence.Migrations;

[DbContext(typeof(<Name>DbContext))]
internal sealed class <Name>DbContextModelSnapshot : ModelSnapshot
{
    protected override void BuildModel(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("<schema>");
        modelBuilder.HasAnnotation("Relational:MaxIdentifierLength", 63);
        NpgsqlModelBuilderExtensions.UseIdentityByDefaultColumns(modelBuilder);

        modelBuilder.Entity("<Root>.Modules.<Name>.Persistence.<Aggregate>Entity", b =>
        {
            b.Property<Guid>("Id").ValueGeneratedOnAdd().HasColumnType("uuid").HasColumnName("id");
            b.Property<string>("Name").IsRequired().HasMaxLength(200).HasColumnType("character varying(200)").HasColumnName("name");
            b.Property<long>("Version").IsConcurrencyToken().HasColumnType("bigint").HasColumnName("version");
            b.HasKey("Id").HasName("pk_<aggregates>");
            b.ToTable("<aggregates>", "<schema>");
        });
    }
}
