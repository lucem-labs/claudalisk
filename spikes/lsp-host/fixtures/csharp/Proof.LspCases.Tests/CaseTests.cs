using System.Text.Json;

namespace Proof.LspCases.Tests;

public sealed class CaseTests
{
    [Fact]
    public void OverloadsAddUp() => Assert.Equal(7m + 4m + 3m, PricingUsers.Basket());

    [Fact]
    public void ShapesHaveAnArea()
    {
        Assert.Equal(4d, new Square(2).Area());
        Assert.StartsWith("Circle", ShapeReport.Describe(new Circle(1)));
    }

    [Fact]
    public void ALedgerAddsEntries()
    {
        var ledger = new Ledger();
        ledger.Add(2m);
        Assert.Equal(5m, ledger.AddAndBalance(3m));
    }

    [Fact]
    public void ACustomerRoundTripsThroughTheGeneratedContext()
    {
        var json = JsonSerializer.Serialize(new Customer("Ada", 36), CasesJsonContext.Default.CustomerInfo);
        Assert.Equal("Ada", JsonSerializer.Deserialize(json, CasesJsonContext.Default.CustomerInfo)!.Name);
        Assert.Equal("Hello Bo", CustomerGreeting.Greet(CustomerGreeting.Rename(new Customer("Ada", 1), "Bo")));
    }

    [Fact]
    public void ThePatternMatchesDigits()
    {
        Assert.True(Patterns.IsNumber("123"));
        Assert.False(Patterns.IsNumber("12a"));
        Assert.StartsWith("Total 7", Sample.Label(2, 3.5m));
    }
}
