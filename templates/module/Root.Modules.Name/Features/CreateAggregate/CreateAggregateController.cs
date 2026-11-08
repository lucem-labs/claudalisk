using Claudalisk.Dispatching;
using <Root>.Modules.<Name>.Interfaces;
using <Root>.Modules.<Name>.Shared.<Aggregates>;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace <Root>.Modules.<Name>.Features.Create<Aggregate>;

[ApiController]
[Route("api/<routes>")]
public sealed class Create<Aggregate>Controller(IDispatcher dispatcher) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<<Aggregate>Response>(StatusCodes.Status201Created)]
    public async Task<ActionResult<<Aggregate>Response>> Create(Create<Aggregate>Request request, CancellationToken cancellationToken)
    {
        var summary = await dispatcher.SendAsync<<Aggregate>Summary>(request.ToCommand(), cancellationToken);
        return Created($"/api/<routes>/{summary.Id}", summary.ToResponse());
    }
}
