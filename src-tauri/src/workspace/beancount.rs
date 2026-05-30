pub fn render_main_bean(business_name: &str, currency: &str) -> String {
    format!(
        "option \"title\" \"{}\"\noption \"operating_currency\" \"{}\"\n\ninclude \"accounts.bean\"\ninclude \"opening-balances.bean\"\n",
        business_name, currency
    )
}

pub fn render_accounts_bean(books_start_date: &str, currency: &str) -> String {
    let accounts = [
        "Assets:Bank:Checking",
        "Assets:Bank:Savings",
        "Assets:PaymentProcessors:Stripe",
        "Liabilities:CreditCards:Business",
        "Liabilities:Loans",
        "Equity:Opening-Balances",
        "Equity:Owner-Contributions",
        "Equity:Owner-Draws",
        "Income:Sales",
        "Income:Services",
        "Income:Other",
        "Expenses:Advertising",
        "Expenses:Bank-Fees",
        "Expenses:Contractors",
        "Expenses:Meals",
        "Expenses:Office",
        "Expenses:Professional-Services",
        "Expenses:Software",
        "Expenses:Travel",
        "Expenses:Utilities",
    ];

    let mut output =
        "; Diurnum Starter Chart of Accounts\n; Editable by the Founder-Operator.\n\n"
            .to_string();

    for (index, account) in accounts.iter().enumerate() {
        if matches!(index, 3 | 5 | 8 | 11) {
            output.push('\n');
        }
        output.push_str(&format!("{books_start_date} open {account} {currency}\n"));
    }

    output
}

pub fn render_opening_balances_bean(business_name: &str) -> String {
    format!(
        "; Opening balances for {}.\n; Diurnum starts balances at zero. Edit this file when real opening balances are known.\n",
        business_name
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_main_bean_with_includes() {
        assert_eq!(
            render_main_bean("Acme Studio", "USD"),
            "option \"title\" \"Acme Studio\"\noption \"operating_currency\" \"USD\"\n\ninclude \"accounts.bean\"\ninclude \"opening-balances.bean\"\n"
        );
    }

    #[test]
    fn renders_accounts_bean_with_starter_chart() {
        let accounts = render_accounts_bean("2026-01-01", "USD");

        assert!(accounts.contains("; Diurnum Starter Chart of Accounts"));
        assert!(accounts.contains("2026-01-01 open Assets:Bank:Checking USD"));
        assert!(accounts.contains("2026-01-01 open Liabilities:CreditCards:Business USD"));
        assert!(accounts.contains("2026-01-01 open Equity:Opening-Balances USD"));
        assert!(accounts.contains("2026-01-01 open Income:Sales USD"));
        assert!(accounts.contains("2026-01-01 open Expenses:Software USD"));
    }

    #[test]
    fn renders_opening_balances_bean() {
        assert_eq!(
            render_opening_balances_bean("Acme Studio"),
            "; Opening balances for Acme Studio.\n; Diurnum starts balances at zero. Edit this file when real opening balances are known.\n"
        );
    }
}
