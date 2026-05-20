const express = require('express');
const PastPapersScraper = require('./scraper');
const axios = require('axios'); // for streaming download proxy

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS (optional – for cross-origin frontend calls)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

const scraper = new PastPapersScraper();

// ------------------- API ROUTES -------------------

// 1. Search papers
// GET /api/search?q=mathematics&page=2
app.get('/api/search', async (req, res) => {
    try {
        const { q, page = 1 } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'Missing search query parameter "q"' });
        }
        const results = await scraper.searchPapers(q, parseInt(page));
        res.json({
            query: q,
            page: parseInt(page),
            count: results.length,
            results
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 2. Get paper details by URL
// GET /api/paper/details?url=https://pastpapers.wiki/.../
app.get('/api/paper/details', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'Missing "url" parameter' });
        }
        const details = await scraper.getPaperDetails(url);
        if (!details) {
            return res.status(404).json({ error: 'Paper details not found' });
        }
        res.json(details);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 3. Get recent papers (pagination)
// GET /api/recent?page=1
app.get('/api/recent', async (req, res) => {
    try {
        const { page = 1 } = req.query;
        const papers = await scraper.getRecentPapers(parseInt(page));
        res.json({
            page: parseInt(page),
            count: papers.length,
            results: papers
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 4. Stream a file directly to client (proxy download)
// GET /api/download?url=<file_url>&filename=optional.pdf
app.get('/api/download', async (req, res) => {
    try {
        const { url, filename } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'Missing "url" parameter' });
        }

        // Fetch the remote file as a stream
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        // Determine filename from Content-Disposition or query param
        let fileName = filename || 'download';
        const contentDisposition = response.headers['content-disposition'];
        if (contentDisposition) {
            const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (match && match[1]) {
                fileName = match[1].replace(/['"]/g, '');
            }
        } else {
            // fallback: extract from URL
            const urlParts = url.split('/');
            const lastPart = urlParts.pop() || 'file';
            if (lastPart.includes('.')) fileName = lastPart;
            else if (response.headers['content-type']?.includes('pdf')) fileName += '.pdf';
            else if (response.headers['content-type']?.includes('zip')) fileName += '.zip';
        }

        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
        
        // Pipe the file stream to the response
        response.data.pipe(res);
    } catch (error) {
        console.error('Download proxy error:', error.message);
        res.status(500).json({ error: 'Failed to download file' });
    }
});

// 5. Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(port, () => {
    console.log(`Past Papers API running on http://localhost:${port}`);
    console.log('Endpoints:');
    console.log('  GET /api/search?q=<term>&page=<page>');
    console.log('  GET /api/paper/details?url=<paper_url>');
    console.log('  GET /api/recent?page=<page>');
    console.log('  GET /api/download?url=<file_url>&filename=<optional>');
    console.log('  GET /api/health');
});