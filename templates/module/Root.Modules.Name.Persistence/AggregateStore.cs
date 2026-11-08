using <Root>.Modules.<Name>.Domain;
using <Root>.Modules.<Name>.Persistence.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace <Root>.Modules.<Name>.Persistence;

internal sealed class <Aggregate>Store(<Name>DbContext context) : I<Aggregate>Store
{
    public async Task AddAsync(<Aggregate> aggregate, CancellationToken cancellationToken)
    {
        context.<Aggregates>.Add(new <Aggregate>Entity { Id = aggregate.Id, Name = aggregate.Name, Version = aggregate.Version });
        await context.SaveChangesAsync(cancellationToken);
    }

    public async Task<<Aggregate>?> FindAsync(Guid id, CancellationToken cancellationToken)
    {
        var entity = await context.<Aggregates>.AsNoTracking().SingleOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);
        return entity is null ? null : <Aggregate>.Restore(entity.Id, entity.Name, entity.Version);
    }
}
