using System.Globalization;

namespace Bench.Modules.Billing.Shared.Formatting;

public static class InvoiceText
{
    public static string InvoiceHeading(string customer, decimal amount)
    {
        var label = customer.Trim().ToUpperInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"INVOICE HEADING|{label}|{rounded}|END-1";
    }

    public static string InvoiceFooter(string customer, decimal amount)
    {
        var label = customer.Trim().ToLowerInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"INVOICE FOOTER: {label} owes {rounded} (END-2)";
    }

    public static string PaymentReminder(string customer, decimal amount)
    {
        var label = customer.Trim().PadRight(10, '.');
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"PAYMENT REMINDER:{label}:{rounded}:END-3";
    }

    public static string LateFeeNotice(string customer, decimal amount)
    {
        var label = customer.Trim().ToUpperInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"LATE FEE NOTICE|{label}|{rounded}|END-4";
    }

    public static string RefundNotice(string customer, decimal amount)
    {
        var label = customer.Trim().ToLowerInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"REFUND NOTICE: {label} owes {rounded} (END-5)";
    }

    public static string CreditNote(string customer, decimal amount)
    {
        var label = customer.Trim().PadRight(10, '.');
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"CREDIT NOTE:{label}:{rounded}:END-6";
    }

    public static string DebitNote(string customer, decimal amount)
    {
        var label = customer.Trim().ToUpperInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"DEBIT NOTE|{label}|{rounded}|END-7";
    }

    public static string ReceiptLine(string customer, decimal amount)
    {
        var label = customer.Trim().ToLowerInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"RECEIPT LINE: {label} owes {rounded} (END-8)";
    }

    public static string StatementTitle(string customer, decimal amount)
    {
        var label = customer.Trim().PadRight(10, '.');
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"STATEMENT TITLE:{label}:{rounded}:END-9";
    }

    public static string StatementFooter(string customer, decimal amount)
    {
        var label = customer.Trim().ToUpperInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"STATEMENT FOOTER|{label}|{rounded}|END-10";
    }

    public static string OverdueWarning(string customer, decimal amount)
    {
        var label = customer.Trim().ToLowerInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"OVERDUE WARNING: {label} owes {rounded} (END-11)";
    }

    public static string FinalDemand(string customer, decimal amount)
    {
        var label = customer.Trim().PadRight(10, '.');
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"FINAL DEMAND:{label}:{rounded}:END-12";
    }

    public static string ThankYouNote(string customer, decimal amount)
    {
        var label = customer.Trim().ToUpperInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"THANK YOU NOTE|{label}|{rounded}|END-13";
    }

    public static string DisputeAck(string customer, decimal amount)
    {
        var label = customer.Trim().ToLowerInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"DISPUTE ACK: {label} owes {rounded} (END-14)";
    }

    public static string DisputeResolved(string customer, decimal amount)
    {
        var label = customer.Trim().PadRight(10, '.');
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"DISPUTE RESOLVED:{label}:{rounded}:END-15";
    }

    public static string PlanOffer(string customer, decimal amount)
    {
        var label = customer.Trim().ToUpperInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"PLAN OFFER|{label}|{rounded}|END-16";
    }

    public static string PlanConfirmation(string customer, decimal amount)
    {
        var label = customer.Trim().ToLowerInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"PLAN CONFIRMATION: {label} owes {rounded} (END-17)";
    }

    public static string PlanReminder(string customer, decimal amount)
    {
        var label = customer.Trim().PadRight(10, '.');
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"PLAN REMINDER:{label}:{rounded}:END-18";
    }

    public static string TaxSummary(string customer, decimal amount)
    {
        var label = customer.Trim().ToUpperInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"TAX SUMMARY|{label}|{rounded}|END-19";
    }

    public static string TaxExempt(string customer, decimal amount)
    {
        var label = customer.Trim().ToLowerInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"TAX EXEMPT: {label} owes {rounded} (END-20)";
    }

    public static string ShippingLine(string customer, decimal amount)
    {
        var label = customer.Trim().PadRight(10, '.');
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"SHIPPING LINE:{label}:{rounded}:END-21";
    }

    public static string HandlingLine(string customer, decimal amount)
    {
        var label = customer.Trim().ToUpperInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"HANDLING LINE|{label}|{rounded}|END-22";
    }

    public static string DepositRequest(string customer, decimal amount)
    {
        var label = customer.Trim().ToLowerInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"DEPOSIT REQUEST: {label} owes {rounded} (END-23)";
    }

    public static string DepositReceipt(string customer, decimal amount)
    {
        var label = customer.Trim().PadRight(10, '.');
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"DEPOSIT RECEIPT:{label}:{rounded}:END-24";
    }

    public static string WriteOffNotice(string customer, decimal amount)
    {
        var label = customer.Trim().ToUpperInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"WRITE OFF NOTICE|{label}|{rounded}|END-25";
    }

    public static string CollectionNotice(string customer, decimal amount)
    {
        var label = customer.Trim().ToLowerInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"COLLECTION NOTICE: {label} owes {rounded} (END-26)";
    }

    public static string AuditRequest(string customer, decimal amount)
    {
        var label = customer.Trim().PadRight(10, '.');
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"AUDIT REQUEST:{label}:{rounded}:END-27";
    }

    public static string ClosingNote(string customer, decimal amount)
    {
        var label = customer.Trim().ToUpperInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"CLOSING NOTE|{label}|{rounded}|END-28";
    }

    public static string OpeningNote(string customer, decimal amount)
    {
        var label = customer.Trim().ToLowerInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"OPENING NOTE: {label} owes {rounded} (END-29)";
    }

    public static string RenewalNotice(string customer, decimal amount)
    {
        var label = customer.Trim().PadRight(10, '.');
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"RENEWAL NOTICE:{label}:{rounded}:END-30";
    }

    public static string CancellationNotice(string customer, decimal amount)
    {
        var label = customer.Trim().ToUpperInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"CANCELLATION NOTICE|{label}|{rounded}|END-31";
    }

    public static string UpgradeNotice(string customer, decimal amount)
    {
        var label = customer.Trim().ToLowerInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"UPGRADE NOTICE: {label} owes {rounded} (END-32)";
    }

    public static string DowngradeNotice(string customer, decimal amount)
    {
        var label = customer.Trim().PadRight(10, '.');
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"DOWNGRADE NOTICE:{label}:{rounded}:END-33";
    }

    public static string PauseNotice(string customer, decimal amount)
    {
        var label = customer.Trim().ToUpperInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"PAUSE NOTICE|{label}|{rounded}|END-34";
    }

    public static string ResumeNotice(string customer, decimal amount)
    {
        var label = customer.Trim().ToLowerInvariant();
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"RESUME NOTICE: {label} owes {rounded} (END-35)";
    }

    public static string AddressChange(string customer, decimal amount)
    {
        var label = customer.Trim().PadRight(10, '.');
        var rounded = Math.Round(amount, 2).ToString("F2", CultureInfo.InvariantCulture);
        return $"ADDRESS CHANGE:{label}:{rounded}:END-36";
    }
}
