// Fallback background removal using canvas and simple techniques
// This doesn't do actual background removal, but creates a simple oval mask
// for cases where the real background removal fails

// Simple background removal by creating an oval mask
export async function fallbackRemoveBackground(imageFile) {
    try {
        // Create an image element to load the image
        const img = await createImageElement(imageFile);

        // Create a canvas to process the image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Set canvas dimensions to match image
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Create an oval mask
        ctx.save();
        ctx.beginPath();
        // Draw an oval in the center of the image
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radiusX = canvas.width * 0.45; // 90% of half width
        const radiusY = canvas.height * 0.45; // 90% of half height

        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        // Draw the image inside the clipped region
        ctx.drawImage(img, 0, 0);
        ctx.restore();

        // Convert the canvas to a PNG blob
        return new Promise((resolve) => {
            canvas.toBlob(resolve, 'image/png');
        });
    } catch (error) {
        console.error('Error in fallback background removal:', error);
        throw error;
    }
}

// Helper function to create an image element from a file
function createImageElement(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}