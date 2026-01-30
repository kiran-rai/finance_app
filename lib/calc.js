/*
 * Financial projection calculator for the personal finance app.
 *
 * The function `calculateProjection` consumes an `inputs` object containing
 * the user's financial assumptions and returns an array of monthly
 * projections. Each projection entry contains the state of the credit card,
 * student loan, savings and car fund for that month as well as the cash
 * leftover.  This logic mirrors the Excel workbook included in this
 * repository but is simplified to run entirely in the browser. It is not
 * meant to be tax‑accurate and uses a flat tax rate instead of detailed
 * brackets.
 */

/**
 * Compute the payment for an amortizing loan using the standard PMT formula.
 *
 * @param {number} rate - monthly interest rate (APR/12).
 * @param {number} nper - total number of payments (months).
 * @param {number} pv - present value or principal amount.
 * @returns {number} constant monthly payment.
 */
export function pmt(rate, nper, pv) {
  if (rate === 0) {
    return pv / nper;
  }
  return (rate * pv) / (1 - Math.pow(1 + rate, -nper));
}

/**
 * Helper to add months to a Date. Returns a new Date.
 *
 * @param {Date} date
 * @param {number} months
 * @returns {Date}
 */
function addMonths(date, months) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Format a Date into YYYY-MM for display.
 *
 * @param {Date} date
 * @returns {string}
 */
