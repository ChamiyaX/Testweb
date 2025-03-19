/**
 * TextRenderer.js
 * Utility functions for consistent text rendering across platforms
 */

/**
 * Calculate the common scaling factors that should be used both in the preview and download renderings
 * 
 * @param {boolean} isIOS - True if device is iOS
 * @param {boolean} isAndroid - True if device is Android
 * @param {string} mode - 'preview' or 'download'
 * @returns {Object} Scaling factors to apply
 */
export const getScalingFactors = (isIOS, isAndroid, mode = 'preview') => {
    // Base scaling factors that should be the same in both CSS and Canvas
    const factors = {
        // CSS preview values
        fontSizeScale: isAndroid ? 0.875 : isIOS ? 0.75 : 0.625,
        outlineScale: isAndroid ? 0.875 : isIOS ? 0.625 : 0.5,

        // Canvas values for download mode - these should match the CSS proportions
        fontSizeMultiplier: isAndroid ? 3.5 : isIOS ? 3.0 : 2.5,
        outlineMultiplier: isAndroid ? 3.5 : isIOS ? 2.5 : 2.0,

        // Canvas values for preview mode (should match CSS exactly)
        previewFontSizeMultiplier: isAndroid ? 0.875 : isIOS ? 0.75 : 0.625,
        previewOutlineMultiplier: isAndroid ? 0.875 : isIOS ? 0.625 : 0.5,

        // Shadows and other effects
        shadowOpacity: isAndroid ? 0.9 : isIOS ? 0.85 : 0.8,
        shadowBlur: isAndroid ? 20 : isIOS ? 18 : 15,
        shadowOffset: isAndroid ? 7 : isIOS ? 6 : 5,

        // Glow effects
        glowSteps: isAndroid ? 10 : isIOS ? 9 : 8,
        maxBlurMultiplier: isAndroid ? 7 : isIOS ? 6 : 5,
        glowPasses: isAndroid ? 6 : isIOS ? 5 : 4,

        // Text rendering passes
        textPasses: isAndroid ? 4 : isIOS ? 3 : 2
    };

    // Add calculated values for canvas drawing
    factors.canvasFontSizeMultiplier = mode === 'preview' ?
        factors.previewFontSizeMultiplier :
        factors.fontSizeMultiplier;

    factors.canvasOutlineMultiplier = mode === 'preview' ?
        factors.previewOutlineMultiplier :
        factors.outlineMultiplier;

    return factors;
};

/**
 * Get the correct canvas dimensions based on device and mode
 * 
 * @param {boolean} isIOS - True if device is iOS 
 * @param {boolean} isAndroid - True if device is Android
 * @param {string} mode - 'preview' or 'download'
 * @returns {Object} Width and height for the canvas
 */
export const getCanvasDimensions = (isIOS, isAndroid, mode = 'download') => {
    if (mode === 'download') {
        return {
            width: isIOS ? 2000 : isAndroid ? 2500 : 2400,
            height: isIOS ? 2000 : isAndroid ? 2500 : 2400
        };
    } else {
        return {
            width: 1200,
            height: 1200
        };
    }
};