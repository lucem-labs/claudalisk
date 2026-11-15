using Bench.Modules.Billing;
using Bench.Modules.Ordering;
using Bench.Modules.Ordering.Interfaces;

namespace Bench.Hidden.T1.Tests;

public sealed class RenamedCommandTests
{
    private static readonly Type[] OrderingTypes = [.. typeof(OrderingModule).Assembly.GetTypes(), .. typeof(OrderingContract).Assembly.GetTypes()];

    [Fact]
    public void TheCommandCarriesTheName() =>
        Assert.Equal("first", new PlaceOrderCommand("first").Name);

    [Fact]
    public void TheOldCommandIsGone() =>
        Assert.DoesNotContain(OrderingTypes, type => type.Name == "CreateOrderCommand");

    [Fact]
    public void TheHandlerIsNamedAfterTheCommand()
    {
        Assert.Contains(OrderingTypes, type => type.Name == "PlaceOrderHandler");
        Assert.DoesNotContain(OrderingTypes, type => type.Name == "CreateOrderHandler");
    }

    [Fact]
    public void BillingStillDependsOnOrdering() =>
        Assert.Contains(typeof(OrderingContract), new BillingModule().Dependencies);
}
