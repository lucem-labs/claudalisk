using Bench.Modules.Billing.Domain;
using Bench.Modules.Billing.Interfaces;
using Bench.Modules.Billing.Persistence.Interfaces;
using Bench.Modules.Billing.Shared.Invoices;
using Bench.Modules.Ordering.Interfaces;
using Claudalisk.Dispatching;

namespace Bench.Modules.Billing.Features.RaiseInvoice;

internal sealed class RaiseInvoiceHandler(IDispatcher dispatcher, IInvoiceStore store) : IHandler<RaiseInvoiceCommand, InvoiceSummary>
{
    public async ValueTask<InvoiceSummary> HandleAsync(RaiseInvoiceCommand message, CancellationToken cancellationToken)
    {
        var order = await dispatcher.SendAsync<OrderSummary>(new CreateOrderCommand(message.OrderName), cancellationToken);
        var invoice = Invoice.Create(Guid.NewGuid(), $"Invoice for {order.Name}");
        await store.AddAsync(invoice, cancellationToken);
        return invoice.ToSummary();
    }
}
