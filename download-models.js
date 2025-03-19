const fs = require('fs');
const path = require('path');
const https = require('https');
const { promisify } = require('util');
const mkdir = promisify(fs.mkdir);

// Ensure the models directory exists
const modelsDir = path.join(__dirname, 'public', 'models');

// Create the models directory if it doesn't exist
async function ensureModelsDir() {
    try {
        await mkdir(modelsDir, { recursive: true });
        console.log(`Created models directory at ${modelsDir}`);
    } catch (err) {
        if (err.code !== 'EEXIST') {
            console.error(`Error creating models directory: ${err.message}`);
            throw err;
        }
    }
}

// Function to download a file
function downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading ${url} to ${outputPath}...`);

        const file = fs.createWriteStream(outputPath);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: ${response.statusCode} ${response.statusMessage}`));
                return;
            }

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log(`Downloaded ${url} to ${outputPath}`);
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(outputPath, () => {}); // Delete the file if there's an error
            reject(err);
        });
    });
}

// Map of model files to download
const modelFiles = {
    'medium': [{
            url: 'https://cdn.img.ly/packages/imgly/background-removal/1.6.0/assets/isnet-general-use.onnx',
            outputPath: path.join(modelsDir, 'isnet-general-use.onnx')
        },
        {
            url: 'https://cdn.img.ly/packages/imgly/background-removal/1.6.0/assets/model-medium.json',
            outputPath: path.join(modelsDir, 'model-medium.json')
        }
    ]
};

// Main function to download all model files
async function downloadModels() {
    try {
        await ensureModelsDir();

        // Download medium model files
        console.log('Downloading medium model files...');
        for (const file of modelFiles.medium) {
            await downloadFile(file.url, file.outputPath);
        }

        console.log('All model files downloaded successfully!');
    } catch (err) {
        console.error('Error downloading model files:', err);
        process.exit(1);
    }
}

// Run the download function
downloadModels();