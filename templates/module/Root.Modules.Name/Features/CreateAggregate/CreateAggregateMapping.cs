using <Root>.Modules.<Name>.Interfaces;

namespace <Root>.Modules.<Name>.Features.Create<Aggregate>;

internal static class Create<Aggregate>Mapping
{
    public static Create<Aggregate>Command ToCommand(this Create<Aggregate>Request request) => new(request.Name);
}
