namespace <Root>.Modules.<Name>.Persistence;

public sealed class <Aggregate>Entity
{
    public Guid Id { get; set; }

    public required string Name { get; set; }

    public long Version { get; set; }
}
