import { useState, useEffect, useRef } from 'react';
import { calculateProjection } from '../lib/calc.js';

/**
 * Main page component for the comprehensive personal finance planner.
 *
 * This version (v1.4) includes scenario saving and comparison, goal tracking,
 * multiple charts, CSV export, biweekly pay toggle, optional debt payoff
 * strategies, dark mode, collapsible sections and a simple change tracker.
 */
export default function Home() {
  // Initial input values based on the spreadsheet example. The user can edit
  // any of these fields. Additional flags control payoff strategy and
  // paycheck frequency.
  const [inputs, setInputs] = useState({
    salary: 130000,
    paychecksPerMonth: 2,
    biweekly: false,
    '401kRate': 0.06,
    employerMatchRate: 0.06,
    hsaPerPaycheck: 150,
    living: 1000,
    remittance: 500,
    ccDebt: 5000,
    ccApr: 0.20,
    ccPaymentMax: 500,
    loanDebt: 100000,
    loanApr: 0.14,
    loanPayoffDate: '2027-12',
    loanExtra: 0,
    startDate: new Date('2026-02-01'),
    additionalSavings: 0,
    carFundMonthly: 0,
    debtStrategy: 'creditFirst',
    // v1.5: car purchase and refinance defaults
    carPurchaseDate: '',
    carPurchasePrice: 0,
    carFinanced: false,
    carDownPayment: 0,
    carLoanApr: 0.06,
    carLoanTermMonths: 60,
    carOngoingMonthly: 0,
    refiDate: '',
    refiApr: 0,
    refiTermMonths: 0,
    refiFeeRate: 0,
    minCashBuffer: 0,
    stopCarContributionAtGoal: false
  });
  // Projection results for the current run.
  const [projections, setProjections] = useState(null);
  // Previous projection used for change tracking.
  const [previousProjection, setPreviousProjection] = useState(null);
  // Goals: savings min/max and car fund target.
  const [savingsGoalMin, setSavingsGoalMin] = useState(15000);
  const [savingsGoalMax, setSavingsGoalMax] = useState(20000);
  const [carFundGoal, setCarFundGoal] = useState(15000);
  // Scenario management. scenarios is an array of { name, inputs }.
  const [scenarios, setScenarios] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('financeScenarios');
        return stored ? JSON.parse(stored) : [];
      } catch (err) {
        console.warn('Could not load scenarios from localStorage', err);
      }
    }
    return [];
  });
  const [scenarioName, setScenarioName] = useState('');
  const [selectedScenarioA, setSelectedScenarioA] = useState('');
  const [selectedScenarioB, setSelectedScenarioB] = useState('');
  // Dark mode toggle.
  const [darkMode, setDarkMode] = useState(false);
  // Collapsible section state.
  const [sectionsOpen, setSectionsOpen] = useState({
    income: true,
    expenses: true,
    debt: true,
    contributions: true,
    goals: true,
    options: true,
    scenarios: true,
    carRefi: false
  });
  // Change tracker summary
  const [changeSummary, setChangeSummary] = useState(null);

  // Persist scenarios to localStorage whenever they change.
  useEffect(() => {
    try {
      localStorage.setItem('financeScenarios', JSON.stringify(scenarios));
    } catch (err) {
      console.warn('Could not save scenarios to localStorage', err);
    }
  }, [scenarios]);

  /**
   * Generic handler for input changes. Supports number, date, checkbox and select
   * input types. Special cases: date strings and booleans.
   */
  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setInputs((prev) => {
      let parsedValue;
      if (type === 'number') {
        parsedValue = parseFloat(value);
      } else if (type === 'date' || type === 'month') {
        parsedValue = new Date(value);
      } else if (type === 'checkbox') {
        parsedValue = checked;
      } else {
        // Strings for selects or plain text
        parsedValue = value;
      }
      return { ...prev, [name]: parsedValue };
    });
  }

  /**
   * Run the projection with the current inputs, store previous run for
   * change tracking and update state. Also evaluate goal outcomes and
   * prepare change summary.
   */
  function handleCalculate() {
    try {
      // Save previous projection for diffing
      setPreviousProjection(projections);
      const rows = calculateProjection({ ...inputs, carFundGoal });
      setProjections(rows);
      // After calculating, compute change summary and goal evaluation
      if (rows && rows.length > 0) {
        const summary = computeChangeSummary(previousProjection, rows);
        setChangeSummary(summary);
      }
    } catch (err) {
      console.error('Error calculating projection:', err);
      alert('An error occurred while calculating the projection. Please check your inputs.');
    }
  }

  /**
   * Format a number as US currency.
   * @param {number} val
   */
  function formatCurrency(val) {
    return val.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  }

  /**
   * Save the current inputs as a named scenario. If a scenario with the
   * same name exists, overwrite it. Clears the scenario name input after
   * saving.
   */
  function handleSaveScenario() {
    const name = scenarioName.trim();
    if (!name) {
      alert('Please enter a scenario name before saving.');
      return;
    }
    const existingIndex = scenarios.findIndex((s) => s.name === name);
    const newScenario = { name, inputs: { ...inputs } };
    let newList;
    if (existingIndex >= 0) {
      newList = [...scenarios];
      newList[existingIndex] = newScenario;
    } else {
      newList = [...scenarios, newScenario];
    }
    setScenarios(newList);
    setScenarioName('');
  }

  /**
   * Load a scenario's inputs into the form. Does not run calculation
   * immediately. Keeps current projections until you click Calculate.
   */
  function handleLoadScenario(name) {
    const scenario = scenarios.find((s) => s.name === name);
    if (scenario) {
      setInputs({ ...scenario.inputs });
    }
  }

  /**
   * Delete a scenario by name.
   */
  function handleDeleteScenario(name) {
    const newList = scenarios.filter((s) => s.name !== name);
    setScenarios(newList);
    // Clear selected scenario names if they were deleted
    if (selectedScenarioA === name) setSelectedScenarioA('');
    if (selectedScenarioB === name) setSelectedScenarioB('');
  }

  /**
   * Compare two selected scenarios and display differences. Calculates
   * projections for each scenario (without altering current inputs).
   */
  function handleCompareScenarios() {
    if (!selectedScenarioA || !selectedScenarioB) {
      alert('Please select two scenarios to compare.');
      return;
    }
    const sA = scenarios.find((s) => s.name === selectedScenarioA);
    const sB = scenarios.find((s) => s.name === selectedScenarioB);
    if (!sA || !sB) {
      alert('Selected scenarios not found.');
      return;
    }
    const projA = calculateProjection(sA.inputs);
    const projB = calculateProjection(sB.inputs);
    const summaryA = computeSummaryMetrics(projA);
    const summaryB = computeSummaryMetrics(projB);
    const comparison = {
      payoffDateDifference: diffDates(summaryA.payoffDate, summaryB.payoffDate),
      finalCashDifference: summaryA.cashSavingsEnding - summaryB.cashSavingsEnding,
      finalNetWorthDifference: summaryA.netWorth - summaryB.netWorth,
      worstCashMonthDifference: summaryA.worstCashMonthValue - summaryB.worstCashMonthValue
    };
    alert(
      `Comparison between ${selectedScenarioA} and ${selectedScenarioB}:\n` +
        `Payoff date difference (A - B): ${comparison.payoffDateDifference}\n` +
        `Final cash savings difference: ${formatCurrency(comparison.finalCashDifference)}\n` +
        `Final net worth difference: ${formatCurrency(comparison.finalNetWorthDifference)}\n` +
        `Worst cash month difference: ${formatCurrency(comparison.worstCashMonthDifference)}`
    );
  }

  /**
   * Export the current projections to a CSV file. Generates a header row
   * and all columns present in the projection objects.
   */
  function handleExportCSV() {
    if (!projections || projections.length === 0) {
      alert('No projections available to export. Run a calculation first.');
      return;
    }
    const header = Object.keys(projections[0]);
    const rows = projections.map((row) => header.map((h) => row[h] instanceof Date ? row[h].toISOString().split('T')[0] : row[h]).join(','));
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'projections.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Compute a summary of changes between the previous and current projections.
   * Includes differences in payoff date, final cash savings, final net worth
   * and worst cash month. If previous is null, returns a baseline summary.
   * @param {Array<Object>|null} prev
   * @param {Array<Object>} curr
   * @returns {Object} summary
   */
  function computeChangeSummary(prev, curr) {
    const currSummary = computeSummaryMetrics(curr);
    if (!prev || prev.length === 0) {
      return {
        payoffDateChange: 'N/A',
        cashChange: 0,
        netWorthChange: 0,
        worstCashMonthChange: 0,
        goalWarnings: evaluateGoals(currSummary)
      };
    }
    const prevSummary = computeSummaryMetrics(prev);
    return {
      payoffDateChange: diffDates(currSummary.payoffDate, prevSummary.payoffDate),
      cashChange: currSummary.cashSavingsEnding - prevSummary.cashSavingsEnding,
      netWorthChange: currSummary.netWorth - prevSummary.netWorth,
      worstCashMonthChange: currSummary.worstCashMonthValue - prevSummary.worstCashMonthValue,
      goalWarnings: evaluateGoals(currSummary)
    };
  }

  /**
   * Compute key metrics from a projection array: payoff date (month when loan
   * balance first reaches zero or below), final cash savings, final car fund,
   * final net worth, and worst cash month (lowest cashRemaining).
   * @param {Array<Object>} proj
   * @returns {Object}
   */
  function computeSummaryMetrics(proj) {
    if (!proj || proj.length === 0) return {};
    let payoffDate = proj[proj.length - 1].month;
    for (const row of proj) {
      if (row.loanEnding <= 0) {
        payoffDate = row.month;
        break;
      }
    }
    const lastRow = proj[proj.length - 1];
    // Identify worst cash month
    let worstCashMonthValue = Infinity;
    let worstCashMonth = '';
    for (const row of proj) {
      if (row.cashRemaining < worstCashMonthValue) {
        worstCashMonthValue = row.cashRemaining;
        worstCashMonth = row.month;
      }
    }
    return {
      payoffDate,
      cashSavingsEnding: lastRow.cashSavingsEnding,
      carFundEnding: lastRow.carFundEnding,
      netWorth: lastRow.netWorth,
      worstCashMonth,
      worstCashMonthValue
    };
  }

  /**
   * Evaluate goals against a summary. Returns an array of warning strings if
   * goals are not met or an empty array if all are satisfied.
   */
  function evaluateGoals(summary) {
    const warnings = [];
    // Loan payoff goal: summary.payoffDate should not exceed inputs.loanPayoffDate
    if (new Date(summary.payoffDate + '-01') > new Date(inputs.loanPayoffDate + '-01')) {
      warnings.push(`Student loan payoff exceeds target date (${inputs.loanPayoffDate}). Actual payoff: ${summary.payoffDate}`);
    }
    // Savings range
    if (summary.cashSavingsEnding < savingsGoalMin) {
      warnings.push(`Final cash savings (${formatCurrency(summary.cashSavingsEnding)}) is below your minimum goal of ${formatCurrency(savingsGoalMin)}.`);
    }
    if (summary.cashSavingsEnding > savingsGoalMax) {
      warnings.push(`Final cash savings (${formatCurrency(summary.cashSavingsEnding)}) exceeds your maximum goal of ${formatCurrency(savingsGoalMax)}.`);
    }
    // Car fund goal
    if (summary.carFundEnding < carFundGoal) {
      warnings.push(`Final car fund (${formatCurrency(summary.carFundEnding)}) is below your car fund goal of ${formatCurrency(carFundGoal)}.`);
    }
    // Negative cash months
    if (summary.worstCashMonthValue < 0) {
      warnings.push(`Cash remaining becomes negative in ${summary.worstCashMonth} (${formatCurrency(summary.worstCashMonthValue)}). Consider increasing cash cushion.`);
    }
    return warnings;
  }

  /**
   * Compute difference between two date strings YYYY-MM. Returns number of
   * months difference or 'N/A' if inputs are invalid.
   */
  function diffDates(a, b) {
    if (!a || !b) return 'N/A';
    const [ay, am] = a.split('-').map((s) => parseInt(s, 10));
    const [by, bm] = b.split('-').map((s) => parseInt(s, 10));
    if (isNaN(ay) || isNaN(am) || isNaN(by) || isNaN(bm)) return 'N/A';
    return (ay - by) * 12 + (am - bm);
  }

  /**
   * Toggle dark mode state. Applies a CSS class to the root container.
   */
  function handleToggleDark() {
    setDarkMode((prev) => !prev);
  }

  /**
   * Toggle visibility of a section. The key corresponds to a property in
   * sectionsOpen (income, expenses, debt, contributions, goals, options, scenarios).
   */
  function toggleSection(key) {
    setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div style={{ backgroundColor: darkMode ? '#1e1e1e' : '#f9f9f9', color: darkMode ? '#f5f5f5' : '#333', minHeight: '100vh', padding: '2rem' }}>
      <h1>Personal Finance Planner</h1>
      <p>
        This comprehensive tool projects your cash flow, debt payoff, savings and goals. Taxes are
        calculated using 2025 federal and Virginia brackets for a single filer. New in this version: you
        can simulate a car purchase (with financing, down payment and ongoing costs), test a student loan
        refinance, enforce a minimum cash buffer and optionally stop car fund contributions when you hit
        your goal. You can also save scenarios, compare them, export to CSV and toggle dark mode.
      </p>

      {/* Options Section: Dark mode toggle, CSV export, Calculate button */}
      <div style={{ marginBottom: '1rem' }}>
        <button onClick={handleToggleDark}>{darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</button>
        <button onClick={handleCalculate} style={{ marginLeft: '1rem' }}>Calculate</button>
        <button onClick={handleExportCSV} style={{ marginLeft: '1rem' }}>Export CSV</button>
      </div>

      {/* Collapsible sections for inputs */}
      <Section title="Income & Paychecks" isOpen={sectionsOpen.income} onToggle={() => toggleSection('income')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <label>Annual Salary (USD)
            <input type="number" name="salary" value={inputs.salary} min="0" step="1000" onChange={handleChange} />
          </label>
          <label>401(k) Contribution Rate (%)
            <input type="number" name="401kRate" value={inputs['401kRate'] * 100} min="0" max="30" step="0.5" onChange={(e) => handleChange({ target: { name: '401kRate', value: e.target.value / 100, type: 'number' } })} />
          </label>
          <label>Employer Match Rate (%)
            <input type="number" name="employerMatchRate" value={inputs.employerMatchRate * 100} min="0" max="30" step="0.5" onChange={(e) => handleChange({ target: { name: 'employerMatchRate', value: e.target.value / 100, type: 'number' } })} />
          </label>
          <label>HSA Contribution per Paycheck (USD)
            <input type="number" name="hsaPerPaycheck" value={inputs.hsaPerPaycheck} min="0" step="10" onChange={handleChange} />
          </label>
          <label>Paychecks per Month
            <input type="number" name="paychecksPerMonth" value={inputs.paychecksPerMonth} min="1" max="4" step="0.1" disabled={inputs.biweekly} onChange={handleChange} />
          </label>
          <label>
            <input type="checkbox" name="biweekly" checked={inputs.biweekly} onChange={handleChange} /> Biweekly Pay (26 paychecks/year)
          </label>
        </div>
      </Section>

      <Section title="Expenses" isOpen={sectionsOpen.expenses} onToggle={() => toggleSection('expenses')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <label>Monthly Living Expenses (USD)
            <input type="number" name="living" value={inputs.living} min="0" step="50" onChange={handleChange} />
          </label>
          <label>Monthly Remittance (USD)
            <input type="number" name="remittance" value={inputs.remittance} min="0" step="50" onChange={handleChange} />
          </label>
        </div>
      </Section>

      <Section title="Debt" isOpen={sectionsOpen.debt} onToggle={() => toggleSection('debt')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <label>Credit Card Balance (USD)
            <input type="number" name="ccDebt" value={inputs.ccDebt} min="0" step="100" onChange={handleChange} />
          </label>
          <label>Credit Card APR (%)
            <input type="number" name="ccApr" value={inputs.ccApr * 100} min="0" max="50" step="0.5" onChange={(e) => handleChange({ target: { name: 'ccApr', value: e.target.value / 100, type: 'number' } })} />
          </label>
          <label>Max Credit Card Payment (USD)
            <input type="number" name="ccPaymentMax" value={inputs.ccPaymentMax} min="0" step="50" onChange={handleChange} />
          </label>
          <label>Student Loan Balance (USD)
            <input type="number" name="loanDebt" value={inputs.loanDebt} min="0" step="100" onChange={handleChange} />
          </label>
          <label>Student Loan APR (%)
            <input type="number" name="loanApr" value={inputs.loanApr * 100} min="0" max="50" step="0.5" onChange={(e) => handleChange({ target: { name: 'loanApr', value: e.target.value / 100, type: 'number' } })} />
          </label>
          <label>Loan Payoff Date (YYYY-MM)
            <input type="month" name="loanPayoffDate" value={inputs.loanPayoffDate} onChange={handleChange} />
          </label>
          <label>Extra Loan Payment (USD)
            <input type="number" name="loanExtra" value={inputs.loanExtra} min="0" step="50" onChange={handleChange} />
          </label>
          <label>Debt Payoff Strategy
            <select name="debtStrategy" value={inputs.debtStrategy} onChange={handleChange}>
              <option value="creditFirst">Credit Card First</option>
              <option value="avalanche">Avalanche (Highest APR first)</option>
              <option value="snowball">Snowball (Lowest Balance first)</option>
            </select>
          </label>
        </div>
      </Section>

      <Section title="Contributions & Other" isOpen={sectionsOpen.contributions} onToggle={() => toggleSection('contributions')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <label>Additional Monthly Savings (USD)
            <input type="number" name="additionalSavings" value={inputs.additionalSavings} min="0" step="50" onChange={handleChange} />
          </label>
          <label>Car Fund Contribution (USD)
            <input type="number" name="carFundMonthly" value={inputs.carFundMonthly} min="0" step="50" onChange={handleChange} />
          </label>
          <label>Model Start Date (YYYY-MM-DD)
            <input type="date" name="startDate" value={inputs.startDate.toISOString().split('T')[0]} onChange={handleChange} />
          </label>
        </div>
      </Section>

      <Section title="Goals" isOpen={sectionsOpen.goals} onToggle={() => toggleSection('goals')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <label>Cash Savings Goal Min (USD)
            <input type="number" value={savingsGoalMin} min="0" step="500" onChange={(e) => setSavingsGoalMin(parseFloat(e.target.value) || 0)} />
          </label>
          <label>Cash Savings Goal Max (USD)
            <input type="number" value={savingsGoalMax} min="0" step="500" onChange={(e) => setSavingsGoalMax(parseFloat(e.target.value) || 0)} />
          </label>
          <label>Car Fund Goal (USD)
            <input type="number" value={carFundGoal} min="0" step="500" onChange={(e) => setCarFundGoal(parseFloat(e.target.value) || 0)} />
          </label>
        </div>
      </Section>

      {/* Car purchase & refinance section */}
      <Section title="Car Purchase & Refinance" isOpen={sectionsOpen.carRefi} onToggle={() => toggleSection('carRefi')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {/* Car purchase inputs */}
          <label>Car Purchase Date (YYYY-MM)
            <input
              type="month"
              name="carPurchaseDate"
              value={inputs.carPurchaseDate ? (inputs.carPurchaseDate.toISOString().slice(0, 7)) : ''}
              onChange={handleChange}
            />
          </label>
          <label>Car Purchase Price (USD)
            <input type="number" name="carPurchasePrice" value={inputs.carPurchasePrice} min="0" step="100" onChange={handleChange} />
          </label>
          <label>
            <input type="checkbox" name="carFinanced" checked={inputs.carFinanced} onChange={handleChange} /> Finance Car Purchase
          </label>
          <label>Car Down Payment (USD)
            <input type="number" name="carDownPayment" value={inputs.carDownPayment} min="0" step="100" onChange={handleChange} />
          </label>
          <label>Car Loan APR (%)
            <input type="number" name="carLoanApr" value={inputs.carLoanApr * 100} min="0" max="50" step="0.5" onChange={(e) => handleChange({ target: { name: 'carLoanApr', value: e.target.value / 100, type: 'number' } })} />
          </label>
          <label>Car Loan Term (months)
            <input type="number" name="carLoanTermMonths" value={inputs.carLoanTermMonths} min="0" step="1" onChange={handleChange} />
          </label>
          <label>Car Ongoing Monthly Cost (USD)
            <input type="number" name="carOngoingMonthly" value={inputs.carOngoingMonthly} min="0" step="50" onChange={handleChange} />
          </label>
          {/* Refinance inputs */}
          <label>Refinance Date (YYYY-MM)
            <input
              type="month"
              name="refiDate"
              value={inputs.refiDate ? (inputs.refiDate.toISOString().slice(0, 7)) : ''}
              onChange={handleChange}
            />
          </label>
          <label>Refinance APR (%)
            <input type="number" name="refiApr" value={inputs.refiApr * 100} min="0" max="50" step="0.5" onChange={(e) => handleChange({ target: { name: 'refiApr', value: e.target.value / 100, type: 'number' } })} />
          </label>
          <label>Refinance Term (months)
            <input type="number" name="refiTermMonths" value={inputs.refiTermMonths} min="0" step="1" onChange={handleChange} />
          </label>
          <label>Refinance Fee Rate (%)
            <input type="number" name="refiFeeRate" value={inputs.refiFeeRate * 100} min="0" max="10" step="0.1" onChange={(e) => handleChange({ target: { name: 'refiFeeRate', value: e.target.value / 100, type: 'number' } })} />
          </label>
          {/* Rules engine: emergency fund buffer and stop car contributions */}
          <label>Minimum Cash Buffer (USD)
            <input type="number" name="minCashBuffer" value={inputs.minCashBuffer} min="0" step="100" onChange={handleChange} />
          </label>
          <label>
            <input type="checkbox" name="stopCarContributionAtGoal" checked={inputs.stopCarContributionAtGoal} onChange={handleChange} /> Stop Car Fund When Goal Reached
          </label>
        </div>
      </Section>

      <Section title="Scenarios" isOpen={sectionsOpen.scenarios} onToggle={() => toggleSection('scenarios')}>
        <div style={{ marginBottom: '1rem' }}>
          <input type="text" placeholder="New scenario name" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} />
          <button onClick={handleSaveScenario} style={{ marginLeft: '0.5rem' }}>Save Scenario</button>
        </div>
        {scenarios.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            {scenarios.map((s) => (
              <div key={s.name} style={{ border: '1px solid', padding: '0.5rem' }}>
                <strong>{s.name}</strong>
                <div style={{ marginTop: '0.5rem' }}>
                  <button onClick={() => handleLoadScenario(s.name)}>Load</button>
                  <button onClick={() => handleDeleteScenario(s.name)} style={{ marginLeft: '0.25rem' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>No saved scenarios.</p>
        )}
        {scenarios.length >= 2 && (
          <div style={{ marginTop: '1rem' }}>
            <h4>Compare Scenarios</h4>
            <select value={selectedScenarioA} onChange={(e) => setSelectedScenarioA(e.target.value)}>
              <option value="">Select Scenario A</option>
              {scenarios.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
            <select value={selectedScenarioB} onChange={(e) => setSelectedScenarioB(e.target.value)} style={{ marginLeft: '0.5rem' }}>
              <option value="">Select Scenario B</option>
              {scenarios.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
            <button onClick={handleCompareScenarios} style={{ marginLeft: '0.5rem' }}>Compare</button>
          </div>
        )}
      </Section>

      {/* Show results if available */}
      {projections && (
        <div style={{ marginTop: '2rem' }}>
          <h2>Projection Results</h2>
          {/* Summary and goal warnings */}
          {changeSummary && (
            <div style={{ marginBottom: '1rem' }}>
              <h3>Summary</h3>
              <p>Payoff date change: {changeSummary.payoffDateChange}</p>
              <p>Cash savings change: {formatCurrency(changeSummary.cashChange)}</p>
              <p>Net worth change: {formatCurrency(changeSummary.netWorthChange)}</p>
              <p>Worst cash month change: {formatCurrency(changeSummary.worstCashMonthChange)}</p>
              {changeSummary.goalWarnings.length > 0 ? (
                <div style={{ color: 'red' }}>
                  <strong>Goal Warnings:</strong>
                  <ul>
                    {changeSummary.goalWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              ) : (
                <div style={{ color: 'green' }}>All goals met!</div>
              )}
            </div>
          )}

          {/* Data table */}
          <div style={{ overflowX: 'auto', maxHeight: '300px', marginBottom: '1rem', border: '1px solid', padding: '0.5rem' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {Object.keys(projections[0]).map((col) => (
                    <th key={col} style={{ position: 'sticky', top: 0, background: darkMode ? '#333' : '#eee', color: darkMode ? '#f5f5f5' : '#000', padding: '4px' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projections.map((row) => (
                  <tr key={row.month}>
                    {Object.keys(row).map((col) => (
                      <td key={col} style={{ padding: '4px', borderBottom: '1px solid', textAlign: 'right' }}>{
                        typeof row[col] === 'number' ? formatCurrency(row[col]) : row[col]
                      }</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Charts section */}
          <div>
            <h3>Charts</h3>
            {/* Debt payoff timeline: credit card, student loan and car loan balances */}
            <MultiLineChart
              dataSets={[
                projections.map((r) => r.ccEnding),
                projections.map((r) => r.loanEnding),
                projections.map((r) => r.carLoanEnding)
              ]}
              labels={['Credit Card Balance', 'Student Loan Balance', 'Car Loan Balance']}
              colors={['#9b59b6', '#2980b9', '#e74c3c']}
              title="Debt Payoff Timeline"
            />
            {/* Savings categories with goal band for cash savings */}
            <MultiLineChart
              dataSets={[
                projections.map((r) => r.cashSavingsEnding),
                projections.map((r) => r.retirementSavingsEnding),
                projections.map((r) => r.hsaSavingsEnding),
                projections.map((r) => r.carFundEnding)
              ]}
              labels={['Cash Savings', 'Retirement Savings', 'HSA Savings', 'Car Fund']}
              colors={['#27ae60', '#e67e22', '#f1c40f', '#8e44ad']}
              title="Savings by Category"
              bands={[{ min: savingsGoalMin, max: savingsGoalMax, color: 'rgba(46, 204, 113, 0.2)' }]}
            />
            {/* Monthly cash flow categories */}
            <MultiLineChart
              dataSets={[
                projections.map((r) => r.living),
                projections.map((r) => r.remittance),
                projections.map((r) => r.ccPayment),
                projections.map((r) => r.loanPayment),
                projections.map((r) => r.carLoanPayment),
                projections.map((r) => r.carOngoingCost),
                projections.map((r) => r.carFundContribution),
                projections.map((r) => r.cashSavingsContribution)
              ]}
              labels={['Living', 'Remittance', 'CC Payment', 'Loan Payment', 'Car Loan Payment', 'Car Ongoing Cost', 'Car Fund', 'Cash Savings']}
              colors={['#c0392b', '#d35400', '#8e44ad', '#2980b9', '#e74c3c', '#16a085', '#27ae60', '#f1c40f']}
              title="Monthly Cash Flow Breakdown"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Collapsible section wrapper. Renders a header with a toggle control and
 * conditionally renders children.
 */
function Section({ title, isOpen, onToggle, children }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <h2 style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={onToggle}>
        <span style={{ marginRight: '0.5rem' }}>{isOpen ? '▼' : '▶'}</span> {title}
      </h2>
      {isOpen && <div style={{ paddingLeft: '1rem' }}>{children}</div>}
    </div>
  );
}

/**
 * Multi-series line chart. Accepts arrays of numeric data series and draws
 * each as an SVG path. Optional bands can be drawn as horizontal shaded
 * areas (e.g., for goal ranges). Scaling is based on the combined min and
 * max of all series.
 * @param {Object} props
 * @param {Array<Array<number>>} props.dataSets
 * @param {Array<string>} props.labels
 * @param {Array<string>} props.colors
 * @param {string} props.title
 * @param {Array<{ min: number, max: number, color: string }>} [props.bands]
 */
function MultiLineChart({ dataSets, labels, colors, title, bands }) {
  if (!dataSets || dataSets.length === 0) return null;
  const width = 600;
  const height = 200;
  // Compute min and max across all series
  const flat = dataSets.flat();
  let min = Math.min(...flat);
  let max = Math.max(...flat);
  if (min === max) {
    // Avoid zero range
    min -= 1;
    max += 1;
  }
  const range = max - min;
  // Build paths for each data set
  const paths = dataSets.map((series) => {
    return series.map((val, idx) => {
      const x = (idx / (series.length - 1)) * width;
      const y = height - ((val - min) / range) * height;
      return [x, y];
    }).map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  });
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h4>{title}</h4>
      <svg width={width} height={height} style={{ border: '1px solid #ccc', background: '#fff' }}>
        {/* Draw bands if provided */}
        {bands && bands.map((band, i) => {
          const yMax = height - ((band.min - min) / range) * height;
          const yMin = height - ((band.max - min) / range) * height;
          return (
            <rect key={i} x="0" y={Math.min(yMin, yMax)} width={width} height={Math.abs(yMax - yMin)} fill={band.color} />
          );
        })}
        {/* Axis lines */}
        <line x1="0" y1={height} x2={width} y2={height} stroke="#888" strokeWidth="1" />
        <line x1="0" y1="0" x2="0" y2={height} stroke="#888" strokeWidth="1" />
        {/* Paths for each series */}
        {paths.map((d, idx) => (
          <path key={idx} d={d} fill="none" stroke={colors[idx % colors.length]} strokeWidth="2" />
        ))}
        {/* Legend */}
        {labels && labels.map((label, idx) => (
          <g key={idx}>
            <rect x={10} y={10 + idx * 14} width={12} height={12} fill={colors[idx % colors.length]} />
            <text x={26} y={20 + idx * 14} fontSize="10" fill="#333">{label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}