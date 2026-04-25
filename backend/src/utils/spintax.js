const logger = require('./logger');

// ─── Spintax Processing Engine ───────────────────────────────────────────────

/**
 * Processes a spintax string, resolving all {option1|option2|option3} blocks
 * (including nested ones) and replacing {{variableName}} placeholders with
 * values from the provided variables object.
 *
 * Spintax syntax:
 *   {Hi|Hey|Hello}          → randomly picks one option
 *   {Hi|Hey {there|friend}} → supports nesting
 *   {{firstName}}           → replaced with variables.firstName
 *
 * @param {string} text - The spintax template string
 * @param {Object} [variables={}] - Key-value map of variable replacements
 * @returns {string} The processed string with all spintax resolved
 */
function processSpintax(text, variables = {}) {
  if (!text || typeof text !== 'string') {
    return text || '';
  }

  let result = text;

  // Step 1: Replace {{variableName}} placeholders with variable values.
  // Do this first so variables can contain spintax if desired.
  result = replaceVariables(result, variables);

  // Step 2: Resolve spintax blocks from the innermost out (handles nesting).
  result = resolveSpintaxBlocks(result);

  return result;
}

/**
 * Replaces all {{variableName}} placeholders in the text with corresponding
 * values from the variables object. Missing variables are left as empty strings.
 *
 * @param {string} text - Text containing {{variable}} placeholders
 * @param {Object} variables - Key-value map
 * @returns {string} Text with placeholders replaced
 */
function replaceVariables(text, variables) {
  if (!variables || typeof variables !== 'object') {
    return text;
  }

  return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    if (Object.prototype.hasOwnProperty.call(variables, varName)) {
      const value = variables[varName];
      return value != null ? String(value) : '';
    }
    // Variable not found — leave empty string rather than broken placeholder
    return '';
  });
}

/**
 * Resolves all spintax {option1|option2|option3} blocks in the text,
 * processing from the innermost nested blocks outward.
 *
 * Uses a regex that matches the innermost blocks first (blocks with no
 * nested braces), replaces them, and repeats until no more blocks remain.
 *
 * @param {string} text - Text containing spintax blocks
 * @returns {string} Text with all spintax blocks resolved
 */
function resolveSpintaxBlocks(text) {
  // Match innermost spintax blocks: { ... } where content has no { or }
  const INNERMOST_BLOCK = /\{([^{}]+)\}/g;

  let result = text;
  let maxIterations = 100; // Safety guard against infinite loops
  let previousResult = '';

  while (INNERMOST_BLOCK.test(result) && maxIterations > 0 && result !== previousResult) {
    previousResult = result;
    result = result.replace(INNERMOST_BLOCK, (match, content) => {
      // Only treat as spintax if there's a pipe separator
      if (!content.includes('|')) {
        // Not spintax — could be a literal brace usage; restore it with a
        // temporary marker so we don't loop forever.
        return `\x00LBRACE${content}\x00RBRACE`;
      }
      const options = content.split('|');
      const randomIndex = Math.floor(Math.random() * options.length);
      return options[randomIndex].trim();
    });
    maxIterations--;
  }

  // Restore any non-spintax braces
  result = result.replace(/\x00LBRACE/g, '{').replace(/\x00RBRACE/g, '}');

  return result;
}

/**
 * Generates multiple unique variations of a spintax template.
 *
 * Attempts to produce `count` unique strings by processing the spintax
 * repeatedly. If the template has fewer unique combinations than requested,
 * returns as many unique variations as possible.
 *
 * @param {string} text - The spintax template string
 * @param {number} [count=5] - Number of unique variations to generate
 * @param {Object} [variables={}] - Key-value map of variable replacements
 * @returns {string[]} Array of unique processed strings
 */
function getVariations(text, count = 5, variables = {}) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const safeCount = Math.max(1, Math.min(count, 1000));
  const totalPossible = countVariations(text);
  const targetCount = Math.min(safeCount, totalPossible);

  const uniqueSet = new Set();
  // Allow many more attempts than needed to find unique variations, but cap it
  const maxAttempts = Math.min(targetCount * 20, 10000);
  let attempts = 0;

  while (uniqueSet.size < targetCount && attempts < maxAttempts) {
    const variation = processSpintax(text, variables);
    uniqueSet.add(variation);
    attempts++;
  }

  return Array.from(uniqueSet);
}

/**
 * Calculates the total number of possible unique combinations a spintax
 * template can produce (ignoring variable substitution).
 *
 * For nested spintax, the calculation accounts for options within each
 * nesting level by multiplying the option counts.
 *
 * @param {string} text - The spintax template string
 * @returns {number} Total possible unique combinations
 */
function countVariations(text) {
  if (!text || typeof text !== 'string') {
    return 1;
  }

  // We parse the string character by character, tracking brace depth.
  // For each spintax block we find, we count options and multiply.
  // Nested blocks contribute their own multiplicative factor.

  let total = 1;
  let processed = text;
  const INNERMOST_BLOCK = /\{([^{}]+)\}/g;

  let maxIterations = 100;
  let previousProcessed = '';

  while (INNERMOST_BLOCK.test(processed) && maxIterations > 0 && processed !== previousProcessed) {
    previousProcessed = processed;
    processed = processed.replace(INNERMOST_BLOCK, (match, content) => {
      if (!content.includes('|')) {
        // Not spintax; replace with placeholder to avoid re-matching
        return `__LITERAL__`;
      }
      const options = content.split('|');
      total *= options.length;
      // Replace with a single placeholder so outer blocks see it as one item
      return '__RESOLVED__';
    });
    maxIterations--;
  }

  return total;
}

module.exports = { processSpintax, getVariations, countVariations };
