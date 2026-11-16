using Bench.Modules.Billing.Interfaces;
using FluentValidation;

namespace Bench.Modules.Billing.Features.RaiseInvoice;

internal sealed class RaiseInvoiceCommandValidator : AbstractValidator<RaiseInvoiceCommand>
{
    public RaiseInvoiceCommandValidator() => RuleFor(command => command.OrderName).NotEmpty().MaximumLength(200);
}
