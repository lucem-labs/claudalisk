using Claudalisk.Dispatching;
using <Root>.Modules.<Name>.Domain;
using <Root>.Modules.<Name>.Interfaces;
using <Root>.Modules.<Name>.Persistence.Interfaces;
using <Root>.Modules.<Name>.Shared.<Aggregates>;

namespace <Root>.Modules.<Name>.Features.Get<Aggregate>;

internal sealed class Get<Aggregate>Handler(I<Aggregate>Store store) : IHandler<Get<Aggregate>Query, <Aggregate>Summary>
{
    public async ValueTask<<Aggregate>Summary> HandleAsync(Get<Aggregate>Query message, CancellationToken cancellationToken)
    {
        var aggregate = await store.FindAsync(message.Id, cancellationToken) ?? throw new <Aggregate>NotFoundException(message.Id);
        return aggregate.ToSummary();
    }
}
