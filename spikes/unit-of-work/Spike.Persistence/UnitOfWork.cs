using System.Data;
using Spike.Persistence.Interfaces;

namespace Spike.Persistence;

internal sealed class UnitOfWork(DbSession session) : IUnitOfWork
{
    public async Task<T> RunAsync<T>(Func<CancellationToken, Task<T>> work, CancellationToken cancellationToken = default)
    {
        if (session.Transaction is not null)
        {
            // Nested call: join the outer unit of work; it commits or rolls back once.
            return await work(cancellationToken);
        }

        if (session.Connection.State != ConnectionState.Open)
        {
            await session.Connection.OpenAsync(cancellationToken);
        }

        await using var transaction = await session.Connection.BeginTransactionAsync(cancellationToken);
        session.Transaction = transaction;
        try
        {
            var result = await work(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return result;
        }
        finally
        {
            // Disposing a transaction that wasn't committed rolls it back.
            session.Transaction = null;
        }
    }
}
