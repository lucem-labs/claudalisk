using Claudalisk.AspNetCore;
using Npgsql;

namespace <Root>.Api;

internal sealed class DatabaseHealthProbe(NpgsqlDataSource dataSource) : IDatabaseHealthProbe
{
    public async Task<bool> CanConnectAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
            return true;
        }
        catch (NpgsqlException)
        {
            return false;
        }
    }
}
