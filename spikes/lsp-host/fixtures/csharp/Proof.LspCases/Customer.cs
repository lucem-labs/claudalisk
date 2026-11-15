using System.Text.Json.Serialization;

namespace Proof.LspCases;

public sealed record Customer(string Name, int Age);

[JsonSerializable(typeof(Customer), TypeInfoPropertyName = "CustomerInfo")]
public sealed partial class CasesJsonContext : JsonSerializerContext;

public static class CustomerGreeting
{
    public static string Greet(Customer customer) => $"Hello {customer.Name}";

    public static Customer Rename(Customer customer, string name) => customer with { Name = name };
}
