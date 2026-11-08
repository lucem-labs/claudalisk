using Claudalisk.Persistence;
using <Root>.Modules.<Name>.Persistence.Interfaces;
using Microsoft.Extensions.DependencyInjection;

namespace <Root>.Modules.<Name>.Persistence;

public static class <Name>PersistenceRegistration
{
    public static IServiceCollection Add<Name>Persistence(this IServiceCollection services)
    {
        services.AddModuleDbContext<<Name>DbContext>(<Name>DbContext.Schema);
        services.AddScoped<I<Aggregate>Store, <Aggregate>Store>();
        return services;
    }
}
