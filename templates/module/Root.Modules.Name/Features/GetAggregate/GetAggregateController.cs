using Claudalisk.Dispatching;
using <Root>.Modules.<Name>.Interfaces;
using <Root>.Modules.<Name>.Shared.<Aggregates>;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace <Root>.Modules.<Name>.Features.Get<Aggregate>;

[ApiController]
[Route("api/<routes>/{id:guid}")]
public sealed class Get<Aggregate>Controller(IDispatcher dispatcher) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<<Aggregate>Response>(StatusCodes.Status200OK)]
    public async Task<ActionResult<<Aggregate>Response>> Get(Guid id, CancellationToken cancellationToken)
    {
        var summary = await dispatcher.SendAsync<<Aggregate>Summary>(new Get<Aggregate>Query(id), cancellationToken);
        return Ok(summary.ToResponse());
    }
}
