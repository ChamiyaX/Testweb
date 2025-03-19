const https = require('https');
const fs = require('fs');
const path = require('path');

const MODEL_FILES = [
    'model-medium.json',
    'model-medium.bin'
];

const BASE_URL = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.0.6/dist/';
const OUTPUT_DIR = path.join(__dirname, 'public', 'models');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

MODEL_FILES.forEach(filename => {
    const outputPath = path.join(OUTPUT_DIR, filename);
    const file = fs.createWriteStream(outputPath);

    https.get(`${BASE_URL}${filename}`, response => {
        response.pipe(file);

        file.on('finish', () => {
            file.close();
            console.log(`Downloaded ${filename}`);
        });
    }).on('error', err => {
        fs.unlink(outputPath);
        console.error(`Error downloading ${filename}:`, err.message);
    });
});