using Claudalisk.Dispatching;
using <Root>.Modules.<Name>.Domain;
using <Root>.Modules.<Name>.Interfaces;
using <Root>.Modules.<Name>.Persistence.Interfaces;
using <Root>.Modules.<Name>.Shared.<Aggregates>;

namespace <Root>.Modules.<Name>.Features.Create<Aggregate>;

internal sealed class Create<Aggregate>Handler(I<Aggregate>Store store) : IHandler<Create<Aggregate>Command, <Aggregate>Summary>
{
    public async ValueTask<<Aggregate>Summary> HandleAsync(Create<Aggregate>Command message, CancellationToken cancellationToken)
    {
        var aggregate = <Aggregate>.Create(Guid.NewGuid(), message.Name);
        await store.AddAsync(aggregate, cancellationToken);
        return aggregate.ToSummary();
    }
}
