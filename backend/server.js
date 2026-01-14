import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import session from 'express-session';
import nodemailer from 'nodemailer';
import multer from 'multer';

// ================== SURVEY DATABASE SCHEMA ==================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;
const isProduction = process.env.NODE_ENV === 'production';
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    proxy: isProduction,
    cookie: {
        secure: isProduction,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        sameSite: 'lax'
    }
}));
app.use(express.static('../')); // Serve frontend files
app.use(express.static(path.join(__dirname, '../')));

// Initialize SQLite Database
const db = new sqlite3.Database('./demos.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        migrateSurveySchema();
        console.log('Connected to SQLite database.');
    }
});

// Helper function to make database calls easier
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// API Routes
dotenv.config();

// Check if user is authenticated (middleware)
function requireAuth(req, res, next) {
    // if (!req.session.userId) {
    //     return res.status(401).json({ error: 'Authentication required' });
    // }
    next();
}

// Email transporter
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: 'rahdev238@gmail.com',
        pass: 'bugv cerc wvkt ndnq'
    }
});

// ================== SURVEY DATABASE FUNCTIONS ==================
async function migrateSurveySchema() {
    try {
        // Create surveys table
        await dbRun(`
            CREATE TABLE IF NOT EXISTS surveys (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                json TEXT NOT NULL,
                creator_email TEXT,
                creator_name TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_published BOOLEAN DEFAULT 0,
                published_at DATETIME,
                is_active BOOLEAN DEFAULT 1,
                settings TEXT DEFAULT '{}'
            )
        `);

        // Create survey_responses table
        await dbRun(`
            CREATE TABLE IF NOT EXISTS survey_responses (
                id TEXT PRIMARY KEY,
                survey_id TEXT NOT NULL,
                respondent_email TEXT,
                respondent_name TEXT,
                response_data TEXT NOT NULL,
                submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                ip_address TEXT,
                user_agent TEXT,
                session_id TEXT,
                completion_percentage INTEGER DEFAULT 100,
                time_spent_seconds INTEGER,
                is_complete BOOLEAN DEFAULT 1,
                FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
            )
        `);

        // Create survey_links table for sharing surveys
        await dbRun(`
            CREATE TABLE IF NOT EXISTS survey_links (
                id TEXT PRIMARY KEY,
                survey_id TEXT NOT NULL,
                link_code TEXT UNIQUE NOT NULL,
                created_by TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME,
                max_responses INTEGER DEFAULT NULL,
                response_count INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT 1,
                custom_message TEXT,
                FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
            )
        `);

        // Create survey_analytics table
        await dbRun(`
            CREATE TABLE IF NOT EXISTS survey_analytics (
                survey_id TEXT NOT NULL,
                date DATE NOT NULL,
                views INTEGER DEFAULT 0,
                starts INTEGER DEFAULT 0,
                completions INTEGER DEFAULT 0,
                avg_completion_time INTEGER,
                PRIMARY KEY (survey_id, date),
                FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
            )
        `);

        // Create AI analysis tables in SQLite
        await dbRun(`
            CREATE TABLE IF NOT EXISTS survey_insights (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                survey_id TEXT NOT NULL,
                insight_type TEXT NOT NULL,
                insight_text TEXT NOT NULL,
                confidence_score FLOAT,
                evidence TEXT,
                generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_actionable BOOLEAN DEFAULT 1
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS action_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                survey_id TEXT NOT NULL,
                plan_name TEXT NOT NULL,
                description TEXT,
                priority TEXT CHECK(priority IN ('low', 'medium', 'high', 'critical')),
                status TEXT DEFAULT 'pending',
                assigned_to TEXT,
                deadline DATE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                ai_generated BOOLEAN DEFAULT 1
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS action_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id INTEGER REFERENCES action_plans(id),
                item_text TEXT NOT NULL,
                category TEXT,
                owner TEXT,
                status TEXT DEFAULT 'pending',
                due_date DATE,
                completed_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS root_cause_analysis (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                survey_id TEXT NOT NULL,
                issue TEXT NOT NULL,
                root_cause TEXT,
                impact_level TEXT CHECK(impact_level IN ('low', 'medium', 'high', 'critical')),
                evidence TEXT,
                recommendations TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS dashboard_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                survey_id TEXT NOT NULL,
                metric_name TEXT NOT NULL,
                metric_value TEXT NOT NULL,
                trend TEXT CHECK(trend IN ('up', 'down', 'stable', 'new')),
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(survey_id, metric_name)
            )
        `);

        // Add summary_analysis table
        await dbRun(`
            CREATE TABLE IF NOT EXISTS summary_analysis (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                survey_id TEXT NOT NULL,
                overall_sentiment TEXT,
                key_takeaway TEXT,
                urgency_level TEXT,
                generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('Survey schema migrated successfully');
    } catch (error) {
        console.error('Error migrating survey schema:', error);
    }
}

// ================== SURVEY MANAGEMENT ENDPOINTS ==================

// 1. Save/Update a survey
app.post('/api/surveys', requireAuth, async (req, res) => {
    try {
        const {
            id,
            title,
            description,
            json,
            creator_email,
            creator_name,
            is_published,
            settings
        } = req.body;

        const surveyId = id || `survey-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();

        if (id) {
            // Update existing survey
            await dbRun(`
                UPDATE surveys 
                SET title = ?, description = ?, json = ?, updated_at = ?, 
                    is_published = ?, settings = ?
                WHERE id = ?
            `, [title, description, JSON.stringify(json), now,
                is_published ? 1 : 0, JSON.stringify(settings || {}), surveyId]);

            res.json({
                success: true,
                message: 'Survey updated successfully',
                survey_id: surveyId,
                updated_at: now
            });
        } else {
            // Create new survey
            await dbRun(`
                INSERT INTO surveys 
                (id, title, description, json, creator_email, creator_name, 
                 created_at, updated_at, is_published, settings)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                surveyId,
                title,
                description,
                JSON.stringify(json),
                creator_email,
                creator_name,
                now,
                now,
                is_published ? 1 : 0,
                JSON.stringify(settings || {})
            ]);

            res.json({
                success: true,
                message: 'Survey created successfully',
                survey_id: surveyId,
                created_at: now
            });
        }
    } catch (error) {
        console.error('Error saving survey:', error);
        res.status(500).json({ error: 'Failed to save survey' });
    }
});

// 2. Get all surveys for a user
app.get('/api/surveys', requireAuth, async (req, res) => {
    try {
        const { creator_email } = req.query;

        if (!creator_email) {
            return res.status(400).json({ error: 'creator_email parameter is required' });
        }

        const surveys = await dbAll(`
            SELECT 
                s.*,
                COUNT(DISTINCT sr.id) as response_count,
                MAX(sr.submitted_at) as last_response_date
            FROM surveys s
            LEFT JOIN survey_responses sr ON s.id = sr.survey_id
            WHERE s.creator_email = ?
            GROUP BY s.id
            ORDER BY s.updated_at DESC
        `, [creator_email]);

        // Parse JSON fields
        const parsedSurveys = surveys.map(survey => ({
            ...survey,
            json: JSON.parse(survey.json),
            settings: survey.settings ? JSON.parse(survey.settings) : {},
            is_published: Boolean(survey.is_published),
            is_active: Boolean(survey.is_active)
        }));

        res.json({
            success: true,
            surveys: parsedSurveys
        });
    } catch (error) {
        console.error('Error fetching surveys:', error);
        res.status(500).json({ error: 'Failed to fetch surveys' });
    }
});

// 3. Get a single survey by ID
app.get('/api/surveys/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { include_responses } = req.query;

        const survey = await dbGet(`
            SELECT * FROM surveys WHERE id = ?
        `, [id]);

        if (!survey) {
            return res.status(404).json({ error: 'Survey not found' });
        }

        const result = {
            ...survey,
            json: JSON.parse(survey.json),
            settings: survey.settings ? JSON.parse(survey.settings) : {},
            is_published: Boolean(survey.is_published),
            is_active: Boolean(survey.is_active)
        };

        if (include_responses === 'true') {
            const responses = await dbAll(`
                SELECT * FROM survey_responses 
                WHERE survey_id = ? 
                ORDER BY submitted_at DESC
            `, [id]);

            result.responses = responses.map(r => ({
                ...r,
                response_data: JSON.parse(r.response_data),
                is_complete: Boolean(r.is_complete)
            }));
        }

        res.json({
            success: true,
            survey: result
        });
    } catch (error) {
        console.error('Error fetching survey:', error);
        res.status(500).json({ error: 'Failed to fetch survey' });
    }
});

// 4. Delete a survey
app.delete('/api/surveys/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        await dbRun('DELETE FROM surveys WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Survey deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting survey:', error);
        res.status(500).json({ error: 'Failed to delete survey' });
    }
});

// 5. Toggle survey publish status
app.post('/api/surveys/:id/publish', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { publish } = req.body;
        const now = new Date().toISOString();

        await dbRun(`
            UPDATE surveys 
            SET is_published = ?, published_at = ?, updated_at = ?
            WHERE id = ?
        `, [publish ? 1 : 0, publish ? now : null, now, id]);

        res.json({
            success: true,
            message: publish ? 'Survey published' : 'Survey unpublished',
            published: publish,
            published_at: publish ? now : null
        });
    } catch (error) {
        console.error('Error toggling publish status:', error);
        res.status(500).json({ error: 'Failed to update survey status' });
    }
});

// ================== SURVEY RESPONSE ENDPOINTS ==================

// 6. Submit a survey response
app.post('/api/surveys/:id/responses', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            response_data,
            respondent_email,
            respondent_name,
            completion_percentage,
            time_spent_seconds,
            is_complete = true,
            session_id
        } = req.body;

        // Check if survey exists and is published
        const survey = await dbGet(`
            SELECT * FROM surveys 
            WHERE id = ? AND is_published = 1 AND is_active = 1
        `, [id]);

        if (!survey) {
            return res.status(404).json({ error: 'Survey not found or not available' });
        }

        // Generate response ID
        const responseId = `resp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Save response
        await dbRun(`
            INSERT INTO survey_responses 
            (id, survey_id, respondent_email, respondent_name, response_data, 
             completion_percentage, time_spent_seconds, is_complete, session_id,
             ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            responseId,
            id,
            respondent_email || null,
            respondent_name || null,
            JSON.stringify(response_data),
            completion_percentage || 100,
            time_spent_seconds || null,
            is_complete ? 1 : 0,
            session_id || null,
            req.ip,
            req.get('User-Agent')
        ]);

        // Update analytics
        const today = new Date().toISOString().split('T')[0];
        await dbRun(`
            INSERT OR REPLACE INTO survey_analytics 
            (survey_id, date, completions, avg_completion_time)
            VALUES (
                ?, 
                ?, 
                COALESCE((SELECT completions FROM survey_analytics WHERE survey_id = ? AND date = ?), 0) + 1,
                COALESCE(?, (SELECT avg_completion_time FROM survey_analytics WHERE survey_id = ? AND date = ?))
            )
        `, [id, today, id, today, time_spent_seconds, id, today]);

        // Trigger AI analysis if survey is complete
        if (is_complete) {
            //await triggerN8nAnalysis(responseId, id, response_data);
        }

        res.json({
            success: true,
            message: 'Response submitted successfully',
            response_id: responseId
        });
    } catch (error) {
        console.error('Error submitting response:', error);
        res.status(500).json({ error: 'Failed to submit response' });
    }
});

// 7. Get survey responses
app.get('/api/surveys/:id/responses', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        // Get total count
        const countResult = await dbGet(
            'SELECT COUNT(*) as total FROM survey_responses WHERE survey_id = ?',
            [id]
        );

        // Get responses
        const responses = await dbAll(`
            SELECT * FROM survey_responses 
            WHERE survey_id = ? 
            ORDER BY submitted_at DESC
            LIMIT ? OFFSET ?
        `, [id, limit, offset]);

        // Parse response data
        const parsedResponses = responses.map(r => ({
            ...r,
            response_data: JSON.parse(r.response_data),
            is_complete: Boolean(r.is_complete)
        }));

        res.json({
            success: true,
            responses: parsedResponses,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult.total,
                pages: Math.ceil(countResult.total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching responses:', error);
        res.status(500).json({ error: 'Failed to fetch responses' });
    }
});

// 8. Export responses as CSV
app.get('/api/surveys/:id/export/csv', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const survey = await dbGet('SELECT json FROM surveys WHERE id = ?', [id]);
        if (!survey) {
            return res.status(404).json({ error: 'Survey not found' });
        }

        const responses = await dbAll(
            'SELECT * FROM survey_responses WHERE survey_id = ? ORDER BY submitted_at DESC',
            [id]
        );

        const surveyJson = JSON.parse(survey.json);
        const questions = extractQuestions(surveyJson);

        // Generate CSV headers
        const headers = [
            'Response ID',
            'Submitted At',
            'Respondent Email',
            'Respondent Name',
            'Completion %',
            'Time Spent (s)',
            ...questions.map(q => q.title || q.name)
        ];

        // Generate CSV rows
        const rows = responses.map(r => {
            const responseData = JSON.parse(r.response_data);
            const row = [
                r.id,
                r.submitted_at,
                r.respondent_email || '',
                r.respondent_name || '',
                r.completion_percentage,
                r.time_spent_seconds || '',
                ...questions.map(q => responseData[q.name] || '')
            ];
            return row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=survey-${id}-responses.csv`);
        res.send(csvContent);

    } catch (error) {
        console.error('Error exporting CSV:', error);
        res.status(500).json({ error: 'Failed to export responses' });
    }
});

function extractQuestions(surveyJson) {
    const questions = [];

    if (surveyJson.pages) {
        surveyJson.pages.forEach(page => {
            if (page.elements) {
                page.elements.forEach(element => {
                    if (element.type !== 'panel') {
                        questions.push({
                            name: element.name,
                            title: element.title || element.name,
                            type: element.type
                        });
                    }
                });
            }
        });
    }

    return questions;
}

// ================== SURVEY SHARING ENDPOINTS ==================

// 9. Create a shareable link for a survey
app.post('/api/surveys/:id/share', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            expires_at,
            max_responses,
            custom_message,
            created_by
        } = req.body;

        // Generate unique link code
        const linkCode = Math.random().toString(36).substr(2, 10);
        const linkId = `link-${Date.now()}-${linkCode}`;

        await dbRun(`
            INSERT INTO survey_links 
            (id, survey_id, link_code, created_by, expires_at, max_responses, custom_message)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            linkId,
            id,
            linkCode,
            created_by,
            expires_at || null,
            max_responses || null,
            custom_message || null
        ]);

        const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
        const surveyLink = `${baseUrl}/survey/${linkCode}`;

        res.json({
            success: true,
            message: 'Shareable link created',
            link_id: linkId,
            link_code: linkCode,
            survey_link: surveyLink,
            expires_at: expires_at,
            max_responses: max_responses
        });
    } catch (error) {
        console.error('Error creating shareable link:', error);
        res.status(500).json({ error: 'Failed to create shareable link' });
    }
});

// 10. Get survey by link code (for public access)
app.get('/api/survey-by-link/:code', async (req, res) => {
    try {
        const { code } = req.params;

        const link = await dbGet(`
            SELECT sl.*, s.title, s.description, s.json, s.settings
            FROM survey_links sl
            JOIN surveys s ON sl.survey_id = s.id
            WHERE sl.link_code = ? 
            AND sl.is_active = 1
            AND s.is_published = 1
            AND s.is_active = 1
        `, [code]);

        if (!link) {
            return res.status(404).json({ error: 'Survey link not found or expired' });
        }

        // Check if link has expired
        if (link.expires_at && new Date(link.expires_at) < new Date()) {
            await dbRun('UPDATE survey_links SET is_active = 0 WHERE id = ?', [link.id]);
            return res.status(410).json({ error: 'Survey link has expired' });
        }

        // Check max responses
        if (link.max_responses && link.response_count >= link.max_responses) {
            return res.status(410).json({ error: 'Survey has reached maximum responses' });
        }

        // Update view analytics
        const today = new Date().toISOString().split('T')[0];
        await dbRun(`
            INSERT INTO survey_analytics (survey_id, date, views)
            VALUES (?, ?, 1)
            ON CONFLICT(survey_id, date) DO UPDATE SET views = views + 1
        `, [link.survey_id, today]);

        res.json({
            success: true,
            survey: {
                id: link.survey_id,
                title: link.title,
                description: link.description,
                json: JSON.parse(link.json),
                settings: link.settings ? JSON.parse(link.settings) : {},
                link_info: {
                    link_id: link.id,
                    expires_at: link.expires_at,
                    max_responses: link.max_responses,
                    response_count: link.response_count,
                    custom_message: link.custom_message
                }
            }
        });
    } catch (error) {
        console.error('Error fetching survey by link:', error);
        res.status(500).json({ error: 'Failed to fetch survey' });
    }
});

// Add debug endpoint
app.get('/debug-survey/:code', async (req, res) => {
    try {
        const { code } = req.params;

        // Check link
        const link = await dbGet(`
            SELECT * FROM survey_links WHERE link_code = ? AND is_active = 1
        `, [code]);

        if (!link) {
            return res.json({ error: 'Link not found or inactive', link });
        }

        // Check survey
        const survey = await dbGet(`
            SELECT * FROM surveys WHERE id = ? AND is_published = 1
        `, [link.survey_id]);

        if (!survey) {
            return res.json({ error: 'Survey not found or not published', survey });
        }

        // Parse JSON
        let jsonData;
        try {
            jsonData = JSON.parse(survey.json);
        } catch (e) {
            return res.json({ error: 'Invalid JSON in survey', jsonError: e.message });
        }

        res.json({
            success: true,
            link: link,
            survey: {
                ...survey,
                json: jsonData,
                pages_count: jsonData.pages ? jsonData.pages.length : 0,
                questions_count: jsonData.pages ? jsonData.pages.reduce((acc, page) => acc + (page.elements ? page.elements.length : 0), 0) : 0
            }
        });

    } catch (error) {
        console.error('Debug error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 11. Get all shareable links for a survey
app.get('/api/surveys/:id/links', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const links = await dbAll(`
            SELECT * FROM survey_links 
            WHERE survey_id = ? 
            ORDER BY created_at DESC
        `, [id]);

        const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
        const linksWithUrl = links.map(link => ({
            ...link,
            full_url: `${baseUrl}/survey/${link.link_code}`,
            is_active: Boolean(link.is_active),
            is_expired: link.expires_at ? new Date(link.expires_at) < new Date() : false
        }));

        res.json({
            success: true,
            links: linksWithUrl
        });
    } catch (error) {
        console.error('Error fetching survey links:', error);
        res.status(500).json({ error: 'Failed to fetch survey links' });
    }
});

// 12. Deactivate a shareable link
app.post('/api/survey-links/:linkId/deactivate', requireAuth, async (req, res) => {
    try {
        const { linkId } = req.params;

        await dbRun('UPDATE survey_links SET is_active = 0 WHERE id = ?', [linkId]);

        res.json({
            success: true,
            message: 'Link deactivated successfully'
        });
    } catch (error) {
        console.error('Error deactivating link:', error);
        res.status(500).json({ error: 'Failed to deactivate link' });
    }
});

// ================== ANALYTICS ENDPOINTS ==================

// 13. Get survey analytics
app.get('/api/surveys/:id/analytics', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { period = '7d' } = req.query; // 7d, 30d, 90d, all

        let dateFilter = '';
        let params = [id];

        if (period !== 'all') {
            const days = parseInt(period);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            dateFilter = 'AND date >= ?';
            params.push(cutoffDate.toISOString().split('T')[0]);
        }

        const analytics = await dbAll(`
            SELECT * FROM survey_analytics 
            WHERE survey_id = ? ${dateFilter}
            ORDER BY date DESC
        `, params);

        // Get summary stats
        const summary = await dbGet(`
            SELECT 
                COUNT(DISTINCT sr.id) as total_responses,
                AVG(sr.completion_percentage) as avg_completion_rate,
                AVG(sr.time_spent_seconds) as avg_time_spent,
                COUNT(DISTINCT sr.respondent_email) as unique_respondents
            FROM survey_responses sr
            WHERE sr.survey_id = ?
        `, [id]);

        // Get daily trends for the last 30 days
        const trends = await dbAll(`
            SELECT 
                date,
                SUM(views) as views,
                SUM(starts) as starts,
                SUM(completions) as completions
            FROM survey_analytics 
            WHERE survey_id = ? 
            GROUP BY date
            ORDER BY date DESC
            LIMIT 30
        `, [id]);

        res.json({
            success: true,
            analytics: analytics,
            summary: summary,
            trends: trends.reverse() // Reverse to show oldest first
        });
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// ================== AI AGENT ANALYSIS ENDPOINTS ==================

// 14. Get survey responses in AI-friendly format for analysis
app.get('/api/surveys/:id/responses/analysis', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            format = 'structured', // 'structured', 'text', 'full'
            limit = 100,
            include_questions = true
        } = req.query;

        // Get survey details
        const survey = await dbGet('SELECT * FROM surveys WHERE id = ?', [id]);
        if (!survey) {
            return res.status(404).json({ error: 'Survey not found' });
        }

        // Get all responses for this survey
        const responses = await dbAll(`
            SELECT * FROM survey_responses 
            WHERE survey_id = ? AND is_complete = 1
            ORDER BY submitted_at DESC
            LIMIT ?
        `, [id, limit]);

        // Parse survey JSON
        const surveyJson = JSON.parse(survey.json);

        // Parse responses
        const parsedResponses = responses.map(r => ({
            id: r.id,
            submitted_at: r.submitted_at,
            respondent_email: r.respondent_email,
            respondent_name: r.respondent_name,
            completion_percentage: r.completion_percentage,
            time_spent_seconds: r.time_spent_seconds,
            response_data: JSON.parse(r.response_data)
        }));

        // Prepare analysis data based on format
        let analysisData;

        if (format === 'text') {
            // Text format for LLM consumption
            analysisData = formatAsText(surveyJson, parsedResponses);
        } else if (format === 'full') {
            // Full structured data
            analysisData = {
                survey: {
                    id: survey.id,
                    title: survey.title,
                    description: survey.description,
                    questions: extractQuestionsForAnalysis(surveyJson),
                    settings: survey.settings ? JSON.parse(survey.settings) : {}
                },
                summary: {
                    total_responses: responses.length,
                    time_period: {
                        first_response: responses.length > 0 ? responses[responses.length - 1].submitted_at : null,
                        last_response: responses.length > 0 ? responses[0].submitted_at : null
                    },
                    completion_rate: responses.length > 0 ? 100 : 0, // All are complete if we filter by is_complete
                    avg_time_spent: responses.length > 0 ?
                        responses.reduce((sum, r) => sum + (r.time_spent_seconds || 0), 0) / responses.length : 0
                },
                responses: parsedResponses
            };
        } else {
            // Structured format (default)
            analysisData = {
                survey_id: survey.id,
                survey_title: survey.title,
                total_responses: responses.length,
                analysis_timestamp: new Date().toISOString(),
                data_format: 'question-response pairs',
                responses: parsedResponses.map(r => ({
                    response_id: r.id,
                    submitted: r.submitted_at,
                    respondent: r.respondent_email || r.respondent_name || 'anonymous',
                    answers: Object.entries(r.response_data).map(([questionName, answer]) => {
                        const question = findQuestion(surveyJson, questionName);
                        return {
                            question_id: questionName,
                            question_text: question?.title || questionName,
                            question_type: question?.type || 'unknown',
                            answer: answer,
                            answer_type: typeof answer
                        };
                    })
                }))
            };
        }

        res.json({
            success: true,
            format: format,
            total_responses: responses.length,
            data: analysisData
        });

    } catch (error) {
        console.error('Error fetching responses for analysis:', error);
        res.status(500).json({ error: 'Failed to fetch analysis data' });
    }
});

// 15. Get aggregated response statistics for AI analysis
app.get('/api/surveys/:id/analysis/stats', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Get survey
        const survey = await dbGet('SELECT * FROM surveys WHERE id = ?', [id]);
        if (!survey) {
            return res.status(404).json({ error: 'Survey not found' });
        }

        // Get all complete responses
        const responses = await dbAll(`
            SELECT * FROM survey_responses 
            WHERE survey_id = ? AND is_complete = 1
        `, [id]);

        if (responses.length === 0) {
            return res.json({
                success: true,
                message: 'No responses available for analysis',
                survey_id: id,
                total_responses: 0
            });
        }

        // Parse survey and responses
        const surveyJson = JSON.parse(survey.json);
        const parsedResponses = responses.map(r => ({
            ...r,
            response_data: JSON.parse(r.response_data)
        }));

        // Extract questions
        const questions = extractQuestionsForAnalysis(surveyJson);

        // Calculate statistics for each question
        const questionStats = questions.map(question => {
            const answers = parsedResponses
                .map(r => r.response_data[question.name])
                .filter(answer => answer !== undefined && answer !== null);

            return {
                question_id: question.name,
                question_text: question.title,
                question_type: question.type,
                total_answers: answers.length,
                answer_rate: (answers.length / parsedResponses.length * 100).toFixed(1) + '%',
                statistics: calculateQuestionStatistics(question.type, answers)
            };
        });

        // Calculate overall metrics
        const overallStats = {
            total_responses: parsedResponses.length,
            unique_respondents: new Set(parsedResponses.map(r => r.respondent_email).filter(email => email)).size,
            avg_completion_time: parsedResponses.reduce((sum, r) => sum + (r.time_spent_seconds || 0), 0) / parsedResponses.length,
            completion_rate: '100%', // All are complete
            time_range: {
                first_response: parsedResponses[parsedResponses.length - 1]?.submitted_at,
                last_response: parsedResponses[0]?.submitted_at
            }
        };

        // Detect patterns and insights
        const insights = detectInsights(questions, parsedResponses);

        res.json({
            success: true,
            survey: {
                id: survey.id,
                title: survey.title,
                description: survey.description
            },
            overall_stats: overallStats,
            question_statistics: questionStats,
            insights: insights,
            recommendations: generateRecommendations(questionStats, insights)
        });

    } catch (error) {
        console.error('Error generating analysis stats:', error);
        res.status(500).json({ error: 'Failed to generate analysis statistics' });
    }
});

// 16. Get responses for specific question (for detailed analysis)
app.get('/api/surveys/:id/questions/:questionName/responses', requireAuth, async (req, res) => {
    try {
        const { id, questionName } = req.params;
        const { format = 'detailed' } = req.query;

        // Get survey
        const survey = await dbGet('SELECT json FROM surveys WHERE id = ?', [id]);
        if (!survey) {
            return res.status(404).json({ error: 'Survey not found' });
        }

        // Get question details
        const surveyJson = JSON.parse(survey.json);
        const question = findQuestion(surveyJson, questionName);

        if (!question) {
            return res.status(404).json({ error: 'Question not found in survey' });
        }

        // Get responses with this question answered
        const responses = await dbAll(`
            SELECT id, submitted_at, respondent_email, respondent_name, response_data
            FROM survey_responses 
            WHERE survey_id = ? AND is_complete = 1
            AND response_data LIKE ?
            ORDER BY submitted_at DESC
        `, [id, `%"${questionName}":%`]);

        // Parse responses and extract the specific answer
        const questionResponses = responses.map(r => {
            const responseData = JSON.parse(r.response_data);
            return {
                response_id: r.id,
                submitted_at: r.submitted_at,
                respondent: r.respondent_email || r.respondent_name || 'anonymous',
                answer: responseData[questionName],
                answer_type: typeof responseData[questionName]
            };
        }).filter(r => r.answer !== undefined);

        // Format based on request
        let formattedData;
        if (format === 'aggregated') {
            formattedData = {
                question: {
                    id: question.name,
                    text: question.title,
                    type: question.type,
                    required: question.isRequired || false
                },
                total_answers: questionResponses.length,
                answers: aggregateAnswers(question.type, questionResponses.map(r => r.answer))
            };
        } else {
            formattedData = {
                question: {
                    id: question.name,
                    text: question.title,
                    type: question.type,
                    required: question.isRequired || false
                },
                total_answers: questionResponses.length,
                responses: questionResponses
            };
        }

        res.json({
            success: true,
            survey_id: id,
            question: questionName,
            ...formattedData
        });

    } catch (error) {
        console.error('Error fetching question responses:', error);
        res.status(500).json({ error: 'Failed to fetch question responses' });
    }
});

// ================== HELPER FUNCTIONS FOR ANALYSIS ==================

function formatAsText(surveyJson, responses) {
    let text = `SURVEY ANALYSIS DATA\n`;
    text += `====================\n\n`;

    // Survey info
    text += `Survey: ${surveyJson.title || 'Untitled Survey'}\n`;
    if (surveyJson.description) {
        text += `Description: ${surveyJson.description}\n`;
    }
    text += `\n`;

    // Questions
    const questions = extractQuestionsForAnalysis(surveyJson);
    text += `QUESTIONS (${questions.length}):\n`;
    questions.forEach((q, index) => {
        text += `${index + 1}. ${q.title} [${q.type}]\n`;
    });
    text += `\n`;

    // Responses
    text += `RESPONSES (${responses.length}):\n\n`;
    responses.forEach((response, rIndex) => {
        text += `Response ${rIndex + 1} (${response.submitted_at}):\n`;
        text += `- Respondent: ${response.respondent_email || response.respondent_name || 'anonymous'}\n`;
        text += `- Completion: ${response.completion_percentage}%\n`;
        text += `- Time spent: ${response.time_spent_seconds || 0} seconds\n\n`;

        // Answers
        Object.entries(response.response_data).forEach(([qName, answer]) => {
            const question = questions.find(q => q.name === qName);
            if (question) {
                text += `  Q: ${question.title}\n`;
                text += `  A: ${formatAnswerForText(answer)}\n\n`;
            }
        });
        text += `---\n\n`;
    });

    return text;
}

function formatAnswerForText(answer) {
    if (answer === null || answer === undefined) return '[No answer]';
    if (Array.isArray(answer)) return answer.join(', ');
    if (typeof answer === 'object') return JSON.stringify(answer);
    return String(answer);
}

function extractQuestionsForAnalysis(surveyJson) {
    const questions = [];

    if (surveyJson.pages) {
        surveyJson.pages.forEach(page => {
            if (page.elements) {
                page.elements.forEach(element => {
                    if (element.type !== 'panel') {
                        questions.push({
                            name: element.name,
                            title: element.title || element.name,
                            type: element.type,
                            isRequired: element.isRequired || false,
                            choices: element.choices || (element.rateValues ? element.rateValues.map((v, i) => ({
                                value: v.value || v.text || i + 1,
                                text: v.text || v.value || `Option ${i + 1}`
                            })) : null)
                        });
                    }
                });
            }
        });
    }

    return questions;
}

function findQuestion(surveyJson, questionName) {
    if (!surveyJson.pages) return null;

    for (const page of surveyJson.pages) {
        if (page.elements) {
            for (const element of page.elements) {
                if (element.name === questionName) {
                    return element;
                }
            }
        }
    }
    return null;
}

function calculateQuestionStatistics(type, answers) {
    if (answers.length === 0) return { message: 'No answers available' };

    const stats = {
        total: answers.length,
        unique_values: new Set(answers.map(a => JSON.stringify(a))).size
    };

    switch (type) {
        case 'rating':
        case 'text':
            const numericAnswers = answers.filter(a => !isNaN(parseFloat(a)));
            if (numericAnswers.length > 0) {
                const values = numericAnswers.map(a => parseFloat(a));
                stats.average = values.reduce((a, b) => a + b, 0) / values.length;
                stats.min = Math.min(...values);
                stats.max = Math.max(...values);
            }
            break;

        case 'radiogroup':
        case 'dropdown':
        case 'checkbox':
            const frequency = {};
            answers.forEach(answer => {
                if (Array.isArray(answer)) {
                    answer.forEach(item => {
                        frequency[item] = (frequency[item] || 0) + 1;
                    });
                } else {
                    frequency[answer] = (frequency[answer] || 0) + 1;
                }
            });

            // Convert to array and sort by frequency
            stats.frequency = Object.entries(frequency)
                .map(([value, count]) => ({
                    value,
                    count,
                    percentage: ((count / answers.length) * 100).toFixed(1) + '%'
                }))
                .sort((a, b) => b.count - a.count);

            // Top choices
            stats.top_choices = stats.frequency.slice(0, 5);
            break;

        case 'boolean':
            const trueCount = answers.filter(a => a === true || a === 'true').length;
            const falseCount = answers.filter(a => a === false || a === 'false').length;
            stats.true_percentage = ((trueCount / answers.length) * 100).toFixed(1) + '%';
            stats.false_percentage = ((falseCount / answers.length) * 100).toFixed(1) + '%';
            break;
    }

    return stats;
}

function aggregateAnswers(type, answers) {
    switch (type) {
        case 'radiogroup':
        case 'dropdown':
            const counts = {};
            answers.forEach(answer => {
                counts[answer] = (counts[answer] || 0) + 1;
            });
            return Object.entries(counts).map(([value, count]) => ({
                value,
                count,
                percentage: ((count / answers.length) * 100).toFixed(1)
            }));

        case 'checkbox':
            const allSelections = {};
            answers.forEach(answerArray => {
                if (Array.isArray(answerArray)) {
                    answerArray.forEach(item => {
                        allSelections[item] = (allSelections[item] || 0) + 1;
                    });
                }
            });
            return Object.entries(allSelections).map(([value, count]) => ({
                value,
                count,
                percentage: ((count / answers.length) * 100).toFixed(1)
            }));

        case 'rating':
            const numericAnswers = answers.filter(a => !isNaN(parseFloat(a)));
            if (numericAnswers.length > 0) {
                const values = numericAnswers.map(a => parseFloat(a));
                return {
                    average: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
                    distribution: values.reduce((dist, val) => {
                        dist[val] = (dist[val] || 0) + 1;
                        return dist;
                    }, {})
                };
            }
            break;

        default:
            return {
                sample_answers: answers.slice(0, 10),
                total_unique: new Set(answers.map(a => JSON.stringify(a))).size
            };
    }
}

function detectInsights(questions, responses) {
    const insights = [];

    // Check response rates
    questions.forEach(question => {
        const answeredCount = responses.filter(r =>
            r.response_data[question.name] !== undefined &&
            r.response_data[question.name] !== null
        ).length;

        const responseRate = (answeredCount / responses.length) * 100;

        if (responseRate < 50) {
            insights.push({
                type: 'low_response_rate',
                question: question.title,
                response_rate: responseRate.toFixed(1) + '%',
                severity: responseRate < 30 ? 'high' : 'medium',
                suggestion: 'Consider making this question optional or rephrasing it'
            });
        }
    });

    // Check for common text patterns in comments
    const commentQuestions = questions.filter(q => q.type === 'comment');
    commentQuestions.forEach(question => {
        const answers = responses
            .map(r => r.response_data[question.name])
            .filter(a => a && typeof a === 'string' && a.trim().length > 0);

        if (answers.length > 5) {
            // Simple sentiment detection (very basic)
            const positiveWords = ['good', 'great', 'excellent', 'love', 'happy', 'satisfied'];
            const negativeWords = ['bad', 'poor', 'terrible', 'hate', 'unhappy', 'dissatisfied'];

            let positiveCount = 0;
            let negativeCount = 0;

            answers.forEach(answer => {
                const lowerAnswer = answer.toLowerCase();
                if (positiveWords.some(word => lowerAnswer.includes(word))) {
                    positiveCount++;
                }
                if (negativeWords.some(word => lowerAnswer.includes(word))) {
                    negativeCount++;
                }
            });

            const sentiment = positiveCount > negativeCount ? 'mostly positive' :
                negativeCount > positiveCount ? 'mostly negative' : 'mixed';

            if (answers.length > 0) {
                insights.push({
                    type: 'sentiment_analysis',
                    question: question.title,
                    sentiment: sentiment,
                    sample_responses: answers.slice(0, 3),
                    total_comments: answers.length
                });
            }
        }
    });

    return insights;
}

function generateRecommendations(questionStats, insights) {
    const recommendations = [];

    // Based on response rates
    questionStats.forEach(stat => {
        if (stat.answer_rate && parseFloat(stat.answer_rate) < 70) {
            recommendations.push({
                type: 'improve_response_rate',
                question: stat.question_text,
                current_rate: stat.answer_rate,
                suggestion: 'Consider making this question optional, rephrasing it, or moving it to a different position in the survey'
            });
        }
    });

    // Based on question type patterns
    questionStats.forEach(stat => {
        if (stat.question_type === 'rating') {
            if (stat.statistics && stat.statistics.average !== undefined) {
                const avg = parseFloat(stat.statistics.average);
                if (avg < 2.5) {
                    recommendations.push({
                        type: 'low_rating_alert',
                        question: stat.question_text,
                        average_rating: avg.toFixed(1),
                        suggestion: 'This question received low ratings. Investigate why and consider improvements.'
                    });
                }
            }
        }
    });

    // Add general recommendations
    if (questionStats.length > 0) {
        recommendations.push({
            type: 'general',
            suggestion: 'Consider adding open-ended questions to gather qualitative feedback alongside quantitative data'
        });
    }

    return recommendations;
}

app.post('/api/webhook/ai-analysis', async (req, res) => {
    try {
        let { survey_id, items } = req.body;
        if (!Array.isArray(items)) {
            items = [items];
        }

        for (const item of items) {
            const {
                analysis_type,
                data,
                metadata = {}
            } = item;

            console.log(`Received AI analysis for survey ${survey_id}:`, analysis_type);

            switch (analysis_type) {
                case 'insights':
                    await storeSurveyInsights(survey_id, data);
                    break;
                case 'action_plan':
                    await storeActionPlan(survey_id, data);
                    break;
                case 'root_cause':
                    await storeRootCauseAnalysis(survey_id, data);
                    break;
                case 'dashboard_metrics':
                    await updateDashboardMetrics(survey_id, data);
                    break;
                case 'summary':
                    await storeSummaryAnalysis(survey_id, data);
                    break;
                default:
                    console.warn(`Unknown analysis type: ${analysis_type}`);
            }

            // Trigger real-time updates via SSE
            publishAIEvent(survey_id, {
                type: analysis_type,
                data: data,
                timestamp: new Date().toISOString()
            });
        }

        res.json({ success: true, message: `Analysis stored for ${items.length} item(s)` });

    } catch (error) {
        console.error('Error processing AI analysis:', error);
        res.status(500).json({ error: 'Failed to process analysis' });
    }
});

// Store summary analysis
async function storeSummaryAnalysis(surveyId, summaryData) {
    try {
        await dbRun(
            `INSERT INTO summary_analysis (survey_id, overall_sentiment, key_takeaway, urgency_level)
             VALUES (?, ?, ?, ?)`,
            [
                surveyId,
                summaryData.overall_sentiment || null,
                summaryData.key_takeaway || null,
                summaryData.urgency_level || null
            ]
        );
        console.log('Stored summary analysis');
    } catch (error) {
        console.error('Error storing summary analysis:', error);
    }
}

// ================== AI ANALYSIS STORAGE FUNCTIONS ==================

async function storeSurveyInsights(surveyId, insights) {
    try {
        for (const insight of insights) {
            await dbRun(
                `INSERT INTO survey_insights 
         (survey_id, insight_type, insight_text, confidence_score, evidence, is_actionable)
         VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    surveyId,
                    insight.type || 'general',
                    insight.text,
                    insight.confidence || 0.8,
                    JSON.stringify(insight.evidence || {}),
                    insight.actionable !== false ? 1 : 0
                ]
            );
        }
        console.log(`Stored ${insights.length} insights for survey ${surveyId}`);
    } catch (error) {
        console.error('Error storing insights:', error);
    }
}

