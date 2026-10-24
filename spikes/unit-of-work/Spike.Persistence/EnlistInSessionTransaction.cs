using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Storage;

namespace Spike.Persistence;

/// <summary>
/// Before a save, points the context at the scope's current transaction (or at none), so a context resolved
/// before the unit of work started still joins it, and one used after it ended doesn't keep a stale one.
/// Without it, EF Core would begin its own transaction on a connection that already has one.
/// </summary>
internal sealed class EnlistInSessionTransaction(DbSession session) : SaveChangesInterceptor
{
    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        Enlist(eventData.Context);
        return result;
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        Enlist(eventData.Context);
        return ValueTask.FromResult(result);
    }

    private void Enlist(DbContext? context)
    {
        if (context is null)
        {
            return;
        }

        var current = context.Database.CurrentTransaction?.GetDbTransaction();
        if (!ReferenceEquals(current, session.Transaction))
        {
            context.Database.UseTransaction(session.Transaction);
        }
    }
}
