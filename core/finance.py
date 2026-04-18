"""Finance calculations for T1A.

The finance model is deliberately small: it supports deposit, fee, loan, cash
buffer, and the finance component score described in the tranche docs.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class FinanceOutputs:
    deposit_dollars: float
    total_upfront_cash: float
    loan_amount: float
    cash_buffer: float
    finance_score: float


def _num(value: Any, default: float = 0.0) -> float:
    if value is None or value == "":
        return default
    return float(value)


def clamp_score(value: float) -> float:
    return max(0.0, min(10.0, value))


def linear_score(value: float, best_at_or_above: float, worst_at_or_below: float) -> float:
    """Return 0-10 where higher input is better."""
    if value >= best_at_or_above:
        return 10.0
    if value <= worst_at_or_below:
        return 0.0
    return clamp_score(10.0 * (value - worst_at_or_below) / (best_at_or_above - worst_at_or_below))


def calculate_finance(assumed_purchase_price: Any, settings: dict[str, Any]) -> FinanceOutputs:
    price = _num(assumed_purchase_price)
    deposit_percent = _num(settings.get("deposit_percent"), 0.2)
    fees_estimate = _num(settings.get("fees_estimate"), 0.0)
    available_cash = _num(settings.get("available_cash"), 0.0)
    desired_buffer = _num(settings.get("desired_buffer"), 0.0)
    minimum_buffer = _num(settings.get("minimum_buffer"), 0.0)

    deposit_dollars = price * deposit_percent
    total_upfront_cash = deposit_dollars + fees_estimate
    loan_amount = price - deposit_dollars
    cash_buffer = available_cash - total_upfront_cash
    finance_score = linear_score(cash_buffer, desired_buffer, minimum_buffer)

    return FinanceOutputs(
        deposit_dollars=round(deposit_dollars, 2),
        total_upfront_cash=round(total_upfront_cash, 2),
        loan_amount=round(loan_amount, 2),
        cash_buffer=round(cash_buffer, 2),
        finance_score=round(finance_score, 2),
    )