async function storeActionPlan(surveyId, planData) {
    try {
        const planResult = await dbRun(
            `INSERT INTO action_plans 
       (survey_id, plan_name, description, priority, status, assigned_to, deadline, ai_generated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                surveyId,
                planData.plan_name || `Action Plan ${new Date().toLocaleDateString()}`,
                planData.description,
                planData.priority || 'medium',
                'pending',
                planData.assigned_to || null,
                planData.deadline || null,
                1
            ]
        );

        const planId = planResult.id;

        if (planData.action_items && Array.isArray(planData.action_items)) {
            for (const item of planData.action_items) {
                await dbRun(
                    `INSERT INTO action_items 
           (plan_id, item_text, category, owner, status, due_date)
           VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        planId,
                        item.text,
                        item.category || 'general',
                        item.owner || null,
                        'pending',
                        item.due_date || null
                    ]
                );
            }
        }

        console.log(`Stored action plan with ${planData.action_items?.length || 0} items`);
    } catch (error) {
        console.error('Error storing action plan:', error);
    }
}

async function storeRootCauseAnalysis(surveyId, analysisData) {
    try {
        console.log('Storing root cause analysis:', analysisData);
        for (const analysis_data of analysisData) {
            await dbRun(
                `INSERT INTO root_cause_analysis 
       (survey_id, issue, root_cause, impact_level, evidence, recommendations)
       VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    surveyId,
                    analysis_data.issue,
                    analysis_data.root_cause,
                    analysis_data.impact_level || 'medium',
                    JSON.stringify(analysis_data.evidence || {}),
                    JSON.stringify(analysis_data.recommendations || [])
                ]
            );
        }
        console.log('Stored root cause analysis');
    } catch (error) {
        console.error('Error storing root cause analysis:', error);
    }
}

async function updateDashboardMetrics(surveyId, metrics) {
    try {
        for (const [metricName, metricValue] of Object.entries(metrics)) {
            await dbRun(
                `INSERT OR REPLACE INTO dashboard_metrics (survey_id, metric_name, metric_value, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
                [surveyId, metricName, JSON.stringify(metricValue)]
            );
        }
        console.log(`Updated ${Object.keys(metrics).length} dashboard metrics`);
    } catch (error) {
        console.error('Error updating dashboard metrics:', error);
    }
}

app.post('/api/surveys/:id/trigger-analysis', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { analysis_types = ['insights', 'action_plan', 'root_cause'] } = req.body;

        // Get survey and responses for analysis
        const survey = await dbGet('SELECT * FROM surveys WHERE id = ?', [id]);
        if (!survey) {
            return res.status(404).json({ error: 'Survey not found' });
        }

        const responses = await dbAll(`
      SELECT * FROM survey_responses 
      WHERE survey_id = ? AND is_complete = 1
      ORDER BY submitted_at DESC
      LIMIT 100
    `, [id]);

        if (responses.length === 0) {
            return res.json({
                success: true,
                message: 'No responses to analyze',
                triggered: false
            });
        }

        // Prepare data for AI analysis
        const analysisData = {
            survey: {
                id: survey.id,
                title: survey.title,
                description: survey.description,
                json: JSON.parse(survey.json)
            },
            responses: responses.map(r => ({
                id: r.id,
                submitted_at: r.submitted_at,
                respondent_email: r.respondent_email,
                respondent_name: r.respondent_name,
                response_data: JSON.parse(r.response_data),
                time_spent_seconds: r.time_spent_seconds
            })),
            total_responses: responses.length,
            analysis_types: analysis_types,
            timestamp: new Date().toISOString()
        };

        // Send to n8n webhook (async)
        triggerN8nAnalysis(id, analysisData);

        res.json({
            success: true,
            message: `AI analysis triggered for ${analysis_types.length} analysis types`,
            analysis_id: `analysis-${Date.now()}`,
            queued_responses: responses.length
        });

    } catch (error) {
        console.error('Error triggering analysis:', error);
        res.status(500).json({ error: 'Failed to trigger analysis' });
    }
});

