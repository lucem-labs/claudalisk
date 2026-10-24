using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Spike.Modules.Orders.Persistence.Migrations;

[DbContext(typeof(OrdersDbContext))]
[Migration("20261024000000_InitialOrders")]
internal sealed class InitialOrders : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.EnsureSchema(name: "orders");
        migrationBuilder.CreateTable(
            name: "orders",
            schema: "orders",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                Reference = table.Column<string>(type: "text", nullable: false),
            },
            constraints: table => table.PrimaryKey("PK_orders", x => x.Id));
        migrationBuilder.CreateIndex(
            name: "IX_orders_Reference", schema: "orders", table: "orders", column: "Reference", unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropTable(name: "orders", schema: "orders");
}
