import { supabase } from './supabase';

/**
 * Log detected errors for a specific newsletter.
 * This should be called whenever a newsletter is reviewed or saved with errors.
 */
export async function logNewsletterErrors(newsletterId, clientName, reportId, violations) {
    if (!newsletterId || !clientName) return;

    try {
        // 1. Prepare error logs
        const errorLogs = violations.map(v => ({
            newsletter_id: newsletterId,
            report_id: reportId || null,
            client_name: clientName,
            rule_id: v.rule_id || null,
            error_type: v.category || v.type || 'editorial',
            severity: v.severity || 'warning',
            message: v.message || v.detail || v.label || 'Unknown Error',
            content_snippet: v.violated_text || null,
            field_name: v.field || v.component || null
        }));

        console.log(`[QA Engine] Processing ${errorLogs.length} logs for client: ${clientName}`);

        // 2. We no longer delete old logs here to support historical review sessions.
        // The ViewNewsletters page groups these by timestamp/batch.

        // 3. Insert new logs
        if (errorLogs.length > 0) {
            const { error: logErr } = await supabase
                .from('qa_error_logs')
                .insert(errorLogs);
            if (logErr) throw logErr;
        }

        // 4. Calculate Quality Score
        // Weight: Critical = 10, Warning = 4, Info = 1
        let critical = 0, warning = 0, info = 0;
        violations.forEach(v => {
            if (v.severity === 'critical') critical++;
            else if (v.severity === 'warning') warning++;
            else info++;
        });

        const penalty = (critical * 10) + (warning * 4) + (info * 1);
        const score = Math.max(0, 100 - penalty);

        // 5. Upsert Quality Stats
        // Get newsletter title first if we don't have it
        let newsletterTitle = 'Newsletter';
        const { data: nlData } = await supabase.from('reports').select('title').eq('id', newsletterId).maybeSingle();
        if (nlData) newsletterTitle = nlData.title;

        const upsertData = {
            newsletter_id: newsletterId,
            newsletter_title: newsletterTitle,
            client_name: clientName,
            quality_score: score,
            total_errors: violations.length,
            critical_errors: critical,
            warning_errors: warning,
            info_errors: info,
            analyzed_at: new Date().toISOString()
        };
        console.log('[QA Engine] Upserting stats:', upsertData);

        const { error: statsErr } = await supabase
            .from('newsletter_quality_stats')
            .upsert(upsertData, { onConflict: 'newsletter_id' });

        if (statsErr) throw statsErr;

        return { success: true, score };
    } catch (err) {
        if (err.code === '42P01' || err.message?.includes('relation') || err.message?.includes('does not exist')) {
            console.error('QA SCHEMA MISSING: The reporting tables do not exist in Supabase.');
            console.error('ACTION REQUIRED: Please copy the content of "qa_schema.sql" and run it in your Supabase SQL Editor.');
        }
        console.error('QA Logging Error FULL:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Fetch aggregation data for the QA Dashboard.
 */
export async function getQAMetrics(clientName = null) {
    try {
        let statsQuery = supabase.from('newsletter_quality_stats').select('*');
        if (clientName) statsQuery = statsQuery.eq('client_name', clientName);
        const { data: stats, error: statsErr } = await statsQuery.order('analyzed_at', { ascending: false });
        if (statsErr) throw statsErr;

        let logsQuery = supabase.from('qa_error_logs').select('*');
        if (clientName) logsQuery = logsQuery.eq('client_name', clientName);
        const { data: logs, error: logsErr } = await logsQuery.order('created_at', { ascending: false });
        if (logsErr) throw logsErr;

        return { stats, logs };
    } catch (err) {
        console.error('Fetch QA Metrics Error:', err);
        return { stats: [], logs: [] };
    }
}

/**
 * Generate AI-driven insights based on historical QA logs.
 */
export async function generateQAInsights(clientName) {
    if (!clientName) return null;

    try {
        // 1. Fetch recent logs to analyze
        const { data: logs, error: logsErr } = await supabase
            .from('qa_error_logs')
            .select('*')
            .eq('client_name', clientName)
            .order('created_at', { ascending: false })
            .limit(100);

        if (logsErr) throw logsErr;
        if (!logs || logs.length === 0) return null;

        // 2. Prepare data for AI
        const errorSummary = logs.reduce((acc, log) => {
            const key = `${log.error_type}:${log.message}`;
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        const topErrors = Object.entries(errorSummary)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([err, count]) => `${err} (Occurred ${count} times)`);

        const prompt = `
Analyze the following recurring editorial errors for client "${clientName}" and provide:
1. "Patterns": A list of common mistakes found.
2. "Recommendations": Actionable steps to prevent these.
3. "Summary": A concise 2-sentence quality assessment.

Recent Errors:
${topErrors.join('\n')}

Format as JSON with keys: "patterns" (array), "recommendations" (array), "summary" (string).
`;

        const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'openai/gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }]
            })
        });

        const result = await response.json();
        const aiResponse = JSON.parse(result.choices[0].message.content);

        // 3. Persist Insights
        await supabase
            .from('client_qa_insights')
            .upsert({
                client_name: clientName,
                summary: aiResponse.summary,
                patterns: aiResponse.patterns,
                recommendations: aiResponse.recommendations,
                updated_at: new Date().toISOString()
            }, { onConflict: 'client_name' });

        return aiResponse;
    } catch (err) {
        console.error('AI Insights Error:', err);
        return null;
    }
}