// Update triggerN8nAnalysis function
async function triggerN8nAnalysis(surveyId, analysisData) {
    try {
        const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || 'https://vmi2886035.contaboserver.net/webhook-test/webhook/survey-analysis';

        const response = await fetch(n8nWebhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                survey_id: surveyId,
                data: analysisData,
                webhook_response_url: `${process.env.BASE_URL || `http://localhost:${PORT}`}/api/webhook/ai-analysis`,
                timestamp: new Date().toISOString()
            })
        });

        if (!response.ok) {
            console.warn('n8n webhook call failed:', await response.text());
        } else {
            console.log('AI analysis triggered successfully via n8n');
        }
    } catch (error) {
        console.error('Error triggering n8n analysis:', error);
    }
}

// ================== AI AGENT ANALYSIS ENDPOINTS ==================

// Get AI analysis results (include summary)
app.get('/api/surveys/:id/ai-analysis', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { type } = req.query;

        let results = {};

        if (!type || type === 'insights') {
            const insights = await dbAll(
                'SELECT * FROM survey_insights WHERE survey_id = ? ORDER BY generated_at DESC',
                [id]
            );
            results.insights = insights;
        }

        if (!type || type === 'action_plans') {
            const plans = await dbAll(
                `SELECT * FROM action_plans WHERE survey_id = ? ORDER BY 
           CASE priority 
             WHEN 'critical' THEN 1
             WHEN 'high' THEN 2
             WHEN 'medium' THEN 3
             WHEN 'low' THEN 4
           END,
           created_at DESC`,
                [id]
            );
            // Get action items for each plan
            for (const plan of plans) {
                plan.action_items = await dbAll(
                    `SELECT id, item_text, category, owner, status, due_date 
           FROM action_items WHERE plan_id = ?`, [plan.id]
                );
            }
            results.action_plans = plans;
        }

        if (!type || type === 'root_causes') {
            const rootCauses = await dbAll(
                'SELECT * FROM root_cause_analysis WHERE survey_id = ? ORDER BY created_at DESC',
                [id]
            );
            results.root_causes = rootCauses;
        }

        if (!type || type === 'dashboard') {
            const metrics = await dbAll(
                'SELECT * FROM dashboard_metrics WHERE survey_id = ? ORDER BY metric_name',
                [id]
            );
            results.dashboard_metrics = metrics;
        }

        // Add summary
        const summary = await dbGet(
            'SELECT overall_sentiment, key_takeaway, urgency_level FROM summary_analysis WHERE survey_id = ? ORDER BY generated_at DESC LIMIT 1',
            [id]
        );
        if (summary) {
            results.summary = summary;
        }

        res.json({
            success: true,
            survey_id: id,
            ...results
        });

    } catch (error) {
        console.error('Error fetching AI analysis:', error);
        res.status(500).json({ error: 'Failed to fetch analysis results' });
    }
});

