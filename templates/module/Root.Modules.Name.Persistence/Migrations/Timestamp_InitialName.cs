using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace <Root>.Modules.<Name>.Persistence.Migrations;

[DbContext(typeof(<Name>DbContext))]
[Migration("<timestamp>_Initial<Name>")]
public sealed class Initial<Name> : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.EnsureSchema(name: "<schema>");

        migrationBuilder.CreateTable(
            name: "<aggregates>",
            schema: "<schema>",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                version = table.Column<long>(type: "bigint", nullable: false),
            },
            constraints: table => table.PrimaryKey("pk_<aggregates>", row => row.id));
    }

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropTable(name: "<aggregates>", schema: "<schema>");
}
