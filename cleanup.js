// Cleanup script to remove problematic files before build
const fs = require('fs');
const path = require('path');

console.log('Starting cleanup process...');

// List of specific files to remove
const filesToRemove = [
    'src/app/components/Home_fixed.tsx',
    'src/app/components/Home.bak.tsx',
    'src/app/components/Home.broken.tsx',
    'temp_home_bak_end.txt'
];

// Remove each file
filesToRemove.forEach(filePath => {
    const fullPath = path.join(__dirname, filePath);
    try {
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`Removed: ${filePath}`);
        } else {
            console.log(`File not found: ${filePath}`);
        }
    } catch (err) {
        console.error(`Error removing ${filePath}:`, err);
    }
});

console.log('Cleanup complete!');