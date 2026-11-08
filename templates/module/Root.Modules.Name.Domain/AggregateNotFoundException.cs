using Claudalisk.Domain;

namespace <Root>.Modules.<Name>.Domain;

public sealed class <Aggregate>NotFoundException(Guid id)
    : DomainException("<route>-not-found", $"<Aggregate> {id} was not found.", DomainErrorKind.NotFound);
