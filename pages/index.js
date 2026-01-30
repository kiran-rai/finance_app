import { useState } from 'react';
import { calculateProjection } from '../lib/calc.js';

/**
 * Main page component for the personal finance app.
 *
 * This page provides a simple form for the user to input their
 * financial assumptions (salary, tax rate, debt balances, etc.) and
 * calculates a month‑by‑month projection when the user clicks the
 * "Calculate" button. Results are displayed in a table below the form.
 */
export default function Home() {
  // Define initial input values matching the spreadsheet example. These
  // values are editable by the user. When you change them and click
  // "Calculate", the projections will update automatically.
  const [inputs, setInputs] = useState({
    salary: 130000,                 // annual gross salary
    federalRate: 0.25,             // combined federal + state tax rate (25%)
    paychecksPerMonth: 2,          // number of paychecks each month
    '401kRate': 0.06,              // 401k employee contribution rate (6%)
    employerMatchRate: 0.06,       // 401k employer match (6%)
    hsaPerPaycheck: 150,           // HSA contribution per paycheck
    living: 1000,                  // monthly living expenses
    remittance: 500,               // monthly remittance to family
    ccDebt: 5000,                  // starting credit card balance
    ccApr: 0.2,                    // credit card APR (20%)
    ccPaymentMax: 500,             // maximum credit card payment per month
    loanDebt: 100000,              // starting student loan balance
    loanApr: 0.14,                 // student loan APR (14%)
    loanPayoffDate: '2027-12',     // payoff target date for the loan (YYYY‑MM)
    loanExtra: 0,                  // extra payment to loan each month
    startDate: new Date('2026-02-01'), // projection start date
    additionalSavings: 0,          // extra deposit into general savings each month
    carFundMonthly: 0              // contribution to car fund each month
  });

  // State to hold the projection results. Initially null until user
  // triggers calculation.
  const [projections, setProjections] = useState(null);

  /**
   * Handler to update the inputs state when a form field changes.
   * Numeric values are parsed as floats. For date strings (start
   * date), we store them as a Date instance. All other values
   * (including loanPayoffDate) remain strings.
   */
  function handleChange(e) {
    const { name, value, type } = e.target;
    setInputs((prev) => {
      let parsedValue;
      if (type === 'number') {
        parsedValue = parseFloat(value);
      } else if (name === 'startDate') {
        parsedValue = new Date(value);
      } else {
        parsedValue = value;
      }
      return { ...prev, [name]: parsedValue };
    });
  }

  /**
   * Handler invoked when the user clicks the "Calculate" button.
   * It executes the projection function with the current inputs and
   * stores the returned rows in state for rendering.
   */
  function handleCalculate() {
    try {
      const rows = calculateProjection(inputs);
      setProjections(rows);
    } catch (err) {
      console.error('Error calculating projection:', err);
      alert('An error occurred while calculating the projection. Please check your inputs.');
    }
  }

  // Format a number as US currency for display in the table.
  function formatCurrency(val) {
    return val.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <h1>Personal Finance Planner</h1>
      <p>Enter your financial assumptions below and click "Calculate" to see a month‑by‑month projection of your credit card, student loan, savings, car fund and cash flow.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleCalculate();
        }}
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}
      >
        {/* Salary and tax inputs */}
        <div>
          <label>Annual Salary (USD):<br />
            <input type="number" name="salary" value={inputs.salary} onChange={handleChange} min="0" step="1000" />
          </label>
        </div>
        <div>
          <label>Federal/State Tax Rate (%):<br />
            <input type="number" name="federalRate" value={inputs.federalRate * 100} onChange={(e) => handleChange({ target: { name: 'federalRate', value: e.target.value / 100, type: 'number' } })} min="0" max="50" step="1" />
          </label>
        </div>

        {/* Paychecks and contribution rates */}
        <div>
          <label>Paychecks per Month:<br />
            <input type="number" name="paychecksPerMonth" value={inputs.paychecksPerMonth} onChange={handleChange} min="1" max="4" />
          </label>
        </div>
        <div>
          <label>401(k) Contribution Rate (%):<br />
            <input type="number" name="401kRate" value={inputs['401kRate'] * 100} onChange={(e) => handleChange({ target: { name: '401kRate', value: e.target.value / 100, type: 'number' } })} min="0" max="30" step="1" />
          </label>
        </div>
        <div>
          <label>Employer Match Rate (%):<br />
            <input type="number" name="employerMatchRate" value={inputs.employerMatchRate * 100} onChange={(e) => handleChange({ target: { name: 'employerMatchRate', value: e.target.value / 100, type: 'number' } })} min="0" max="30" step="1" />
          </label>
        </div>
        <div>
          <label>HSA Contribution per Paycheck (USD):<br />
            <input type="number" name="hsaPerPaycheck" value={inputs.hsaPerPaycheck} onChange={handleChange} min="0" step="10" />
          </label>
        </div>

        {/* Expenses */}
        <div>
          <label>Monthly Living Expenses (USD):<br />
            <input type="number" name="living" value={inputs.living} onChange={handleChange} min="0" step="50" />
          </label>
        </div>
        <div>
          <label>Monthly Remittance (USD):<br />
            <input type="number" name="remittance" value={inputs.remittance} onChange={handleChange} min="0" step="50" />
          </label>
        </div>

        {/* Credit card */}
        <div>
          <label>Credit Card Balance (USD):<br />
            <input type="number" name="ccDebt" value={inputs.ccDebt} onChange={handleChange} min="0" step="100" />
          </label>
        </div>
        <div>
          <label>Credit Card APR (%):<br />
            <input type="number" name="ccApr" value={inputs.ccApr * 100} onChange={(e) => handleChange({ target: { name: 'ccApr', value: e.target.value / 100, type: 'number' } })} min="0" max="50" step="1" />
          </label>
        </div>
        <div>
          <label>Max Credit Card Payment (USD):<br />
            <input type="number" name="ccPaymentMax" value={inputs.ccPaymentMax} onChange={handleChange} min="0" step="50" />
          </label>
        </div>

        {/* Student loan */}
        <div>
          <label>Student Loan Balance (USD):<br />
            <input type="number" name="loanDebt" value={inputs.loanDebt} onChange={handleChange} min="0" step="100" />
          </label>
        </div>
        <div>
          <label>Student Loan APR (%):<br />
            <input type="number" name="loanApr" value={inputs.loanApr * 100} onChange={(e) => handleChange({ target: { name: 'loanApr', value: e.target.value / 100, type: 'number' } })} min="0" max="50" step="1" />
          </label>
        </div>
        <div>
          <label>Loan Payoff Date (YYYY-MM):<br />
            <input type="month" name="loanPayoffDate" value={inputs.loanPayoffDate} onChange={handleChange} />
          </label>
        </div>
        <div>
          <label>Extra Loan Payment (USD):<br />
            <input type="number" name="loanExtra" value={inputs.loanExtra} onChange={handleChange} min="0" step="50" />
          </label>
        </div>

        {/* Start date and other contributions */}
        <div>
          <label>Model Start Date (YYYY-MM-DD):<br />
            <input type="date" name="startDate" value={inputs.startDate.toISOString().split('T')[0]} onChange={handleChange} />
          </label>
        </div>
        <div>
          <label>Additional Monthly Savings (USD):<br />
            <input type="number" name="additionalSavings" value={inputs.additionalSavings} onChange={handleChange} min="0" step="50" />
          </label>
        </div>
        <div>
          <label>Car Fund Contribution (USD):<br />
            <input type="number" name="carFundMonthly" value={inputs.carFundMonthly} onChange={handleChange} min="0" step="50" />
          </label>
        </div>

        <div style={{ gridColumn: '1 / span 2', textAlign: 'center', marginTop: '1rem' }}>
          <button type="submit" style={{ padding: '0.5rem 1rem', fontSize: '1rem' }}>Calculate</button>
        </div>
      </form>

      {/* Render the projection table when available */}
      {projections && (
        <div style={{ overflowX: 'auto' }}>
          <h2>Projection Results</h2>
          <table border="1" cellPadding="5" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th>Month</th>
                <th>Net Income</th>
                <th>Living</th>
                <th>Remittance</th>
                <th>CC Begin</th>
                <th>CC Interest</th>
                <th>CC Payment</th>
                <th>CC End</th>
                <th>Loan Begin</th>
                <th>Loan Interest</th>
                <th>Loan Payment</th>
                <th>Loan End</th>
                <th>Savings End</th>
                <th>Car Fund End</th>
                <th>Cash Remaining</th>
              </tr>
            </thead>
            <tbody>
              {projections.map((row) => (
                <tr key={row.month}>
                  <td>{row.month}</td>
                  <td>{formatCurrency(row.netMonthly)}</td>
                  <td>{formatCurrency(row.living)}</td>
                  <td>{formatCurrency(row.remittance)}</td>
                  <td>{formatCurrency(row.ccBeginning)}</td>
                  <td>{formatCurrency(row.ccInterest)}</td>
                  <td>{formatCurrency(row.ccPayment)}</td>
                  <td>{formatCurrency(row.ccEnding)}</td>
                  <td>{formatCurrency(row.loanBeginning)}</td>
                  <td>{formatCurrency(row.loanInterest)}</td>
                  <td>{formatCurrency(row.loanPayment)}</td>
                  <td>{formatCurrency(row.loanEnding)}</td>
                  <td>{formatCurrency(row.savingsEnding)}</td>
                  <td>{formatCurrency(row.carFundEnding)}</td>
                  <td>{formatCurrency(row.cashRemaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}