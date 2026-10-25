namespace Spike.Persistence.Interfaces;

public interface IUnitOfWork
{
    Task<T> RunAsync<T>(Func<CancellationToken, Task<T>> work, CancellationToken cancellationToken = default);

    Task RunAsync(Func<CancellationToken, Task> work, CancellationToken cancellationToken = default) =>
        RunAsync<bool>(async ct => { await work(ct); return true; }, cancellationToken);
}
