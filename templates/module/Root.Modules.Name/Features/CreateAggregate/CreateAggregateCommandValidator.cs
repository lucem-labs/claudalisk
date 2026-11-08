using FluentValidation;
using <Root>.Modules.<Name>.Interfaces;

namespace <Root>.Modules.<Name>.Features.Create<Aggregate>;

internal sealed class Create<Aggregate>CommandValidator : AbstractValidator<Create<Aggregate>Command>
{
    public Create<Aggregate>CommandValidator() => RuleFor(command => command.Name).NotEmpty().MaximumLength(200);
}
