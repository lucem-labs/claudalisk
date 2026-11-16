import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const FILES = {
  'Ordering.slnx': '<Solution>\n  <Project Path="backend/Ordering/Ordering.csproj" />\n</Solution>\n',
  'backend/Ordering/Ordering.csproj': '<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n    <TargetFramework>net10.0</TargetFramework>\n    <ImplicitUsings>enable</ImplicitUsings>\n    <Nullable>enable</Nullable>\n  </PropertyGroup>\n</Project>\n',
  'backend/Ordering/Order.cs': `namespace Ordering;

public sealed class Order
{
    private readonly List<decimal> lines = [];

    public decimal Place(int quantity, decimal unit)
    {
        var total = Pricing.Total(quantity, unit);
        lines.Add(total);
        return total;
    }

    public decimal Place(decimal amount)
    {
        lines.Add(amount);
        return amount;
    }

    public int Count()
    {
        return lines.Count;
    }
}
`,
  'backend/Ordering/Pricing.cs': `namespace Ordering;

public static class Pricing
{
    public static decimal Total(int quantity, decimal unit) => quantity * unit;

    public static decimal Total(decimal amount) => Total(1, amount);
}

public static class Checkout
{
    public static decimal Run()
    {
        var order = new Order();
        return order.Place(2, 3.5m) + order.Place(4m) + Pricing.Total(2, 1m) + order.Count();
    }
}

public interface IShape
{
    double Area();
}

public sealed class Square(double side) : IShape
{
    public double Area() => side * side;
}
`,
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', strict: true, noEmit: true, skipLibCheck: true }, include: ['src'] }, null, 2) + '\n',
  'src/entities/order/model/use-order.ts': `export interface Order {
  id: string
  total: number
}

export function useOrder(id: string): Order {
  return { id, total: 0 }
}

export function orderTotal(order: Order): number {
  return order.total
}
`,
  'src/entities/order/index.ts': "export { useOrder, orderTotal } from './model/use-order'\nexport type { Order } from './model/use-order'\n",
  'src/pages/checkout/ui/summary.ts': `import { orderTotal, useOrder } from '../../../entities/order'

export function summarize(id: string): string {
  const order = useOrder(id)
  return \`\${order.id}: \${orderTotal(order)}\`
}

export function twice(id: string): number {
  return orderTotal(useOrder(id)) * 2
}
`,
}

export function createFixture() {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'code-intel-')))
  for (const [name, content] of Object.entries(FILES)) {
    const path = join(root, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  return { root, remove: () => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }) }
}
