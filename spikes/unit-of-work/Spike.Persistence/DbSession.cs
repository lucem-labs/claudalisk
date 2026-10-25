using Npgsql;

namespace Spike.Persistence;

/// <summary>One connection per DI scope (a request or a background job), shared by every module DbContext.</summary>
internal sealed class DbSession(NpgsqlDataSource dataSource) : IAsyncDisposable
{
    public NpgsqlConnection Connection { get; } = dataSource.CreateConnection();

    public NpgsqlTransaction? Transaction { get; set; }

    public ValueTask DisposeAsync() => Connection.DisposeAsync();
}
