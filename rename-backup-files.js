// Helper script to rename backup files that might cause build issues
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const rename = promisify(fs.rename);
const stat = promisify(fs.stat);
const access = promisify(fs.access);

// Define specific files to rename
const specificFilesToRename = [
    'src/app/components/Home_fixed.tsx',
    'temp_home_bak_end.txt'
];

// Check if a file exists
async function fileExists(filePath) {
    try {
        await access(filePath, fs.constants.F_OK);
        return true;
    } catch (err) {
        return false;
    }
}

// Rename specific files first
async function renameSpecificFiles() {
    for (const filePath of specificFilesToRename) {
        const fullPath = path.join(__dirname, filePath);
        if (await fileExists(fullPath)) {
            const newFilePath = `${fullPath}.ignored`;
            console.log(`Renaming specific file: ${fullPath} -> ${newFilePath}`);
            try {
                await rename(fullPath, newFilePath);
            } catch (err) {
                console.error(`Error renaming ${fullPath}:`, err);
            }
        } else {
            console.log(`File not found: ${fullPath}`);
        }
    }
}

async function findAndRenameBackupFiles(dir) {
    try {
        const files = await readdir(dir);

        for (const file of files) {
            const filePath = path.join(dir, file);
            try {
                const stats = await stat(filePath);

                if (stats.isDirectory()) {
                    // Recursively process subdirectories
                    await findAndRenameBackupFiles(filePath);
                } else {
                    // Check if the file is a backup file
                    if (
                        file.includes('.bak.') ||
                        file.includes('.broken.') ||
                        file.includes('_bak') ||
                        file.includes('_broken') ||
                        file.startsWith('temp_') ||
                        file === 'Home_fixed.tsx' // Specifically target this file
                    ) {
                        const newFilePath = `${filePath}.ignored`;
                        console.log(`Renaming backup file: ${filePath} -> ${newFilePath}`);
                        try {
                            await rename(filePath, newFilePath);
                        } catch (err) {
                            console.error(`Error renaming ${filePath}:`, err);
                        }
                    }
                }
            } catch (err) {
                console.error(`Error processing ${filePath}:`, err);
            }
        }
    } catch (err) {
        console.error(`Error reading directory ${dir}:`, err);
    }
}

// Main function
async function main() {
    console.log('Starting backup file renaming process...');

    // First rename specific files
    await renameSpecificFiles();

    // Then search for pattern-matching files
    await findAndRenameBackupFiles(path.join(__dirname, 'src'));

    console.log('Backup files renamed successfully');
}

// Run the main function
main().catch(err => console.error('Error in main process:', err));