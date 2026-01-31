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
    // NOTE: `federalRate` is ignored in v1.1; we compute taxes using progressive
    // federal and state brackets that mirror the Excel assumptions.  It remains
    // optional here for backwards compatibility but will not influence the
    // calculation.  The model assumes the filer is single and resides in
    // Virginia, and uses 2025 brackets with the standard deductions.
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
    carFundMonthly,
    // Optional: choose debt payoff strategy. Supported values: 'creditFirst' (default),
    // 'avalanche' (highest APR first), 'snowball' (lowest balance first).
    debtStrategy = 'creditFirst',
    // Optional: compute biweekly paychecks. If true, overrides paychecksPerMonth
    // by using 26 pay periods per year (approx 2.1667 per month).
    biweekly = false
  } = inputs;

  // --- Tax configuration (2025 tax year) ---
  // Federal tax brackets for single filers. Each limit is the upper bound of
  // the bracket. Rates correspond to the interval up to that limit. The
  // thresholds and rates come from Jackson Hewitt's 2025 federal tax table for
  // single filers【625846763907268†L250-L282】.  For example, income up to $11,925
  // is taxed at 10%, income between $11,926 and $48,475 at 12%, etc.
  const FED_LIMITS = [11925, 48475, 103350, 197300, 250525, 626350];
  const FED_RATES  = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];
  const FED_STANDARD_DEDUCTION = 15750; // Standard deduction for single filers in 2025【625846763907268†L422-L436】

  // Virginia state tax brackets (2025).  Income up to $3,000 is taxed at 2%,
  // between $3,001 and $5,000 at 3%, between $5,001 and $17,000 at 5%, and
  // amounts above $17,000 at 5.75%.  These thresholds and formulas come from
  // NerdWallet's summary of Virginia state income tax rates【762898022242874†L910-L944】.  The
  // standard deduction for Virginia increases to $8,750 for single filers in
  // tax year 2025【827684009435518†L294-L299】.
  const VA_STANDARD_DEDUCTION = 8750;

  /**
   * Compute federal income tax owed given taxable income.  Implements
   * progressive rates using the 2025 brackets above.
   * @param {number} income - taxable income after deductions
   * @returns {number} annual federal tax
   */
  function computeFederalTax(income) {
    if (income <= 0) return 0;
    let tax = 0;
    let prevLimit = 0;
    for (let i = 0; i < FED_RATES.length; i++) {
      const rate = FED_RATES[i];
      // Use Infinity for the last bracket
      const limit = i < FED_LIMITS.length ? FED_LIMITS[i] : Infinity;
      if (income > prevLimit) {
        const taxable = Math.min(income, limit) - prevLimit;
        tax += taxable * rate;
        prevLimit = limit;
      } else {
        break;
      }
    }
    return tax;
  }

  /**
   * Compute Virginia state income tax owed given taxable income.  Uses the
   * piecewise formulas published by the Virginia Department of Taxation as
   * summarized by NerdWallet【762898022242874†L910-L944】.
   * @param {number} income - taxable income after state deductions
   * @returns {number} annual Virginia tax
   */
  function computeVaTax(income) {
    if (income <= 0) return 0;
    if (income <= 3000) {
      return income * 0.02;
    } else if (income <= 5000) {
      return 60 + (income - 3000) * 0.03;
    } else if (income <= 17000) {
      return 120 + (income - 5000) * 0.05;
    } else {
      return 720 + (income - 17000) * 0.0575;
    }
  }

  // Compute monthly gross salary and pre‑tax contributions
  // Determine effective number of paychecks per month.  When `biweekly` is true,
  // there are 26 paychecks per year (every two weeks), which equates to 26/12 per month.
  const effectivePaychecksPerMonth = biweekly ? (26 / 12) : paychecksPerMonth;
  const grossMonthlySalary = salary / 12;
  const employee401kMonthly = (salary * k401Rate) / 12;
  const employer401kMonthly = (salary * employerMatchRate) / 12;
  const hsaMonthly = hsaPerPaycheck * effectivePaychecksPerMonth;

  // Annual values for federal/state tax computation
  const annualGross = salary;
  const annualPreTax = salary * k401Rate + hsaMonthly * 12;
  const annualTaxableFederal = Math.max(0, annualGross - annualPreTax - FED_STANDARD_DEDUCTION);
  const annualTaxableVa = Math.max(0, annualGross - annualPreTax - VA_STANDARD_DEDUCTION);
  const annualFederalTax = computeFederalTax(annualTaxableFederal);
  const annualVaTax = computeVaTax(annualTaxableVa);
  const taxMonthly = (annualFederalTax + annualVaTax) / 12;
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
  let cashSavingsBalance = 0;
  let carFundBalance = 0;
  let retirementSavingsBalance = 0;
  let hsaSavingsBalance = 0;
  let monthCounter = 0;
  // Continue until payoff date inclusive
  while (currentDate <= payoffDate && monthCounter < 240) { // safety limit of 20 years
    const monthLabel = formatMonth(currentDate);
    // Step 1: cash available after living and remittance
    const available = netMonthly - living - remittance;
    // Step 2: credit card
    const ccInterest = ccBalance * (ccApr / 12);
    let ccPayment = 0;
    let loanPayment = 0;
    let ccEnding;
    let loanEnding;
    // Step 3: loan
    const loanInterest = loanBalance * (loanApr / 12);
    // Determine which debt to pay first based on strategy
    const strategy = debtStrategy;
    // Helper function to compute credit card payment given available funds
    function computeCcPayment(avail) {
      if (ccBalance <= 0) return 0;
      // Minimum payment is up to ccPaymentMax but cannot exceed balance + interest or available cash
      return Math.min(ccPaymentMax, ccBalance + ccInterest, Math.max(0, avail));
    }
    // Helper function to compute loan payment given available funds
    function computeLoanPayment(avail) {
      if (loanBalance <= 0) return 0;
      let payment = monthlyLoanPayment + loanExtra;
      payment = Math.min(payment, loanBalance + loanInterest, Math.max(0, avail));
      return payment;
    }
    // Evaluate strategy and allocate payments
    if (strategy === 'avalanche') {
      // Pay higher APR first
      if (ccApr >= loanApr) {
        ccPayment = computeCcPayment(available);
        loanPayment = computeLoanPayment(available - ccPayment);
      } else {
        loanPayment = computeLoanPayment(available);
        ccPayment = computeCcPayment(available - loanPayment);
      }
    } else if (strategy === 'snowball') {
      // Pay smaller balance first
      if (ccBalance <= loanBalance) {
        ccPayment = computeCcPayment(available);
        loanPayment = computeLoanPayment(available - ccPayment);
      } else {
        loanPayment = computeLoanPayment(available);
        ccPayment = computeCcPayment(available - loanPayment);
      }
    } else {
      // Default: pay credit card first
      ccPayment = computeCcPayment(available);
      loanPayment = computeLoanPayment(available - ccPayment);
    }
    // Calculate ending balances
    ccEnding = ccBalance + ccInterest - ccPayment;
    loanEnding = loanBalance + loanInterest - loanPayment;

    // Step 4: leftover after debt payments
    const leftoverAfterDebt = available - ccPayment - loanPayment;
    // Car fund contribution is always made; if not enough leftover, cash will go negative
    const carGoal = inputs.carFundGoal ?? 0;

// If goal is 0, behave like today (always contribute).
// Otherwise contribute only until reaching the goal.
    let carContribution = carFundMonthly;

    if (carGoal > 0) {
      const remainingToGoal = Math.max(0, carGoal - carFundBalance);
      carContribution = Math.min(carContribution, remainingToGoal); 
    }
    carFundBalance += carContribution;

    // Compute cash savings deposit: leftover - carContribution + additionalSavings
    let depositCash = 0;
    if (leftoverAfterDebt - carContribution + additionalSavings > 0) {
      depositCash = leftoverAfterDebt - carContribution + additionalSavings;
    }
    cashSavingsBalance += depositCash;
    // Retirement and HSA contributions occur every month regardless of leftover
    retirementSavingsBalance += employer401kMonthly + employee401kMonthly;
    hsaSavingsBalance += hsaMonthly;
    // Total savings contribution for reporting includes cash deposit plus retirement and HSA (pre-tax) plus car fund
    const savingsContribution = depositCash + employer401kMonthly + employee401kMonthly + hsaMonthly;
    // Cash remaining after all flows (not counting pre‑tax savings).  If leftover could not cover car + extra deposit, we show negative representing additional savings taken from reserves.
    let cashRemaining;
    if (leftoverAfterDebt - carContribution + additionalSavings > 0) {
      cashRemaining = -additionalSavings;
    } else {
      cashRemaining = leftoverAfterDebt - carContribution;
    }
    // Compute net worth: all savings balances plus car fund minus outstanding debts
    const netWorth = cashSavingsBalance + carFundBalance + retirementSavingsBalance + hsaSavingsBalance - ccEnding - loanEnding;

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
      // Cash savings metrics
      cashSavingsBeginning: cashSavingsBalance - depositCash,
      cashSavingsContribution: depositCash,
      cashSavingsEnding: cashSavingsBalance,
      // Retirement and HSA metrics
      retirementSavingsContribution: employer401kMonthly + employee401kMonthly,
      retirementSavingsEnding: retirementSavingsBalance,
      hsaSavingsContribution: hsaMonthly,
      hsaSavingsEnding: hsaSavingsBalance,
      // Aggregate savings contribution (includes cash, retirement, HSA)
      savingsContribution,
      // Car fund metrics
      carFundBeginning: carFundBalance - carContribution,
      carFundContribution: carContribution,
      carFundEnding: carFundBalance,
      // Net worth
      netWorth,
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