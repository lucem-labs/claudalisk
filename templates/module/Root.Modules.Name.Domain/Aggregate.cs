using Claudalisk.Domain;

namespace <Root>.Modules.<Name>.Domain;

public sealed class <Aggregate> : AggregateRoot
{
    private <Aggregate>(Guid id, string name, long version)
        : base(version)
    {
        Id = id;
        Name = name;
    }

    public Guid Id { get; }

    public string Name { get; }

    public static <Aggregate> Create(Guid id, string name) => new(id, name, InitialVersion);

    public static <Aggregate> Restore(Guid id, string name, long version) => new(id, name, version);
}
