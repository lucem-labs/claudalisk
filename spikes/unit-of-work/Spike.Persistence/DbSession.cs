using Npgsql;

namespace Spike.Persistence;

internal sealed class DbSession(NpgsqlDataSource dataSource) : IAsyncDisposable
{
    public NpgsqlConnection Connection { get; } = dataSource.CreateConnection();

    public NpgsqlTransaction? Transaction { get; set; }

    public ValueTask DisposeAsync() => Connection.DisposeAsync();
}
