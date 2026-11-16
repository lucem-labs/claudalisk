using Bench.Modules.Billing.Shared.Formatting;

namespace Bench.Hidden.T6.Tests;

public sealed class InvoiceTextTests
{
    private const string Customer = "  acme  ";
    private const decimal Amount = 1234.567m;

    public static TheoryData<string> Untouched => new(Rows().Select(row => row.Name));

    [Fact]
    public void ThePaymentReminderAsksForPaymentWithinFourteenDays() =>
        Assert.Equal("Dear acme, please pay 1234.57 within 14 days.", InvoiceText.PaymentReminder(Customer, Amount));

    [Theory]
    [MemberData(nameof(Untouched))]
    public void EveryOtherMethodStaysAsItWas(string name)
    {
        var row = Rows().Single(candidate => candidate.Name == name);

        Assert.Equal(row.Expected, row.Format(Customer, Amount));
    }

    private static (string Name, Func<string, decimal, string> Format, string Expected)[] Rows() =>
    [
        (nameof(InvoiceText.InvoiceHeading), InvoiceText.InvoiceHeading, "INVOICE HEADING|ACME|1234.57|END-1"),
        (nameof(InvoiceText.InvoiceFooter), InvoiceText.InvoiceFooter, "INVOICE FOOTER: acme owes 1234.57 (END-2)"),
        (nameof(InvoiceText.LateFeeNotice), InvoiceText.LateFeeNotice, "LATE FEE NOTICE|ACME|1234.57|END-4"),
        (nameof(InvoiceText.RefundNotice), InvoiceText.RefundNotice, "REFUND NOTICE: acme owes 1234.57 (END-5)"),
        (nameof(InvoiceText.CreditNote), InvoiceText.CreditNote, "CREDIT NOTE:acme......:1234.57:END-6"),
        (nameof(InvoiceText.DebitNote), InvoiceText.DebitNote, "DEBIT NOTE|ACME|1234.57|END-7"),
        (nameof(InvoiceText.ReceiptLine), InvoiceText.ReceiptLine, "RECEIPT LINE: acme owes 1234.57 (END-8)"),
        (nameof(InvoiceText.StatementTitle), InvoiceText.StatementTitle, "STATEMENT TITLE:acme......:1234.57:END-9"),
        (nameof(InvoiceText.StatementFooter), InvoiceText.StatementFooter, "STATEMENT FOOTER|ACME|1234.57|END-10"),
        (nameof(InvoiceText.OverdueWarning), InvoiceText.OverdueWarning, "OVERDUE WARNING: acme owes 1234.57 (END-11)"),
        (nameof(InvoiceText.FinalDemand), InvoiceText.FinalDemand, "FINAL DEMAND:acme......:1234.57:END-12"),
        (nameof(InvoiceText.ThankYouNote), InvoiceText.ThankYouNote, "THANK YOU NOTE|ACME|1234.57|END-13"),
        (nameof(InvoiceText.DisputeAck), InvoiceText.DisputeAck, "DISPUTE ACK: acme owes 1234.57 (END-14)"),
        (nameof(InvoiceText.DisputeResolved), InvoiceText.DisputeResolved, "DISPUTE RESOLVED:acme......:1234.57:END-15"),
        (nameof(InvoiceText.PlanOffer), InvoiceText.PlanOffer, "PLAN OFFER|ACME|1234.57|END-16"),
        (nameof(InvoiceText.PlanConfirmation), InvoiceText.PlanConfirmation, "PLAN CONFIRMATION: acme owes 1234.57 (END-17)"),
        (nameof(InvoiceText.PlanReminder), InvoiceText.PlanReminder, "PLAN REMINDER:acme......:1234.57:END-18"),
        (nameof(InvoiceText.TaxSummary), InvoiceText.TaxSummary, "TAX SUMMARY|ACME|1234.57|END-19"),
        (nameof(InvoiceText.TaxExempt), InvoiceText.TaxExempt, "TAX EXEMPT: acme owes 1234.57 (END-20)"),
        (nameof(InvoiceText.ShippingLine), InvoiceText.ShippingLine, "SHIPPING LINE:acme......:1234.57:END-21"),
        (nameof(InvoiceText.HandlingLine), InvoiceText.HandlingLine, "HANDLING LINE|ACME|1234.57|END-22"),
        (nameof(InvoiceText.DepositRequest), InvoiceText.DepositRequest, "DEPOSIT REQUEST: acme owes 1234.57 (END-23)"),
        (nameof(InvoiceText.DepositReceipt), InvoiceText.DepositReceipt, "DEPOSIT RECEIPT:acme......:1234.57:END-24"),
        (nameof(InvoiceText.WriteOffNotice), InvoiceText.WriteOffNotice, "WRITE OFF NOTICE|ACME|1234.57|END-25"),
        (nameof(InvoiceText.CollectionNotice), InvoiceText.CollectionNotice, "COLLECTION NOTICE: acme owes 1234.57 (END-26)"),
        (nameof(InvoiceText.AuditRequest), InvoiceText.AuditRequest, "AUDIT REQUEST:acme......:1234.57:END-27"),
        (nameof(InvoiceText.ClosingNote), InvoiceText.ClosingNote, "CLOSING NOTE|ACME|1234.57|END-28"),
        (nameof(InvoiceText.OpeningNote), InvoiceText.OpeningNote, "OPENING NOTE: acme owes 1234.57 (END-29)"),
        (nameof(InvoiceText.RenewalNotice), InvoiceText.RenewalNotice, "RENEWAL NOTICE:acme......:1234.57:END-30"),
        (nameof(InvoiceText.CancellationNotice), InvoiceText.CancellationNotice, "CANCELLATION NOTICE|ACME|1234.57|END-31"),
        (nameof(InvoiceText.UpgradeNotice), InvoiceText.UpgradeNotice, "UPGRADE NOTICE: acme owes 1234.57 (END-32)"),
        (nameof(InvoiceText.DowngradeNotice), InvoiceText.DowngradeNotice, "DOWNGRADE NOTICE:acme......:1234.57:END-33"),
        (nameof(InvoiceText.PauseNotice), InvoiceText.PauseNotice, "PAUSE NOTICE|ACME|1234.57|END-34"),
        (nameof(InvoiceText.ResumeNotice), InvoiceText.ResumeNotice, "RESUME NOTICE: acme owes 1234.57 (END-35)"),
        (nameof(InvoiceText.AddressChange), InvoiceText.AddressChange, "ADDRESS CHANGE:acme......:1234.57:END-36"),
    ];
}
