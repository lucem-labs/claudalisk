namespace Spike.Persistence.Interfaces;

/// <summary>
/// Runs work from several modules in one database transaction. Only composition modules open a unit of
/// work around other modules' calls. A nested call joins the outer unit of work.
/// </summary>
public interface IUnitOfWork
{
    Task<T> RunAsync<T>(Func<CancellationToken, Task<T>> work, CancellationToken cancellationToken = default);

    Task RunAsync(Func<CancellationToken, Task> work, CancellationToken cancellationToken = default) =>
        RunAsync<bool>(async ct => { await work(ct); return true; }, cancellationToken);
}
