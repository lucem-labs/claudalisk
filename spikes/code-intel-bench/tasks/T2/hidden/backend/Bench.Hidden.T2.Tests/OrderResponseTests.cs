using System.Text.Json;
using Bench.Modules.Ordering.Shared.Orders;
using Claudalisk.AspNetCore;

namespace Bench.Hidden.T2.Tests;

public sealed class OrderResponseTests
{
    private static OrderResponse Sample() =>
        new(Guid.Parse("11111111-1111-1111-1111-111111111111"), "first", 3, Hal.Self("/api/orders/1"), Hal.Actions());

    [Fact]
    public void TheResponseHasALabelAndNoName()
    {
        var properties = typeof(OrderResponse).GetProperties().Select(property => property.Name).ToArray();

        Assert.Contains("Label", properties);
        Assert.DoesNotContain("Name", properties);
    }

    [Fact]
    public void TheLabelIsSerializedAsLabel()
    {
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(Sample(), new JsonSerializerOptions(JsonSerializerDefaults.Web)));

        Assert.Equal("first", document.RootElement.GetProperty("label").GetString());
        Assert.False(document.RootElement.TryGetProperty("name", out _));
    }
}
