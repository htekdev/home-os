/**
 * Home OS — Budget Tracker Extension
 * 
 * Tracks income, expenses, budgets, and recurring bills.
 * Provides spending summaries and budget-vs-actual comparisons.
 * 
 * Tools exposed:
 * - add_expense: Log a family expense
 * - add_income: Log family income
 * - budget_summary: Month-to-date overview
 * - set_budget: Set monthly budget target
 * - budget_vs_actual: Compare spending to targets
 * - add_recurring_bill: Register a recurring bill
 * - upcoming_bills: Bills due soon
 * - get_transactions: Query transaction history
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = process.env.HOMEOS_DATA_DIR || join(process.cwd(), 'data');
const BUDGET_DIR = join(DATA_DIR, 'budget');

function ensureDir() {
  if (!existsSync(BUDGET_DIR)) mkdirSync(BUDGET_DIR, { recursive: true });
}

function loadJson(filename, defaultValue = []) {
  const path = join(BUDGET_DIR, filename);
  if (!existsSync(path)) return defaultValue;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function saveJson(filename, data) {
  ensureDir();
  writeFileSync(join(BUDGET_DIR, filename), JSON.stringify(data, null, 2));
}

function getMonthKey(date) {
  return date ? date.slice(0, 7) : new Date().toISOString().slice(0, 7);
}

export function addExpense({ amount, category, description, who, date }) {
  const transactions = loadJson('transactions.json');
  const entry = {
    id: `exp-${Date.now().toString(36)}`,
    type: 'expense',
    amount: Math.abs(amount),
    category: category || 'other',
    description: description || '',
    who: who || 'shared',
    date: date || new Date().toISOString().split('T')[0],
    created_at: new Date().toISOString()
  };
  transactions.push(entry);
  saveJson('transactions.json', transactions);
  return { success: true, ...entry, message: `Logged $${amount} expense (${category})` };
}

export function addIncome({ amount, category, description, who, date }) {
  const transactions = loadJson('transactions.json');
  const entry = {
    id: `inc-${Date.now().toString(36)}`,
    type: 'income',
    amount: Math.abs(amount),
    category: category || 'salary',
    description: description || '',
    who: who || 'shared',
    date: date || new Date().toISOString().split('T')[0],
    created_at: new Date().toISOString()
  };
  transactions.push(entry);
  saveJson('transactions.json', transactions);
  return { success: true, ...entry, message: `Logged $${amount} income (${category})` };
}

export function budgetSummary({ month } = {}) {
  const monthKey = month || getMonthKey();
  const transactions = loadJson('transactions.json');
  const monthTransactions = transactions.filter(t => t.date && t.date.startsWith(monthKey));

  const income = monthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expenses = monthTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

  const byCategory = {};
  monthTransactions.filter(t => t.type === 'expense').forEach(t => {
    byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
  });

  return {
    month: monthKey,
    income,
    expenses,
    net: income - expenses,
    byCategory,
    transactionCount: monthTransactions.length
  };
}

export function setBudget({ category, amount, month }) {
  const monthKey = month || getMonthKey();
  const budgets = loadJson('budgets.json', {});
  if (!budgets[monthKey]) budgets[monthKey] = {};
  budgets[monthKey][category] = amount;
  saveJson('budgets.json', budgets);
  return { success: true, message: `Budget set: ${category} = $${amount}/mo for ${monthKey}` };
}

export function budgetVsActual({ month } = {}) {
  const monthKey = month || getMonthKey();
  const budgets = loadJson('budgets.json', {});
  const monthBudgets = budgets[monthKey] || {};
  const summary = budgetSummary({ month: monthKey });

  const comparison = Object.entries(monthBudgets).map(([category, budget]) => {
    const actual = summary.byCategory[category] || 0;
    const pct = budget > 0 ? Math.round((actual / budget) * 100) : 0;
    const status = pct > 100 ? '🔴' : pct > 80 ? '🟡' : '🟢';
    return { category, budget, actual, pct, status };
  });

  return { month: monthKey, comparison, totalBudget: Object.values(monthBudgets).reduce((a, b) => a + b, 0), totalActual: summary.expenses };
}

export function addRecurringBill({ name, amount, category, due_day, frequency, auto_pay }) {
  const bills = loadJson('recurring-bills.json');
  bills.push({
    id: `bill-${Date.now().toString(36)}`,
    name,
    amount,
    category: category || 'other',
    due_day,
    frequency: frequency || 'monthly',
    auto_pay: auto_pay || false,
    created_at: new Date().toISOString()
  });
  saveJson('recurring-bills.json', bills);
  return { success: true, message: `Recurring bill "${name}" ($${amount}, due day ${due_day}) registered` };
}

export function upcomingBills({ days } = {}) {
  const lookAhead = days || 14;
  const bills = loadJson('recurring-bills.json');
  const today = new Date();
  const todayDay = today.getDate();

  return bills.filter(bill => {
    const dueDay = bill.due_day;
    const daysUntil = dueDay >= todayDay ? dueDay - todayDay : (30 - todayDay + dueDay);
    return daysUntil <= lookAhead;
  }).map(bill => {
    const dueDay = bill.due_day;
    const daysUntil = dueDay >= todayDay ? dueDay - todayDay : (30 - todayDay + dueDay);
    return { ...bill, daysUntil };
  }).sort((a, b) => a.daysUntil - b.daysUntil);
}
