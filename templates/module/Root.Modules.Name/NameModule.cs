using Claudalisk.Modules;
using <Root>.Modules.<Name>.Interfaces;
using <Root>.Modules.<Name>.Persistence;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace <Root>.Modules.<Name>;

public sealed class <Name>Module : IModule
{
    public Type Contract => typeof(<Name>Contract);

    public string Description => "<Name> module.";

    public void ConfigureServices(IServiceCollection services, IConfiguration configuration) =>
        services.Add<Name>Persistence();
}
