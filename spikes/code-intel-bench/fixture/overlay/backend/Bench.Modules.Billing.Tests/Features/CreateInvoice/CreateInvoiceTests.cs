using Claudalisk.Dispatching;
using Bench.Modules.Billing.Domain;
using Bench.Modules.Billing.Interfaces;
using Bench.Modules.Ordering;
using Bench.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Bench.Modules.Billing.Tests.Features.CreateInvoice;

public sealed class CreateInvoiceTests
{
    [Fact]
    public void ANewInvoiceStartsAtTheInitialVersion() =>
        Assert.Equal(Invoice.InitialVersion, Invoice.Create(Guid.NewGuid(), "first").Version);

    [Fact]
    public async Task TheCommandStoresTheInvoice()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var provider = await ComposeAsync(cancellationToken);
        await using var scope = provider.CreateAsyncScope();
        var dispatcher = scope.ServiceProvider.GetRequiredService<IDispatcher>();

        var created = await dispatcher.SendAsync<InvoiceSummary>(new CreateInvoiceCommand("first"), cancellationToken);

        var found = await dispatcher.SendAsync<InvoiceSummary>(new GetInvoiceQuery(created.Id), cancellationToken);
        Assert.Equal("first", found.Name);
    }

    [Fact]
    public async Task AnEmptyNameFailsValidation()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var provider = await ComposeAsync(cancellationToken);
        await using var scope = provider.CreateAsyncScope();
        var dispatcher = scope.ServiceProvider.GetRequiredService<IDispatcher>();

        await Assert.ThrowsAsync<MessageValidationException>(
            async () => await dispatcher.SendAsync<InvoiceSummary>(new CreateInvoiceCommand(""), cancellationToken));
    }

    private static async Task<ServiceProvider> ComposeAsync(CancellationToken cancellationToken)
    {
        var connectionString = await PostgresServer.CreateMigratedDatabaseAsync(cancellationToken);
        var services = PostgresServer.CreateServices(connectionString, new BillingModule(), new OrderingModule());
        services.AddClaudaliskDispatching();
        return services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true });
    }
}