function formatMonth(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Main projection calculator. Performs month-by-month cash flow
 * calculations given user inputs. Simplifies taxes by applying a flat
 * combined federal/state tax rate to the gross salary after retirement
 * contributions. See README for explanation of each input property.
 *
 * @param {Object} inputs
 * @param {number} inputs.salary - annual gross salary.
 * @param {number} inputs.federalRate - combined federal + state tax rate (0-1).
 * @param {number} inputs.paychecksPerMonth - number of paychecks each month.
 * @param {number} inputs.401kRate - portion of salary contributed to 401k (0-1).
 * @param {number} inputs.employerMatchRate - employer 401k match rate (0-1).
 * @param {number} inputs.hsaPerPaycheck - HSA contribution per paycheck.
 * @param {number} inputs.living - monthly living expenses.
 * @param {number} inputs.remittance - monthly remittance to family.
 * @param {number} inputs.ccDebt - starting credit card balance.
 * @param {number} inputs.ccApr - credit card APR (0-1).
 * @param {number} inputs.ccPaymentMax - maximum credit card payment per month.
 * @param {number} inputs.loanDebt - starting student loan balance.
 * @param {number} inputs.loanApr - student loan APR (0-1).
 * @param {string} inputs.loanPayoffDate - ISO date string (YYYY-MM) when loan must be paid off.
 * @param {number} inputs.loanExtra - extra payment to loan each month.
 * @param {Date} inputs.startDate - start month for the projection.
 * @param {number} inputs.additionalSavings - additional savings deposit each month.
 * @param {number} inputs.carFundMonthly - monthly contribution to the car fund.
 * @returns {Array<Object>} list of monthly projection objects.
 */
export function calculateProjection(inputs) {
  const {
    salary,
    federalRate,
    paychecksPerMonth,
    ['401kRate']: k401Rate,
    employerMatchRate,
    hsaPerPaycheck,
    living,
    remittance,
    ccDebt,
    ccApr,
    ccPaymentMax,
    loanDebt,
    loanApr,
    loanPayoffDate,
    loanExtra,
    startDate,
    additionalSavings,
    carFundMonthly
  } = inputs;

  // Compute constants
  const grossMonthlySalary = salary / 12;
  const employee401kMonthly = (salary * k401Rate) / 12;
  const employer401kMonthly = (salary * employerMatchRate) / 12;
  const hsaMonthly = hsaPerPaycheck * paychecksPerMonth;

  // Simplified tax: apply flat rate on gross minus pre-tax contributions
  const taxableMonthly = grossMonthlySalary - employee401kMonthly - hsaMonthly;
  const taxMonthly = taxableMonthly * federalRate;
  const netMonthly = grossMonthlySalary - employee401kMonthly - hsaMonthly - taxMonthly;

  // Determine number of months until payoff date
  const payoffParts = loanPayoffDate.split('-');
  const payoffDate = new Date(parseInt(payoffParts[0], 10), parseInt(payoffParts[1], 10) - 1, 1);
  // Copy start date to avoid mutating input
  let currentDate = new Date(startDate.getTime());

  // Pre-calc the base loan payment using PMT. Use months difference + 1 to be inclusive.
  let monthsToPay = ((payoffDate.getFullYear() - currentDate.getFullYear()) * 12 + (payoffDate.getMonth() - currentDate.getMonth())) + 1;
  if (monthsToPay < 1) monthsToPay = 1;
  const monthlyLoanPayment = pmt(loanApr / 12, monthsToPay, loanDebt);

  const rows = [];
  let ccBalance = ccDebt;
  let loanBalance = loanDebt;
  let savingsBalance = 0;
  let carFundBalance = 0;
  let monthCounter = 0;
  // Continue until payoff date inclusive
  while (currentDate <= payoffDate && monthCounter < 240) { // safety limit of 20 years
    const monthLabel = formatMonth(currentDate);
    // Step 1: cash available after living and remittance
    const available = netMonthly - living - remittance;
    // Step 2: credit card
    const ccInterest = ccBalance * (ccApr / 12);
    let ccPayment = 0;
    if (ccBalance > 0) {
      // Minimum required: at least the interest
      const maxPay = ccPaymentMax + 0; // no extra by default
      ccPayment = Math.min(maxPay, ccBalance + ccInterest, Math.max(0, available));
    }
    const ccEnding = ccBalance + ccInterest - ccPayment;

    // Step 3: loan
    const loanInterest = loanBalance * (loanApr / 12);
    // Actual payment is base + extra but cannot exceed balance + interest
    let loanPayment = 0;
    if (loanBalance > 0) {
      loanPayment = monthlyLoanPayment + loanExtra;
      loanPayment = Math.min(loanPayment, loanBalance + loanInterest, Math.max(0, available - ccPayment));
    }
    const loanEnding = loanBalance + loanInterest - loanPayment;

    // Step 4: leftover after debt payments
    const leftoverAfterDebt = available - ccPayment - loanPayment;
    // Car fund contribution is always made; if not enough leftover, cash will go negative
    const carContribution = carFundMonthly;
    carFundBalance += carContribution;

    // Additional savings deposit is optional
    // Compute deposit to general savings: leftover - carContribution + additionalSavings
    let depositGeneral = 0;
    if (leftoverAfterDebt - carContribution + additionalSavings > 0) {
      depositGeneral = leftoverAfterDebt - carContribution + additionalSavings;
    }
    // Add 401k employer and employee contributions to savings tally for reporting (not part of net cash flow)
    const savingsContribution = depositGeneral + employer401kMonthly + employee401kMonthly;
    savingsBalance += depositGeneral;
    // Cash remaining after all flows (without counting 401k contributions)
    let cashRemaining;
    if (leftoverAfterDebt - carContribution + additionalSavings > 0) {
      cashRemaining = -additionalSavings;
    } else {
      cashRemaining = leftoverAfterDebt - carContribution;
    }

    rows.push({
      month: monthLabel,
      netMonthly,
      living,
      remittance,
      available,
      ccBeginning: ccBalance,
      ccInterest,
      ccPayment,
      ccEnding,
      loanBeginning: loanBalance,
      loanInterest,
      loanPayment,
      loanEnding,
      savingsBeginning: savingsBalance - depositGeneral,
      savingsContribution,
      savingsEnding: savingsBalance,
      carFundBeginning: carFundBalance - carContribution,
      carFundContribution: carContribution,
      carFundEnding: carFundBalance,
      cashRemaining
    });

    // Update balances for next month
    ccBalance = ccEnding;
    loanBalance = loanEnding;
    // Move to next month
    currentDate = addMonths(currentDate, 1);
    monthCounter += 1;
  }
  return rows;
}