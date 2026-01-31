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
    biweekly = false,
    // Car purchase parameters (v1.5)
    carPurchaseDate,
    carPurchasePrice = 0,
    carFinanced = false,
    carDownPayment = 0,
    carLoanApr = 0,
    carLoanTermMonths = 0,
    carOngoingMonthly = 0,
    // Refinance parameters (v1.5)
    refiDate,
    refiApr,
    refiTermMonths,
    refiFeeRate = 0,
    // Emergency fund minimum (v1.5)
    minCashBuffer = 0,
    // Stop car contributions once the goal is reached
    stopCarContributionAtGoal = false,
    // Car fund goal (needed for stop logic)
    carFundGoal = 0
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

  // Parse optional date strings for car purchase and refinance
  const purchaseDateObj = carPurchaseDate ? new Date(carPurchaseDate) : null;
  const refiDateObj = refiDate ? new Date(refiDate) : null;

  // Track car purchase state and car loan. carPurchased indicates whether the
  // purchase event has occurred. carLoanBalance holds any financed portion
  // remaining. monthlyCarLoanPayment stores the constant payment for the car loan.
  let carPurchased = false;
  let carLoanBalance = 0;
  let monthlyCarLoanPayment = 0;
  // After purchase, this stores the ongoing monthly operating cost (insurance,
  // fuel, maintenance). Before purchase it is zero.
  let carOngoingApplicable = 0;

  // Determine number of months until payoff date
  const payoffParts = loanPayoffDate.split('-');
  const payoffDate = new Date(parseInt(payoffParts[0], 10), parseInt(payoffParts[1], 10) - 1, 1);
  // Copy start date to avoid mutating input
  let currentDate = new Date(startDate.getTime());

  // Pre-calc the base loan payment using PMT. Use months difference + 1 to be inclusive.
  let monthsToPay = ((payoffDate.getFullYear() - currentDate.getFullYear()) * 12 + (payoffDate.getMonth() - currentDate.getMonth())) + 1;
  if (monthsToPay < 1) monthsToPay = 1;
  // Use a mutable monthlyLoanPayment so it can be updated upon refinance.
  let monthlyLoanPayment = pmt(loanApr / 12, monthsToPay, loanDebt);

  // Maintain a mutable current loan APR separate from destructured loanApr. This
  // allows us to update the APR when refinancing while preserving the
  // destructured constant.
  let currentLoanApr = loanApr;

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

    // --- Car purchase event ---
    // If the car has not been purchased and the purchase date matches this month,
    // execute the car purchase. Down payment comes from the car fund up to the
    // specified down payment or available balance. Any financed portion
    // initiates a new car loan. Any portion not financed is withdrawn from
    // cash savings if available.
    if (!carPurchased && purchaseDateObj && formatMonth(currentDate) === formatMonth(purchaseDateObj)) {
      const price = carPurchasePrice;
      // Determine down payment: if a down payment is specified, use it; otherwise
      // use as much of the car fund as possible up to the price.
      let down = carDownPayment > 0 ? Math.min(carDownPayment, price) : Math.min(carFundBalance, price);
      // Pay down payment from car fund
      carFundBalance -= down;
      let financedAmount = Math.max(0, price - down);
      if (carFinanced && financedAmount > 0) {
        // Create a new car loan for the financed amount
        carLoanBalance = financedAmount;
        // Constant car loan payment using standard PMT formula. If no term specified
        // or zero APR, set payment equal to principal / term.
        if (carLoanTermMonths && carLoanTermMonths > 0) {
          monthlyCarLoanPayment = pmt(carLoanApr / 12, carLoanTermMonths, financedAmount);
        } else {
          monthlyCarLoanPayment = financedAmount; // immediate payment next month
        }
      } else if (financedAmount > 0) {
        // Not financed: pay remaining price from cash savings if possible
        const payFromSavings = Math.min(financedAmount, cashSavingsBalance);
        cashSavingsBalance -= payFromSavings;
        // If still remaining unpaid, treat as negative deposit later (reduces cash remaining)
        const leftoverUnpaid = financedAmount - payFromSavings;
        if (leftoverUnpaid > 0) {
          // Record the unpaid amount as negative cash by reducing additional savings
          // We will account for this in leftover computations by subtracting from cashRemaining
          // We store it in a temporary variable to deduct later
          // Attach to monthly extra cost (via carOngoingApplicable) so that leftover captures it
          // For simplicity, we convert the unpaid portion to an immediate reduction in cashRemaining by adding to car purchase cost this month.
          carOngoingApplicable += leftoverUnpaid;
        }
      }
      // After purchase, set the monthly ongoing car costs
      carOngoingApplicable += carOngoingMonthly;
      carPurchased = true;
    }

    // --- Refinance event ---
    // If a refinance is scheduled for this month, replace the student loan with
    // a new loan at the specified rate and term. The origination fee is
    // applied as a percentage of the existing principal and added to the new
    // principal. The monthly payment is recalculated accordingly.
    if (refiDateObj && formatMonth(currentDate) === formatMonth(refiDateObj) && loanBalance > 0) {
      const feeRate = refiFeeRate || 0;
      const principalWithFee = loanBalance * (1 + feeRate);
      if (refiTermMonths && refiTermMonths > 0) {
        monthlyLoanPayment = pmt(refiApr / 12, refiTermMonths, principalWithFee);
      } else {
        monthlyLoanPayment = principalWithFee;
      }
      loanBalance = principalWithFee;
      currentLoanApr = refiApr;
      // Reset payoff date to the new term relative to current date for internal schedule
      // (this does not change the original payoff target used for goal warnings)
    }

    // Determine current living expenses including any ongoing car costs
    const livingCurrent = living + carOngoingApplicable;

    // Step 1: cash available for debt payments after essential expenses (living,
    // remittance). Car loan payments are treated as mandatory debt and will be
    // subtracted later.
    const availableForDebt = netMonthly - livingCurrent - remittance;

    // Step 2: compute interest for each debt
    const ccInterest = ccBalance * (ccApr / 12);
    // Use currentLoanApr for the student loan interest, which may change upon refinance
    const loanInterest = loanBalance * (currentLoanApr / 12);
    const carLoanInterest = carLoanBalance * (carLoanApr / 12);

    // Helper functions to compute payments subject to available cash. We may
    // override the extra loan payment when enforcing a minimum cash buffer.
    function computeCcPayment(avail) {
      if (ccBalance <= 0) return 0;
      return Math.min(ccPaymentMax, ccBalance + ccInterest, Math.max(0, avail));
    }
    function computeLoanPayment(avail, extra) {
      if (loanBalance <= 0) return 0;
      let payment = monthlyLoanPayment + extra;
      payment = Math.min(payment, loanBalance + loanInterest, Math.max(0, avail));
      return payment;
    }

    // Determine which debt to pay first based on strategy. Extra loan payment is
    // adjusted below based on emergency buffer status.
    const strategy = debtStrategy;
    let ccPayment = 0;
    let loanPayment = 0;
    // Compute whether we need to redirect contributions for emergency buffer BEFORE
    // computing debt payments so that extra loan payment can be zeroed if needed.
    const needsEmergencyBuffer = minCashBuffer > 0 && cashSavingsBalance < minCashBuffer;
    let extraLoanPayment = needsEmergencyBuffer ? 0 : loanExtra;
    if (strategy === 'avalanche') {
      if (ccApr >= currentLoanApr) {
        ccPayment = computeCcPayment(availableForDebt);
        loanPayment = computeLoanPayment(availableForDebt - ccPayment, extraLoanPayment);
      } else {
        loanPayment = computeLoanPayment(availableForDebt, extraLoanPayment);
        ccPayment = computeCcPayment(availableForDebt - loanPayment);
      }
    } else if (strategy === 'snowball') {
      if (ccBalance <= loanBalance) {
        ccPayment = computeCcPayment(availableForDebt);
        loanPayment = computeLoanPayment(availableForDebt - ccPayment, extraLoanPayment);
      } else {
        loanPayment = computeLoanPayment(availableForDebt, extraLoanPayment);
        ccPayment = computeCcPayment(availableForDebt - loanPayment);
      }
    } else {
      ccPayment = computeCcPayment(availableForDebt);
      loanPayment = computeLoanPayment(availableForDebt - ccPayment, extraLoanPayment);
    }

    // Car loan payment is mandatory if there is a balance
    const carLoanPayment = carLoanBalance > 0 ? Math.min(monthlyCarLoanPayment, carLoanBalance + carLoanInterest) : 0;

    // Calculate ending balances for each debt. Capture beginning car loan balance
    const carLoanBeginning = carLoanBalance;
    const ccEnding = ccBalance + ccInterest - ccPayment;
    const loanEnding = loanBalance + loanInterest - loanPayment;
    const carLoanEnding = carLoanBalance + carLoanInterest - carLoanPayment;

    // Step 3: leftover cash after paying debts (cc, student loan, car loan)
    let leftoverAfterDebt = availableForDebt - ccPayment - loanPayment - carLoanPayment;

    // Determine car fund contribution for this month. We may stop contributions
    // once the car fund goal is reached. If stopCarContributionAtGoal is true
    // and carFundGoal is positive, cap contribution at the remaining gap or
    // zero once the goal is met.
    let carContributionPlanned = carFundMonthly;
    if (stopCarContributionAtGoal && carFundGoal > 0) {
      const gap = Math.max(0, carFundGoal - carFundBalance);
      carContributionPlanned = Math.min(carContributionPlanned, gap);
    }

    // Initialize actual contribution variables (may be redirected to cash savings)
    let carContributionActual = carContributionPlanned;
    let additionalSavingsActual = additionalSavings;
    // variable for tracking any extra loan payment adjustments (unused for now)

    // Determine if we need to redirect contributions to meet the minimum cash buffer
    // We already computed needsEmergencyBuffer when determining debt payments. Use that value here.

    let depositCash = 0;
    if (needsEmergencyBuffer) {
      // Compute deposit as all leftover after debt plus planned car and additional contributions
      depositCash = Math.max(0, leftoverAfterDebt + carContributionActual + additionalSavingsActual);
      carContributionActual = 0;
      additionalSavingsActual = 0;
    } else {
      const tentativeDeposit = leftoverAfterDebt - carContributionActual + additionalSavingsActual;
      if (tentativeDeposit > 0) {
        depositCash = tentativeDeposit;
      } else {
        depositCash = 0;
      }
    }

    // Update savings balances
    carFundBalance += carContributionActual;
    cashSavingsBalance += depositCash;
    retirementSavingsBalance += employer401kMonthly + employee401kMonthly;
    hsaSavingsBalance += hsaMonthly;
    // Update car loan balance
    carLoanBalance = carLoanEnding;

    // After deposit is determined, recompute leftover after contributions to derive
    // cash remaining. This shows any shortfall (negative) or extra (should be zero).
    let cashRemaining;
    if (needsEmergencyBuffer) {
      // After redirect, leftover after debt and after deposit should be zero
      cashRemaining = 0;
    } else {
      // leftover minus car contribution plus additional minus deposit
      cashRemaining = leftoverAfterDebt - carContributionActual + additionalSavingsActual - depositCash;
    }

    // Aggregate savings contribution for reporting (cash + retirement + HSA)
    const savingsContribution = depositCash + employer401kMonthly + employee401kMonthly + hsaMonthly;

    // Compute net worth: cash, car fund, retirement, HSA minus all debts (credit, student, car)
    const netWorth = cashSavingsBalance + carFundBalance + retirementSavingsBalance + hsaSavingsBalance - ccEnding - loanEnding - carLoanBalance;

    // Save current row data
    rows.push({
      month: monthLabel,
      netMonthly,
      living: livingCurrent,
      remittance,
      available: availableForDebt,
      ccBeginning: ccBalance,
      ccInterest,
      ccPayment,
      ccEnding,
      loanBeginning: loanBalance,
      loanInterest,
      loanPayment,
      loanEnding,
      carLoanBeginning,
      carLoanInterest,
      carLoanPayment,
      carLoanEnding,
      // Cash savings metrics
      cashSavingsBeginning: cashSavingsBalance - depositCash,
      cashSavingsContribution: depositCash,
      cashSavingsEnding: cashSavingsBalance,
      // Retirement and HSA metrics
      retirementSavingsContribution: employer401kMonthly + employee401kMonthly,
      retirementSavingsEnding: retirementSavingsBalance,
      hsaSavingsContribution: hsaMonthly,
      hsaSavingsEnding: hsaSavingsBalance,
      // Aggregate savings contribution
      savingsContribution,
      // Car fund metrics
      carFundBeginning: carFundBalance - carContributionActual,
      carFundContribution: carContributionActual,
      carFundEnding: carFundBalance,
      carOngoingCost: carOngoingApplicable,
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