export const RULE_COMPONENTS = [
    { value: 'entire_article', label: 'Entire Article (Headline + Body)' },
    { value: 'headline', label: 'Headline' },
    { value: 'summary', label: 'Summary' },
    { value: 'article_url', label: 'Article URL' },
    { value: 'published_date', label: 'Published Date' },
    { value: 'full_article', label: 'Article Body' },
    { value: 'content_categories', label: 'Content Categories' },
    { value: 'content_type', label: 'Content Type' },
    { value: 'source_attribution', label: 'Source/Outlet' }
];

export const RULE_OPERATORS = [
    { value: 'exists', label: 'Exists (Is Not Empty)' },
    { value: 'not_exists', label: 'Does Not Exist (Is Empty)' },
    { value: 'contains', label: 'Contains Text' },
    { value: 'not_contains', label: 'Does Not Contain Text' },
    { value: 'equals', label: 'Exactly Equals' },
    { value: 'not_equals', label: 'Does Not Equal' },
    { value: 'min_length', label: 'Minimum Length (Words)' },
    { value: 'max_length', label: 'Maximum Length (Words)' },
    { value: 'regex', label: 'Matches Regex Pattern (Must match to pass)' },
    { value: 'not_regex', label: 'Forbidden Regex Pattern (Must NOT match)' }
];

export const RULE_CATEGORIES = [
    { value: 'editorial', label: 'Editorial Standard' },
    { value: 'metadata', label: 'Metadata & Tags' },
    { value: 'content_cleanup', label: 'Content Cleanup' },
    { value: 'summary_validation', label: 'Summary Validation' }
];

export const RULE_ACTIONS = [
    { value: 'suggest_fix', label: 'Suggest Fix' },
    { value: 'auto_fix', label: 'Auto Fix (If Possible)' },
    { value: 'block_submission', label: 'Block Submission' }
];

export const RULE_SEVERITIES = [
    { value: 'info', label: 'Info - Weight 1' },
    { value: 'warning', label: 'Warning - Weight 5' },
    { value: 'critical', label: 'Critical - Weight 10' }
];
