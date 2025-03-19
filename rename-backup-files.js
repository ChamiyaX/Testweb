// Helper script to rename backup files that might cause build issues
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const rename = promisify(fs.rename);
const stat = promisify(fs.stat);

async function findAndRenameBackupFiles(dir) {
    const files = await readdir(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
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
                file.startsWith('temp_')
            ) {
                const newFilePath = `${filePath}.ignored`;
                console.log(`Renaming: ${filePath} -> ${newFilePath}`);
                try {
                    await rename(filePath, newFilePath);
                } catch (err) {
                    console.error(`Error renaming ${filePath}:`, err);
                }
            }
        }
    }
}

// Start from the src directory
findAndRenameBackupFiles(path.join(__dirname, 'src'))
    .then(() => console.log('Backup files renamed successfully'))
    .catch(err => console.error('Error renaming backup files:', err));