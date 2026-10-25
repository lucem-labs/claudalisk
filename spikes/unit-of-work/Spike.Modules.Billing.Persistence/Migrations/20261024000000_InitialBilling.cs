using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Spike.Modules.Billing.Persistence.Migrations;

[DbContext(typeof(BillingDbContext))]
[Migration("20261024000000_InitialBilling")]
internal sealed class InitialBilling : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.EnsureSchema(name: "billing");
        migrationBuilder.CreateTable(
            name: "charges",
            schema: "billing",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                Amount = table.Column<decimal>(type: "numeric", nullable: false),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_charges", x => x.Id);
                table.CheckConstraint("CK_charges_amount_positive", "\"Amount\" > 0");
            });

        // The module's work queue: rows written here commit or roll back with the module's data.
        migrationBuilder.Sql("""
            CREATE TABLE billing.jobs (
                id bigserial PRIMARY KEY,
                kind text NOT NULL,
                order_id uuid NOT NULL,
                created_at timestamptz NOT NULL DEFAULT now()
            );
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("DROP TABLE billing.jobs;");
        migrationBuilder.DropTable(name: "charges", schema: "billing");
    }
}
