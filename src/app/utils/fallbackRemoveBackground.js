// Fallback background removal using TensorFlow.js
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

// Initialize TensorFlow.js
let initialized = false;

async function initTensorflow() {
    if (!initialized) {
        await tf.ready();
        await tf.setBackend('webgl');
        initialized = true;
        console.log('TensorFlow.js initialized with WebGL backend');
    }
}

// Simple background removal using thresholding
export async function fallbackRemoveBackground(imageFile) {
    try {
        await initTensorflow();

        // Create an image element to load the image
        const img = await createImageElement(imageFile);

        // Create a canvas to process the image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Set canvas dimensions to match image
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw image on canvas
        ctx.drawImage(img, 0, 0);

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Convert to tensor
        const tensor = tf.browser.fromPixels(imageData);

        // Process with TensorFlow.js
        const result = await processImageWithTensorflow(tensor, canvas.width, canvas.height);

        // Clean up
        tensor.dispose();

        // Convert the result to a Blob
        return dataURLToBlob(result);
    } catch (error) {
        console.error('Error in fallback background removal:', error);
        throw error;
    }
}

async function processImageWithTensorflow(tensor, width, height) {
    // Create a basic color-based segmentation
    // This is a simplified approach - real segmentation would use pre-trained models

    // Resize for processing (smaller is faster)
    const resized = tf.image.resizeBilinear(tensor, [256, 256]);

    // Convert to grayscale
    const grayscale = resized.mean(2).expandDims(2);

    // Apply threshold
    const threshold = grayscale.greater(tf.scalar(200)).cast('float32');

    // Resize back to original dimensions
    const resizedBack = tf.image.resizeBilinear(threshold, [height, width]);

    // Create alpha mask
    const alphaMask = resizedBack.mul(tf.scalar(255));

    // Apply mask to original image
    const rgbTensor = tensor.slice([0, 0, 0], [height, width, 3]);
    const rgbaTensor = tf.concat([rgbTensor, alphaMask], 2);

    // Convert to canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    await tf.browser.toPixels(rgbaTensor, canvas);

    // Clean up tensors
    resized.dispose();
    grayscale.dispose();
    threshold.dispose();
    resizedBack.dispose();
    alphaMask.dispose();
    rgbTensor.dispose();
    rgbaTensor.dispose();

    // Return as data URL
    return canvas.toDataURL('image/png');
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

// Helper function to convert data URL to Blob
function dataURLToBlob(dataURL) {
    const parts = dataURL.split(';base64,');
    const contentType = parts[0].split(':')[1];
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;

    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
    }

    return new Blob([uInt8Array], { type: contentType });
}