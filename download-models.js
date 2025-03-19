const fs = require('fs');
const path = require('path');
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

// Create a dummy model JSON file
function createDummyModelFile() {
    const modelContent = JSON.stringify({
        name: "isnet-general-use",
        format: "ONNX",
        size: {
            width: 1024,
            height: 1024
        },
        preprocess: {
            mean: [0.485, 0.456, 0.406],
            std: [0.229, 0.224, 0.225]
        }
    }, null, 2);

    const modelPath = path.join(modelsDir, 'model-medium.json');
    fs.writeFileSync(modelPath, modelContent);
    console.log(`Created dummy model file at ${modelPath}`);
}

// Create a dummy ONNX file
function createDummyOnnxFile() {
    // Create a very small placeholder file
    const onnxPath = path.join(modelsDir, 'isnet-general-use.onnx');
    fs.writeFileSync(onnxPath, 'ONNX Model Placeholder');
    console.log(`Created dummy ONNX file at ${onnxPath}`);
}

// Main function to set up model files
async function setupModels() {
    try {
        await ensureModelsDir();

        // Create placeholder files
        console.log('Creating placeholder model files...');
        createDummyModelFile();
        createDummyOnnxFile();

        // Create a README to explain why we use placeholders
        const readmePath = path.join(modelsDir, 'README.md');
        fs.writeFileSync(readmePath, `# Background Removal Models

These are placeholder files for the background removal models.
The actual models will be downloaded by the client's browser from the imgly CDN when needed.

For Netlify static hosting, we don't need to include the actual model files in the build.`);

        console.log('All model files created successfully!');
    } catch (err) {
        console.error('Error setting up model files:', err);
        process.exit(1);
    }
}

// Run the setup function
setupModels();