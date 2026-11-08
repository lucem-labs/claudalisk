using <Root>.Modules.<Name>.Domain;

namespace <Root>.Modules.<Name>.Persistence.Interfaces;

public interface I<Aggregate>Store
{
    Task AddAsync(<Aggregate> aggregate, CancellationToken cancellationToken);

    Task<<Aggregate>?> FindAsync(Guid id, CancellationToken cancellationToken);
}
