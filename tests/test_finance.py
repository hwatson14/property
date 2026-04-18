from core.finance import calculate_finance


def test_finance_outputs_and_score_are_deterministic():
    outputs = calculate_finance(
        800000,
        {
            "available_cash": 240000,
            "deposit_percent": 0.2,
            "fees_estimate": 30000,
            "desired_buffer": 50000,
            "minimum_buffer": 0,
        },
    )

    assert outputs.deposit_dollars == 160000
    assert outputs.total_upfront_cash == 190000
    assert outputs.loan_amount == 640000
    assert outputs.cash_buffer == 50000
    assert outputs.finance_score == 10


def test_finance_score_interpolates_cash_buffer():
    outputs = calculate_finance(
        800000,
        {
            "available_cash": 215000,
            "deposit_percent": 0.2,
            "fees_estimate": 30000,
            "desired_buffer": 50000,
            "minimum_buffer": 0,
        },
    )

    assert outputs.cash_buffer == 25000
    assert outputs.finance_score == 5