// SSE for real-time AI analysis updates
const aiAnalysisSubscribers = {};

app.get('/api/ai-analysis/events', (req, res) => {
    const surveyId = req.query.survey_id;
    if (!surveyId) return res.status(400).end();

    req.socket.setTimeout(0);
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    res.flushHeaders();

    if (!aiAnalysisSubscribers[surveyId]) {
        aiAnalysisSubscribers[surveyId] = new Set();
    }
    aiAnalysisSubscribers[surveyId].add(res);

    req.on('close', () => {
        aiAnalysisSubscribers[surveyId].delete(res);
        if (aiAnalysisSubscribers[surveyId].size === 0) {
            delete aiAnalysisSubscribers[surveyId];
        }
    });
});

function publishAIEvent(surveyId, data) {
    if (aiAnalysisSubscribers[surveyId]) {
        for (const res of aiAnalysisSubscribers[surveyId]) {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        }
    }
}

// ================== ROUTE CONFIGURATION ==================
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../login.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

app.get('/main', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

app.get('/survey/:code', (req, res) => {
    res.sendFile(path.join(__dirname, '../survey-runner.html'));
});

app.get('/ai-dashboard/:id', (req, res) => {
    res.sendFile(path.join(__dirname, '../ai-dashboard.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Survey & Compliance backend running on ${process.env.BASE_URL || `http://localhost:${PORT}`}`);
    console.log(`📁 SQLite database: demos.db`);
    console.log(`📋 Survey endpoints available at /api/surveys`);
    console.log(`🔗 Share surveys at /survey/{code}`);
});