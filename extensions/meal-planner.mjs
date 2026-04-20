/**
 * Home OS — Meal Planner Extension
 * 
 * Manages weekly meal plans, recipe storage, and grocery list generation.
 * 
 * Tools exposed:
 * - set_meal: Set a specific meal for a day
 * - get_meal_plan: Get the weekly plan
 * - add_recipe: Save a new recipe
 * - search_recipes: Find saved recipes
 * - get_recipe: Get full recipe details
 * - generate_grocery_list: Auto-generate from meal plan
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = process.env.HOMEOS_DATA_DIR || join(process.cwd(), 'data');
const MEALS_DIR = join(DATA_DIR, 'meals');
const RECIPES_DIR = join(MEALS_DIR, 'recipes');
const PLANS_DIR = join(MEALS_DIR, 'plans');

function ensureDirs() {
  [MEALS_DIR, RECIPES_DIR, PLANS_DIR].forEach(d => {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  });
}

function getWeekStart(dateStr) {
  if (dateStr) return dateStr;
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

function loadPlan(weekStart) {
  ensureDirs();
  const path = join(PLANS_DIR, `${weekStart}.json`);
  if (!existsSync(path)) {
    return {
      week_start: weekStart,
      days: {
        monday: { breakfast: '', lunch: '', dinner: '', snacks: '' },
        tuesday: { breakfast: '', lunch: '', dinner: '', snacks: '' },
        wednesday: { breakfast: '', lunch: '', dinner: '', snacks: '' },
        thursday: { breakfast: '', lunch: '', dinner: '', snacks: '' },
        friday: { breakfast: '', lunch: '', dinner: '', snacks: '' },
        saturday: { breakfast: '', lunch: '', dinner: '', snacks: '' },
        sunday: { breakfast: '', lunch: '', dinner: '', snacks: '' }
      }
    };
  }
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function savePlan(plan) {
  ensureDirs();
  writeFileSync(join(PLANS_DIR, `${plan.week_start}.json`), JSON.stringify(plan, null, 2));
}

export function setMeal({ day, meal, description, week_start }) {
  const ws = getWeekStart(week_start);
  const plan = loadPlan(ws);
  if (!plan.days[day]) return { success: false, message: `Invalid day: ${day}` };
  plan.days[day][meal] = description;
  savePlan(plan);
  return { success: true, message: `Set ${day} ${meal}: ${description}` };
}

export function getMealPlan({ week_start } = {}) {
  const ws = getWeekStart(week_start);
  return loadPlan(ws);
}

export function addRecipe({ name, ingredients, instructions, prep_time, cook_time, servings, tags, notes }) {
  ensureDirs();
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
  const recipe = {
    id,
    name,
    ingredients: Array.isArray(ingredients) ? ingredients : ingredients.split(',').map(i => i.trim()),
    instructions: Array.isArray(instructions) ? instructions : instructions.split('\n').filter(Boolean),
    prep_time: prep_time || '',
    cook_time: cook_time || '',
    servings: servings || 4,
    tags: Array.isArray(tags) ? tags : (tags || '').split(',').map(t => t.trim()).filter(Boolean),
    notes: notes || '',
    created_at: new Date().toISOString()
  };
  writeFileSync(join(RECIPES_DIR, `${id}.json`), JSON.stringify(recipe, null, 2));
  return { success: true, id, message: `Recipe "${name}" saved` };
}

export function searchRecipes({ query }) {
  ensureDirs();
  const files = readdirSync(RECIPES_DIR).filter(f => f.endsWith('.json'));
  const results = [];
  const q = query.toLowerCase();

  for (const file of files) {
    const recipe = JSON.parse(readFileSync(join(RECIPES_DIR, file), 'utf-8'));
    if (
      recipe.name.toLowerCase().includes(q) ||
      recipe.tags.some(t => t.toLowerCase().includes(q)) ||
      recipe.ingredients.some(i => i.toLowerCase().includes(q))
    ) {
      results.push({ id: recipe.id, name: recipe.name, tags: recipe.tags, prep_time: recipe.prep_time, cook_time: recipe.cook_time });
    }
  }
  return results;
}

export function getRecipe({ name }) {
  ensureDirs();
  const files = readdirSync(RECIPES_DIR).filter(f => f.endsWith('.json'));
  const q = name.toLowerCase();

  for (const file of files) {
    const recipe = JSON.parse(readFileSync(join(RECIPES_DIR, file), 'utf-8'));
    if (recipe.name.toLowerCase().includes(q) || recipe.id.includes(q)) {
      return recipe;
    }
  }
  return { error: `Recipe "${name}" not found` };
}

export function generateGroceryList({ week_start } = {}) {
  const plan = getMealPlan({ week_start });
  const allMeals = [];

  Object.values(plan.days).forEach(day => {
    Object.values(day).forEach(meal => {
      if (meal) allMeals.push(meal);
    });
  });

  // Try to match meals to saved recipes for ingredient extraction
  const ingredients = new Set();
  const unmatchedMeals = [];

  for (const meal of allMeals) {
    const matches = searchRecipes({ query: meal });
    if (matches.length > 0) {
      const recipe = getRecipe({ name: matches[0].name });
      if (recipe.ingredients) {
        recipe.ingredients.forEach(i => ingredients.add(i));
      }
    } else {
      unmatchedMeals.push(meal);
    }
  }

  return {
    ingredients: [...ingredients],
    unmatched_meals: unmatchedMeals,
    message: `Generated grocery list: ${ingredients.size} items from recipes. ${unmatchedMeals.length} meals have no saved recipe.`
  };
}
