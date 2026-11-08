using System.Text.Json.Serialization;
using Claudalisk.AspNetCore;

namespace <Root>.Modules.<Name>.Shared.<Aggregates>;

public sealed record <Aggregate>Response(
    Guid Id,
    string Name,
    long Version,
    [property: JsonPropertyName(Hal.LinksMember)] HalLinks Links,
    [property: JsonPropertyName(Hal.ActionsMember)] HalActions Actions);
