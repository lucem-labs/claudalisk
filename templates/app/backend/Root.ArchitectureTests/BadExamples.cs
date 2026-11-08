using System.ComponentModel.DataAnnotations;
using Claudalisk.Dispatching;
using Claudalisk.Domain;
using Claudalisk.Modules;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace <Root>.ArchitectureTests.BadExamples;

public sealed class OrdersModule : IModule
{
    public void ConfigureServices(IServiceCollection services, IConfiguration configuration)
    {
    }
}

public sealed record MessageWithBase(string Name) : BaseMessage;

public abstract record BaseMessage;

public sealed class MessageWithService
{
    public IServiceProvider? Services { get; init; }
}

public interface IServiceInInterfaces;

public sealed class BadController(string notDispatcher) : ControllerBase
{
    public string Value => notDispatcher;
}

public sealed class MisplacedResponse
{
    public DbSet<BadEntity>? Rows { get; init; }
}

public sealed record InvalidRequest([property: Required] string Name);

public sealed class WrongAggregate : AggregateRoot;

public sealed record WronglyNamedThing(string Name);

public sealed class SomeProcessor : IHandler<WronglyNamedThing, string>
{
    public ValueTask<string> HandleAsync(WronglyNamedThing message, CancellationToken cancellationToken) => ValueTask.FromResult(message.Name);
}

public sealed record DoThingCommand(string Name);

public sealed class MisplacedDoThingCommandValidator : AbstractValidator<DoThingCommand>;

public sealed record ThingHappened : IDomainEvent;

public sealed class ThingHappenedHandler : IHandler<ThingHappened, bool>
{
    public ValueTask<bool> HandleAsync(ThingHappened message, CancellationToken cancellationToken) => ValueTask.FromResult(true);
}

public sealed class FirstContract;

public sealed class SecondContract;

public sealed class FirstModule : IModule
{
    public Type Contract => typeof(FirstContract);

    public IReadOnlyCollection<Type> Dependencies => [typeof(SecondContract)];

    public void ConfigureServices(IServiceCollection services, IConfiguration configuration)
    {
    }
}

public sealed class SecondModule : IModule
{
    public Type Contract => typeof(SecondContract);

    public IReadOnlyCollection<Type> Dependencies => [typeof(FirstContract)];

    public void ConfigureServices(IServiceCollection services, IConfiguration configuration)
    {
    }
}

public sealed class BadEntity
{
    public int Id { get; set; }

    public DateTimeOffset Created { get; set; }

    public DateOnly Due { get; set; }

    public bool Archived { get; set; }

    public string ThisColumnNameIsDeliberatelyFarLongerThanPostgresAllowsForAnyIdentifierAtAll { get; set; } = "";

    public long Version { get; set; }

    public int OtherId { get; set; }

    public OtherEntity? Other { get; set; }
}

public sealed class OtherEntity
{
    public int Id { get; set; }
}

public sealed class BadContext(DbContextOptions<BadContext> options) : DbContext(options)
{
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("wrong");
        modelBuilder.Entity<BadEntity>();
        modelBuilder.Entity<OtherEntity>().ToTable("others", "elsewhere");
    }
}
