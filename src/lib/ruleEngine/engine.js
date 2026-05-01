/**
 * Core Evaluation Engine for Flexible Editorial Rules
 */

// Helper: Strip HTML tags to evaluate raw text content
const stripHtml = (html) => {
    if (!html) return '';
    return html.replace(/<[^>]*>?/gm, '');
};

// Helper: Count words in a string
const countWords = (str) => {
    const clean = stripHtml(str);
    return clean.trim().split(/\s+/).filter(word => word.length > 0).length;
};

/**
 * Evaluates a single condition against a given value
 */
export const evaluateCondition = (actualValue, condition) => {
    const { operator, value: expectedValue } = condition;

    // Handle null/undefined actuals gracefully for string operations
    const safeActualStr = actualValue !== null && actualValue !== undefined ? String(actualValue) : '';
    const safeExpectedStr = expectedValue ? String(expectedValue) : '';

    switch (operator) {
        case 'exists':
            return actualValue !== null && actualValue !== undefined && safeActualStr.trim().length > 0;

        case 'not_exists':
            return actualValue === null || actualValue === undefined || safeActualStr.trim().length === 0;

        case 'contains':
            return safeActualStr.toLowerCase().includes(safeExpectedStr.toLowerCase());

        case 'not_contains':
            return !safeActualStr.toLowerCase().includes(safeExpectedStr.toLowerCase());

        case 'equals':
            return safeActualStr === safeExpectedStr;

        case 'not_equals':
            return safeActualStr !== safeExpectedStr;

        case 'min_length':
            return countWords(safeActualStr) >= parseInt(safeExpectedStr, 10);

        case 'max_length':
            return countWords(safeActualStr) <= parseInt(safeExpectedStr, 10);

        case 'regex':
        case 'not_regex':
            try {
                // Support inline flags like /pattern/i or just default to case-sensitive
                let regex;
                if (safeExpectedStr.startsWith('/') && safeExpectedStr.lastIndexOf('/') > 0) {
                    const lastSlash = safeExpectedStr.lastIndexOf('/');
                    const pattern = safeExpectedStr.substring(1, lastSlash);
                    const flags = safeExpectedStr.substring(lastSlash + 1);
                    regex = new RegExp(pattern, flags);
                } else {
                    regex = new RegExp(safeExpectedStr);
                }
                const isMatch = regex.test(safeActualStr);
                return operator === 'regex' ? isMatch : !isMatch;
            } catch (e) {
                console.warn('Invalid regex pattern in rule:', safeExpectedStr);
                return true; // IF invalid regex, pass to avoid spamming errors
            }

        default:
            console.warn(`Unknown operator: ${operator}`);
            return true; // IF unknown operator, ignore failure
    }
};

/**
 * Runs a set of rules against an article component map
 * @param {Object} article - The article data object from the database
 * @param {Array} rules - An array of rule objects
 * @returns {Array} List of violations
 */
export const executeRuleEngine = (article, rules) => {
    const violations = [];

    // Map component strings to actual article values
    const getComponentValue = (component) => {
        switch (component) {
            case 'headline': return article.heading;
            case 'summary': return article.summary;
            case 'article_url': return article.article_url;
            case 'published_date': return article.published_date;
            case 'full_article': return article.full_article || article.summary;
            case 'content_categories': return article.content_categories ? article.content_categories.join(', ') : '';
            case 'content_type': return article.content_type;
            case 'source_attribution': return article.source; // Mapped dynamically in frontend
            default: return article[component];
        }
    };

    // Evaluate each active rule
    for (const rule of rules) {
        if (!rule.is_active) continue;

        let componentNames = [rule.component];
        if (rule.component === 'entire_article') {
            componentNames = ['headline', 'summary', 'full_article'];
        }

        for (let componentName of componentNames) {
            // Alias article_body to full_article
            if (componentName === 'article_body') componentName = 'full_article';

            const actualValue = getComponentValue(componentName);
            const isCompliant = evaluateCondition(actualValue, rule.condition);

            // Feedback for debugging (visible in console)
            console.log(`[RuleEngine] Rule: "${rule.name}" | Component: "${componentName}" | Operator: "${rule.condition.operator}" | SearchValue: "${rule.condition.value}" | Result: ${isCompliant ? 'PASS' : 'FAIL (VIOLATION)'}`);

            // If the condition FAILS, it's a violation
            if (!isCompliant) {
                // Highlighting logic:
                // 1. If it was a 'NOT CONTAINS' rule, highlight the forbidden string we found
                // 2. Otherwise, flag the field or the detected value
                let highlightedSnippet = actualValue;

                if (rule.condition.operator === 'not_contains' && typeof actualValue === 'string') {
                    // Find where the forbidden text is
                    const forbiddenText = String(rule.condition.value);
                    const index = actualValue.toLowerCase().indexOf(forbiddenText.toLowerCase());
                    if (index !== -1) {
                        highlightedSnippet = actualValue.substring(index, index + forbiddenText.length);
                    }
                } else if (rule.condition.operator === 'not_regex' && typeof actualValue === 'string') {
                    try {
                        const safeExpectedStr = String(rule.condition.value);
                        let regex;
                        if (safeExpectedStr.startsWith('/') && safeExpectedStr.lastIndexOf('/') > 0) {
                            const lastSlash = safeExpectedStr.lastIndexOf('/');
                            regex = new RegExp(safeExpectedStr.substring(1, lastSlash), safeExpectedStr.substring(lastSlash + 1));
                        } else {
                            regex = new RegExp(safeExpectedStr);
                        }
                        const match = regex.exec(actualValue);
                        if (match && match[0]) {
                            highlightedSnippet = match[0];
                        }
                    } catch (e) { }
                } else if (rule.condition.operator === 'contains' || rule.condition.operator === 'regex' || rule.condition.operator === 'equals' || rule.condition.operator === 'min_length') {
                    // If it was supposed to contain/match it but didn't, we can't highlight the missing part
                    // We'll just set it to null so the UI knows there's an error but nothing to highlight
                    highlightedSnippet = null;
                }

                violations.push({
                    rule_id: rule.id,
                    name: rule.name,
                    category: rule.category,
                    component: componentName, // Pass the specific sub-component it failed on, not 'entire_article'
                    field: componentName === 'headline' ? 'heading' : (componentName === 'full_article' ? 'body' : componentName),
                    action_type: rule.action_type,
                    severity: rule.severity,
                    description: rule.description,
                    detected_value: actualValue,
                    violated_text: highlightedSnippet,
                    rule_operator: rule.condition.operator,
                    rule_value: rule.condition.value
                });
            }
        }
    }

    if (violations.length > 0) {
        console.log(`[RuleEngine] Found ${violations.length} violations:`, violations);
    }

    return violations;
};
