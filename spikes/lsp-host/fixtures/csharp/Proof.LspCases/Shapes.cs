namespace Proof.LspCases;

public interface IShape
{
    double Area();
}

public sealed class Circle(double radius) : IShape
{
    public double Area() => Math.PI * radius * radius;
}

public sealed class Square(double side) : IShape
{
    public double Area() => side * side;
}

public static class ShapeReport
{
    public static string Describe(IShape shape) => $"{shape.GetType().Name}: {shape.Area():0.00}";
}
