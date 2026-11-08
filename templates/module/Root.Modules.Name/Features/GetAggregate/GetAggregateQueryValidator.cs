using FluentValidation;
using <Root>.Modules.<Name>.Interfaces;

namespace <Root>.Modules.<Name>.Features.Get<Aggregate>;

internal sealed class Get<Aggregate>QueryValidator : AbstractValidator<Get<Aggregate>Query>
{
    public Get<Aggregate>QueryValidator() => RuleFor(query => query.Id).NotEmpty();
}
