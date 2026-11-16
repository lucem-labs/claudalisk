using Claudalisk.Modules;
using Bench.Modules.Billing.Interfaces;
using Bench.Modules.Billing.Persistence;
using Bench.Modules.Billing.Shared.Ledger;
using Bench.Modules.Billing.Shared.Pricing;
using Bench.Modules.Ordering.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Bench.Modules.Billing;

public sealed class BillingModule : IModule
{
    public Type Contract => typeof(BillingContract);

    public IReadOnlyCollection<Type> Dependencies => [typeof(OrderingContract)];

    public string Description => "Billing module.";

    public void ConfigureServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddBillingPersistence();
        services.TryAddSingleton<IDiscountPolicy, StandardDiscountPolicy>();
        services.TryAddSingleton<ILedger, InMemoryLedger>();
        services.TryAddSingleton<IAuditTrail, InMemoryAuditTrail>();
    }
}
