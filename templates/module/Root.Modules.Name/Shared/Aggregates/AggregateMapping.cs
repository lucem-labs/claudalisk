using Claudalisk.AspNetCore;
using <Root>.Modules.<Name>.Domain;
using <Root>.Modules.<Name>.Interfaces;

namespace <Root>.Modules.<Name>.Shared.<Aggregates>;

internal static class <Aggregate>Mapping
{
    public static <Aggregate>Summary ToSummary(this <Aggregate> aggregate) =>
        new(aggregate.Id, aggregate.Name, aggregate.Version);

    public static <Aggregate>Response ToResponse(this <Aggregate>Summary summary) =>
        new(summary.Id, summary.Name, summary.Version, Hal.Self($"/api/<routes>/{summary.Id}"), Hal.Actions());
}
