"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { removeBackground } from "@imgly/background-removal";
import html2canvas from 'html2canvas';
import { 
  getTypedScalingFactors, 
  getTypedCanvasDimensions, 
  applyTextOutline,
  getOutlineWidth,
  ScalingFactors,
  CanvasDimensions
} from '../utils/TextRendererUtils';

// Add image size limits and compression settings
const MAX_IMAGE_SIZE = 800; // Reduced maximum dimension for faster processing
const COMPRESSION_QUALITY = 0.6; // Slightly lower quality for faster processing

/**
 * Device detection helper for consistent platform detection throughout the app.
 * This is crucial for ensuring text rendering is consistent across platforms.
 * 
 * The text rendering utilities in utils/TextRendererUtils.ts and utils/TextRenderer.js
 * provide platform-specific adjustments to ensure that:
 * 1. Text appears the same in preview mode and download mode
 * 2. Text rendering is optimized for each platform (iOS, Android, Desktop)
 * 3. Outline weights, font sizes, and other text properties are consistent
 */
const detectDevice = () => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  const isAndroid = /android/i.test(navigator.userAgent);
  return { isIOS, isAndroid };
};

export default function Home() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [texts, setTexts] = useState<Array<{
    id: string;
    text: string;
    font: string;
    fontSize: number;
    fontColor: string;
    fontWeight: number;
    glowIntensity: number;
    glowColor: string;
    outlineWeight: number;
    outlineColor: string;
    opacity: number;
    positionX: number;
    positionY: number;
    rotation: number;
    horizontalTilt: number;
    verticalTilt: number;
  }>>([{
    id: '1',
    text: "TextBIMG",
    font: "Arial",
    fontSize: 76,
    fontColor: "#ffffff",
    fontWeight: 400,
    glowIntensity: 0,
    glowColor: "#00aaff",
    outlineWeight: 2.5,
    outlineColor: "#ffffff",
    opacity: 1,
    positionX: 50,
    positionY: 40, // Moved up from 50 to 40 to be above the center
    rotation: 0,
    horizontalTilt: 0,
    verticalTilt: 0
  }]);
  const [activeTextId, setActiveTextId] = useState<string>('1');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{width: number, height: number} | null>(null);
  const [containerSize, setContainerSize] = useState<{width: number, height: number} | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeEditTool, setActiveEditTool] = useState<string>('text');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  // Fix for hydration error - only render client-specific content after component mounts
  useEffect(() => {
    setIsClient(true);
    setError(null);
  }, []);
  
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Helper function to get active text
  const getActiveText = useCallback(() => {
    return texts.find(t => t.id === activeTextId) || texts[0];
  }, [texts, activeTextId]);

  // Helper function to update active text
  const updateActiveText = useCallback((updates: Partial<typeof texts[0]>) => {
    setTexts(prevTexts => 
      prevTexts.map(t => 
        t.id === activeTextId ? { ...t, ...updates } : t
      )
    );
  }, [activeTextId]);

  // Add a new text layer
  const addNewText = useCallback(() => {
    const newId = Date.now().toString();
    const newText = {
      id: newId,
      text: "TextBIMG",
      font: "Arial",
      fontSize: 76,
      fontColor: "#ffffff",
      fontWeight: 400,
      glowIntensity: 0,
      glowColor: "#00aaff",
      outlineWeight: 2.5,
      outlineColor: "#ffffff",
      opacity: 1,
      positionX: 50,
      positionY: 40, // Moved up from 50 to 40 to be above the center
      rotation: 0,
      horizontalTilt: 0,
      verticalTilt: 0
    };
    setTexts(prev => [...prev, newText]);
    setActiveTextId(newId);
  }, []);

  // Remove the active text layer
  const removeActiveText = useCallback(() => {
    if (texts.length <= 1) {
      return; // Keep at least one text layer
    }
    
    const newTexts = texts.filter(t => t.id !== activeTextId);
    setTexts(newTexts);
    setActiveTextId(newTexts[0].id);
  }, [texts, activeTextId]);

  // Optimize container size updates
  useEffect(() => {
    let isUpdating = false;
    const updateContainerSize = () => {
      if (isUpdating || !containerRef.current) return;
      
      isUpdating = true;
      requestAnimationFrame(() => {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const size = Math.min(rect.width, 600);
          setContainerSize(prev => {
            if (prev?.width === size) return prev;
            return { width: size, height: size };
          });
        }
        isUpdating = false;
      });
    };

    // Debounced resize handler
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateContainerSize, 100);
    };

    updateContainerSize();
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const calculateImageDimensions = useCallback((originalWidth: number, originalHeight: number, containerWidth: number, containerHeight: number) => {
    // If no container height is provided, use a reasonable default based on width
    const effectiveContainerHeight = containerHeight || containerWidth * (originalHeight / originalWidth);
    
    const scale = Math.min(
      containerWidth / originalWidth,
      effectiveContainerHeight / originalHeight
    );

    const width = Math.round(originalWidth * scale);
    const height = Math.round(originalHeight * scale);
    const left = Math.round((containerWidth - width) / 2);
    const top = Math.round((effectiveContainerHeight - height) / 2);

    return { width, height, left, top };
  }, []);

  // Add a function to get the container style based on image size
  const getContainerStyle = useCallback(() => {
    if (!imageSize) return { maxWidth: '600px', margin: '0 auto', height: '600px' };
    
    // Calculate the height based on the aspect ratio, but cap at 600px
    const maxWidth = 600;
    const aspectRatio = imageSize.width / imageSize.height;
    
    if (aspectRatio >= 1) {
      // Landscape or square image
      const height = Math.min(600, maxWidth / aspectRatio);
      return { 
        maxWidth: `${maxWidth}px`, 
        margin: '0 auto', 
        height: `${height}px`,
        aspectRatio: `${aspectRatio}`
      };
    } else {
      // Portrait image
      const height = Math.min(600, maxWidth / aspectRatio * 1.5);
      return { 
        maxWidth: `${maxWidth}px`, 
        margin: '0 auto', 
        height: `${height}px`,
        aspectRatio: `${aspectRatio}`
      };
    }
  }, [imageSize]);

  // Function to compress and resize image before processing
  const prepareImage = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      // Add timeout to reject if processing takes too long
      const timeout = setTimeout(() => {
        reject(new Error('Image preparation timed out. Try a smaller image.'));
      }, 30000); // 30 second timeout
      
      const img = new Image();
      img.onload = () => {
        clearTimeout(timeout);
        
        // Calculate new dimensions while maintaining aspect ratio
        let width = img.width;
        let height = img.height;
        
        // More aggressive resizing for large images
        if (width > MAX_IMAGE_SIZE || height > MAX_IMAGE_SIZE) {
          const scale = Math.min(MAX_IMAGE_SIZE / width, MAX_IMAGE_SIZE / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        // Create canvas for resizing
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Draw and compress image
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }
            resolve(new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            }));
          },
          'image/jpeg',
          COMPRESSION_QUALITY
        );
      };
      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Failed to load image'));
      };
      
      // Create a FileReader to read the file directly instead of using URL.createObjectURL
      const reader = new FileReader();
      reader.onload = function(e) {
        if (e.target && e.target.result) {
          img.src = e.target.result as string;
        } else {
          clearTimeout(timeout);
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Failed to read file'));
      };
      reader.readAsDataURL(file);
    });
  };

  // Add a function to handle image loading states
  const handleImageLoad = useCallback(() => {
    setImageLoading(false);
  }, []);
  
  const handleImageLoadStart = useCallback(() => {
    setImageLoading(true);
  }, []);

  // Update the onDrop function to handle loading states
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      setError(null);
      setProcessingProgress(0);
      setImageLoading(true);

      // Check file size before processing
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        setError('Image is too large. Please use an image smaller than 10MB.');
        setIsProcessing(false);
        return;
      }

      setError('Optimizing image...');

      // Prepare image before processing
      const optimizedFile = await prepareImage(file);
      
      // Instead of creating a blob URL, convert directly to data URL
      const reader = new FileReader();
      const originalUrlPromise = new Promise<string>((resolve, reject) => {
        reader.onload = function(e) {
          if (e.target && e.target.result) {
            resolve(e.target.result as string);
          } else {
            reject(new Error('Failed to read file'));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(optimizedFile);
      });
      
      const originalUrl = await originalUrlPromise;
      setOriginalImage(originalUrl);

      // Load image dimensions with optimized image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const loadImage = new Promise<void>((resolve, reject) => {
        const imageTimeout = setTimeout(() => {
          reject(new Error('Image loading timed out'));
        }, 15000); // 15 second timeout
        
        img.onload = () => {
          clearTimeout(imageTimeout);
          setImageSize({
            width: img.naturalWidth,
            height: img.naturalHeight
          });
          resolve();
        };
        img.onerror = (e) => {
          clearTimeout(imageTimeout);
          console.error('#1', new Date().getTime() - performance.now() + 'ms', 'Error loading image', originalUrl, e);
          // Try again with a different approach
          const retryImg = new Image();
          const retryTimeout = setTimeout(() => {
            reject(new Error('Image retry loading timed out'));
          }, 15000); // 15 second timeout
          
          retryImg.onload = () => {
            clearTimeout(retryTimeout);
            setImageSize({
              width: retryImg.naturalWidth,
              height: retryImg.naturalHeight
            });
            resolve();
          };
          retryImg.onerror = (e) => {
            clearTimeout(retryTimeout);
            reject(e);
          };
          
          // Since we're already using a data URL, just use it directly
          retryImg.src = originalUrl;
        };
        img.src = originalUrl;
      });

      // Process background removal with optimized image
      const processImage = async () => {
        try {
          setError('Removing background... This may take a moment.');
          const processedBlob = await removeBackground(optimizedFile, {
            progress: (progress: any) => {
              // Ensure progress is a valid number between 0-100
              const progressPercent = progress ? Math.round(progress * 100) : 0;
              setProcessingProgress(progressPercent);
              
              // Update error message with progress for better feedback
              if (progressPercent > 0 && progressPercent < 100) {
                setError(`Removing background: ${progressPercent}% complete. Please wait...`);
              }
            },
            model: 'isnet', // Use smallest model for fastest processing
            fetchArgs: { 
              cache: 'force-cache'  // Cache model files
            },
            debug: false
          });
          
          // Convert the processed blob to a data URL instead of a blob URL
          const processedReader = new FileReader();
          const processedUrlPromise = new Promise<string>((resolve, reject) => {
            processedReader.onload = function(e) {
              if (e.target && e.target.result) {
                resolve(e.target.result as string);
              } else {
                reject(new Error('Failed to read processed file'));
              }
            };
            processedReader.onerror = reject;
            processedReader.readAsDataURL(processedBlob);
          });
          
          const processedUrl = await processedUrlPromise;
          setProcessedImage(processedUrl);
          setProcessingProgress(100);
          setError(null);
        } catch (err) {
          console.error('Error removing background:', err);
          setError('Failed to remove background. Please try a different image or check your internet connection.');
          throw err; // Re-throw to handle in the outer catch
        }
      };

      // Run operations in parallel with optimized images
      try {
      await Promise.all([loadImage, processImage()]);
      } catch (parallelErr) {
        console.error('Error in parallel operations:', parallelErr);
        // Error already set in the individual operations
      }
    } catch (err) {
      console.error('Error processing image:', err);
      setError(err instanceof Error ? err.message : 'Failed to process image');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Add cleanup for the canvas element
  useEffect(() => {
    return () => {
      const canvases = document.querySelectorAll('canvas');
      canvases.forEach(canvas => canvas.remove());
    };
  }, []);

  // Remove URL cleanup since we're using data URLs now
  useEffect(() => {
    return () => {
      // No need to revoke data URLs
    };
  }, [originalImage, processedImage]);

  // Function to download an image
  const downloadImage = (dataUrl: string): void => {
    // Use consistent device detection
    const { isIOS } = detectDevice();
    
    if (isIOS) {
      // iOS doesn't support automatic downloads, so open in new tab with instructions
      const newTab = window.open();
      if (newTab) {
        newTab.document.write(`
          <html>
            <head>
              <title>Save Your Image</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body {
                  margin: 0;
                  padding: 20px;
                  text-align: center;
                  background: #111827;
                  color: white;
                  font-family: system-ui, -apple-system;
                }
                img {
                  max-width: 100%;
                  margin: 20px auto;
                  border-radius: 8px;
                  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                }
                h2 {
                  font-size: 20px;
                  margin-bottom: 10px;
                }
                .instructions {
                  background: rgba(59, 130, 246, 0.2);
                  border: 1px solid rgba(59, 130, 246, 0.5);
                  border-radius: 8px;
                  padding: 15px;
                  margin: 20px 0;
                  font-size: 16px;
                  line-height: 1.5;
                  text-align: left;
                }
                .instructions ol {
                  margin-left: 20px;
                  padding-left: 0;
                }
                .instructions li {
                  margin-bottom: 8px;
                }
              </style>
            </head>
            <body>
              <h2>Your Image is Ready!</h2>
              <div class="instructions">
                <strong>To save on iOS:</strong>
                <ol>
                  <li>Tap and hold on the image below</li>
                  <li>Select "Save to Photos" or "Add to Photos"</li>
                  <li>The image will be saved to your Camera Roll</li>
                </ol>
              </div>
              <img src="${dataUrl}" alt="Your Image" />
            </body>
          </html>
        `);
        newTab.document.close();
      } else {
        // If popup was blocked, show alert
        alert('Please enable popups to save your image on iOS.');
      }
      
      // Also set the success message
      setSuccessMessage('Image ready! See the instructions in the new tab.');
    } else {
      // Standard download for non-iOS devices
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'textbimg_' + new Date().getTime() + '.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Function to crop transparent areas from a canvas
  const cropTransparentAreas = (sourceCanvas: HTMLCanvasElement): HTMLCanvasElement => {
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const ctx = sourceCanvas.getContext('2d');
    
    if (!ctx) {
      console.error('Failed to get canvas context');
      return sourceCanvas;
    }
    
    // Get the image data to analyze pixels
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Find the bounds of non-transparent pixels
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    
    // Check each pixel for non-transparency
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[((y * width + x) * 4) + 3];
        if (alpha > 0) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    
    // Safety check to avoid small crops
    if (maxX - minX < 100 || maxY - minY < 100) {
      console.log('Crop area too small, returning original canvas');
      return sourceCanvas;
    }
    
    // Check if crop is almost the same as original
    if (minX < 10 && minY < 10 && maxX > width - 10 && maxY > height - 10) {
      console.log('Crop area nearly same as original, returning original canvas');
      return sourceCanvas;
    }
    
    // Create a new canvas with the cropped dimensions
    const targetCanvas = document.createElement('canvas');
    targetCanvas.width = maxX - minX + 1;
    targetCanvas.height = maxY - minY + 1;
    
    // Get the context from the new canvas
    const targetCtx = targetCanvas.getContext('2d');
    
    if (!targetCtx) {
      console.error('Failed to get target canvas context');
      return sourceCanvas;
    }
    
    // Draw the cropped image
    targetCtx.drawImage(
      sourceCanvas,
      minX, minY, maxX - minX + 1, maxY - minY + 1,
      0, 0, maxX - minX + 1, maxY - minY + 1
    );
    
    return targetCanvas;
  };

  // Fallback to html2canvas when universal renderer fails
  const fallbackToHtml2Canvas = () => {
    if (!imageContainerRef.current) {
      console.error('Image container ref is not available');
      setError('Failed to capture image. Please try again.');
      return;
    }
    
    console.log('Falling back to html2canvas...');
    
    // Clone the node to modify it for better text rendering
    const clonedNode = imageContainerRef.current.cloneNode(true) as HTMLElement;
    
    // Use consistent device detection
    const { isAndroid } = detectDevice();
    
    if (isAndroid) {
      // Find all text elements and enhance their visibility
      const textElements = clonedNode.querySelectorAll('.text-content');
      textElements.forEach((text: Element) => {
        const textElement = text as HTMLElement;
        
        // Increase font size and add text shadow for stronger appearance
        const originalSize = parseFloat(window.getComputedStyle(textElement).fontSize);
        textElement.style.fontSize = `${originalSize * 1.2}px`;
        
        // Add stronger shadow
        const originalShadow = textElement.style.textShadow;
        textElement.style.textShadow = originalShadow + 
          `, 0 0 6px black, 0 0 6px black, 0 0 8px black, 0 0 8px black`;
        
        // Create clones and overlay them for stronger text
        const parent = textElement.parentNode;
        if (parent) {
          const clone1 = textElement.cloneNode(true) as HTMLElement;
          const clone2 = textElement.cloneNode(true) as HTMLElement;
          
          parent.appendChild(clone1);
          parent.appendChild(clone2);
          clone1.style.opacity = '0.8';
          clone2.style.opacity = '0.6';
        }
      });
    }
    
    const options = {
      backgroundColor: null,
      scale: 2,
      logging: false,
      allowTaint: true,
      useCORS: true,
      scrollX: 0,
      scrollY: 0
    };
    
    html2canvas(clonedNode, options)
      .then(canvas => {
        try {
          // Crop transparent areas
          const croppedCanvas = cropTransparentAreas(canvas);
          
          // Convert to PNG data URL and download
          const dataUrl = croppedCanvas.toDataURL('image/png');
          downloadImage(dataUrl);
          setError(null);
        } catch (err) {
          console.error('Error in html2canvas processing:', err);
          setError('Failed to capture image. Please try again or use a different browser.');
        }
      })
      .catch(err => {
        console.error('html2canvas failed:', err);
        setError('Failed to capture image. Please try a different browser.');
      });
  };
  
  // Add a universal text and image rendering function that works consistently across platforms
  const universalTextImageRender = async (
    backgroundImageUrl: string, 
    subjectImageUrl: string | null, 
    textLayers: typeof texts, 
    isIOS: boolean, 
    isAndroid: boolean,
    mode: 'download' | 'preview' = 'download'
  ): Promise<string | null> => {
    console.log(`Starting universal text rendering for ${mode} - ${isIOS ? 'iOS' : isAndroid ? 'Android' : 'Desktop'}`);
    
    return new Promise<string | null>(async (resolve, reject) => {
      try {
        // Create an offscreen canvas
        const canvas = document.createElement('canvas');
        
        // Get dimensions based on device and mode with proper typing
        const dimensions: CanvasDimensions = getTypedCanvasDimensions(isIOS, isAndroid, mode);
        const { width, height } = dimensions;
        
        canvas.width = width;
        canvas.height = height;
        console.log(`Created ${mode} canvas with dimensions:`, width, 'x', height);
        
        // Get the context with alpha for transparency
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) {
          console.error('Failed to get canvas context');
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        // Enable high quality rendering
        if (ctx.imageSmoothingEnabled !== undefined) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
        }
        
        // Step 1: Load and draw background image
        const bgImg = new Image();
        bgImg.crossOrigin = 'anonymous';
        
        bgImg.onload = async () => {
          console.log('Background image loaded in universal renderer:', bgImg.width, 'x', bgImg.height);
          
          try {
            // Calculate dimensions to maintain aspect ratio
            const bgAspect = bgImg.width / bgImg.height;
            let drawWidth, drawHeight, offsetX, offsetY;
            
            if (bgAspect > 1) {
              // Wider than tall
              drawWidth = width;
              drawHeight = width / bgAspect;
              offsetX = 0;
              offsetY = (height - drawHeight) / 2;
            } else {
              // Taller than wide
              drawHeight = height;
              drawWidth = height * bgAspect;
              offsetX = (width - drawWidth) / 2;
              offsetY = 0;
            }
            
            // Draw background image
            ctx.drawImage(bgImg, offsetX, offsetY, drawWidth, drawHeight);
            console.log('Background drawn in universal renderer');
            
            // Step 2: Draw text layers
            console.log('Drawing text layers in universal renderer, count:', textLayers.length);
            
            // ENHANCED CONSISTENT TEXT RENDERING: Draw all text layers with platform-specific enhancements
            textLayers.forEach((textItem, index) => {
              console.log(`Drawing text layer ${index + 1}:`, textItem.text, 'Font:', textItem.font, 'Size:', textItem.fontSize);
              
              // Save the current state
              ctx.save();
              
              // Calculate position
              // Use the same centering approach as in the CSS version
              // In CSS, translate(-50%, -50%) centers the text at the position point
              const posX = (textItem.positionX / 100) * width;
              const posY = (textItem.positionY / 100) * height;
              
              // We apply transformations in the same order as CSS:
              // 1. Translate to position
              ctx.translate(posX, posY);
              
              // 2. Apply rotation
              ctx.rotate((textItem.rotation * Math.PI) / 180);
              
              // 3. Apply skew (tilt)
              ctx.transform(
                1, Math.tan((textItem.verticalTilt * Math.PI) / 180), 
                Math.tan((textItem.horizontalTilt * Math.PI) / 180), 1, 
                0, 0
              );
              
              // Get scaling factors for the current platform and mode with proper typing
              const factors: ScalingFactors = getTypedScalingFactors(isIOS, isAndroid, mode);
              
              // Calculate the exact font size for consistency
              const exactFontSize = textItem.fontSize * factors.canvasFontSizeMultiplier;
              
              // Set font properties with platform-specific adjustments
              const fontWeightStr = String(textItem.fontWeight);
              
              // Use a more precise font string format
              ctx.font = `${fontWeightStr} ${exactFontSize}px "${textItem.font}"`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.globalAlpha = textItem.opacity;
              
              // Apply consistent outline settings using our utility
              applyTextOutline(ctx, textItem, isIOS, isAndroid, mode);
              
              // Apply text outline if needed
              if (textItem.outlineWeight > 0) {
                // Apply consistent outline settings using our utility
                applyTextOutline(ctx, textItem, isIOS, isAndroid, mode);
                
                // Platform-specific outline offsets based on the lineWidth that was set by applyTextOutline
                const offset = Math.max(1, ctx.lineWidth / 4);
                
                // Draw text outline using multiple passes for smoother look
                for (let i = 0; i < Math.PI * 2; i += Math.PI / 8) { // Use 8 steps for smoother outline
                  const dx = Math.cos(i) * offset;
                  const dy = Math.sin(i) * offset;
                  ctx.strokeText(textItem.text, dx, dy);
                }
              }
              
              // Apply text glow if needed
              if (textItem.glowIntensity > 0) {
                const glowSize = textItem.glowIntensity * 10 * (mode === 'download' ? 1.5 : 1);
                ctx.shadowColor = textItem.glowColor;
                ctx.shadowBlur = glowSize;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                
                // Draw glow layer (multiple passes for stronger effect)
                for (let i = 0; i < 3; i++) {
                  ctx.fillStyle = textItem.glowColor;
                  ctx.globalAlpha = textItem.opacity * 0.3;
                  ctx.fillText(textItem.text, 0, 0);
                }
                
                // Reset shadow for main text
                ctx.shadowBlur = 0;
              }
              
              // Draw the text fill
              ctx.fillStyle = textItem.fontColor;
              ctx.globalAlpha = textItem.opacity;
              ctx.fillText(textItem.text, 0, 0);
              
              // Restore the context state
              ctx.restore();
            });
            
            // Step 3: Draw subject image (if available)
            if (subjectImageUrl) {
              console.log('Drawing subject image...');
              const subjectImg = new Image();
              subjectImg.crossOrigin = 'anonymous';
              
              await new Promise<void>((resolveSub, rejectSub) => {
                subjectImg.onload = () => {
                  try {
                    // Calculate dimensions and position
                    const subjectAspect = subjectImg.width / subjectImg.height;
                    const maxDim = width * 0.5; // Max dimension is 50% of canvas
                    
                    let drawWidth, drawHeight;
                    if (subjectAspect > 1) {
                      drawWidth = maxDim;
                      drawHeight = maxDim / subjectAspect;
                    } else {
                      drawHeight = maxDim;
                      drawWidth = maxDim * subjectAspect;
                    }
                    
                    // Position in the center
                    const offsetX = (width - drawWidth) / 2;
                    const offsetY = (height - drawHeight) / 2;
                    
                    // Draw with shadow for subtle depth
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                    ctx.shadowBlur = 15;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                    
                    ctx.drawImage(subjectImg, offsetX, offsetY, drawWidth, drawHeight);
                    ctx.shadowBlur = 0; // Reset shadow
                    
                    console.log('Subject image drawn successfully');
                    resolveSub();
                  } catch (err) {
                    console.error('Error drawing subject image:', err);
                    // Continue even if subject image fails
                    resolveSub();
                  }
                };
                
                subjectImg.onerror = (err) => {
                  console.error('Failed to load subject image:', err);
                  // Continue even if subject image fails
                  resolveSub();
                };
                
                subjectImg.src = subjectImageUrl;
              });
            }
            
            // Convert canvas to image data URL
            const finalCanvas = cropTransparentAreas(canvas);
            const dataUrl = finalCanvas.toDataURL('image/png');
            console.log(`Universal rendering complete for ${mode}`);
            
            resolve(dataUrl);
          } catch (error) {
            console.error('Error in canvas rendering:', error);
            reject(error);
          }
        };
        
        bgImg.onerror = (error) => {
          console.error('Background image failed to load:', error);
          reject(new Error('Failed to load background image'));
        };
        
        // Load the background image
        bgImg.src = backgroundImageUrl;
      } catch (error) {
        console.error('Error in universal renderer:', error);
        reject(error);
      }
    });
  };

  // Function to finish processing and download the image
  const finishAndDownload = async () => {
    try {
      setError('Preparing image for download...');
      
      // Use consistent device detection
      const { isIOS, isAndroid } = detectDevice();
      
      // Get active image URL
      const backgroundImageUrl = processedImage || originalImage;
      if (!backgroundImageUrl) {
        setError('No image to download');
        return;
      }
      
      // Use universal renderer for consistent text on all platforms
      const dataUrl = await universalTextImageRender(
        backgroundImageUrl,
        null, // No subject image
        texts,
        isIOS,
        isAndroid,
        'download'
      );
      
      if (!dataUrl) {
        throw new Error('Failed to render image');
      }
      
      // Download the image using platform-specific method
      downloadImage(dataUrl);
      setError(null);
    } catch (err: any) {
      console.error('Error in finish and download:', err);
      setError(`Failed to download image: ${err.message}`);
      
      // Fallback to html2canvas if universal renderer fails
      fallbackToHtml2Canvas();
    }
  };

  // Add the dropzone hook implementation
  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp'],
    },
    maxFiles: 1,
    onDrop,
    disabled: isProcessing,
  });

  // JSX rendering starts here
  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-center">TextBIMG</h1>
          <p className="text-center text-gray-400">Add customizable text to your images</p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-semibold mb-4">Upload Image</h2>
            
            {!originalImage ? (
              <div 
                {...getRootProps()} 
                className="border-2 border-dashed border-gray-600 rounded-lg p-12 text-center cursor-pointer hover:border-blue-500 transition-colors"
              >
                <input {...getInputProps()} />
                <p>Drag &amp; drop an image here, or click to select one</p>
                <p className="text-sm text-gray-400 mt-2">Supports: JPG, PNG, WEBP</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div ref={containerRef} className="relative rounded-lg overflow-hidden" style={getContainerStyle()}>
                  <div 
                    ref={imageContainerRef}
                    className="relative w-full h-full flex items-center justify-center bg-black"
                  >
                    {(originalImage || processedImage) && (
                      <img
                        src={processedImage || originalImage}
                        alt="Uploaded image"
                        className="max-w-full max-h-full object-contain"
                        onLoad={handleImageLoad}
                        style={{ 
                          opacity: imageLoading ? 0.3 : 1,
                          transition: 'opacity 0.3s'
                        }}
                      />
                    )}
                    
                    {/* Text overlays */}
                    {texts.map((textItem) => (
                      <div
                        key={textItem.id}
                        className={`absolute text-content ${textItem.id === activeTextId ? 'ring-2 ring-blue-500' : ''}`}
                        style={{
                          left: `${textItem.positionX}%`,
                          top: `${textItem.positionY}%`,
                          transform: `
                            translate(-50%, -50%) 
                            rotate(${textItem.rotation}deg)
                            skew(${textItem.horizontalTilt}deg, ${textItem.verticalTilt}deg)
                          `,
                          color: textItem.fontColor,
                          fontFamily: textItem.font,
                          fontSize: `${textItem.fontSize * 0.625}px`, // Base scale for desktop
                          fontWeight: textItem.fontWeight,
                          opacity: textItem.opacity,
                          cursor: 'pointer',
                          textShadow: textItem.outlineWeight > 0 
                            ? `0 0 ${textItem.outlineWeight * 0.5}px ${textItem.outlineColor}` 
                            : 'none',
                          WebkitTextStroke: textItem.outlineWeight > 0 
                            ? `${textItem.outlineWeight * 0.5}px ${textItem.outlineColor}` 
                            : 'none',
                        }}
                        onClick={() => setActiveTextId(textItem.id)}
                      >
                        {textItem.text || 'TextBIMG'}
                      </div>
                    ))}
                    
                    {/* Loading overlay */}
                    {isProcessing && (
                      <div className="absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center">
                        <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${processingProgress}%` }}
                          ></div>
                        </div>
                        <p className="mt-2 text-sm">{error || `Processing: ${processingProgress}%`}</p>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-4">
                  <button 
                    onClick={() => {
                      setOriginalImage(null);
                      setProcessedImage(null);
                      setError(null);
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Remove Image
                  </button>
                  
                  <button 
                    onClick={finishAndDownload}
                    disabled={!originalImage || isProcessing}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Download
                  </button>
                </div>
                
                {error && (
                  <div className="p-3 bg-red-900 bg-opacity-20 border border-red-500 rounded text-red-200">
                    {error}
                  </div>
                )}
                
                {successMessage && (
                  <div className="p-3 bg-green-900 bg-opacity-20 border border-green-500 rounded text-green-200">
                    {successMessage}
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-semibold mb-4">Text Settings</h2>
            
            {!originalImage ? (
              <div className="text-gray-400 text-center p-12">
                Upload an image to add text
              </div>
            ) : (
              <div>
                <div className="flex gap-2 mb-4">
                  <button 
                    onClick={addNewText}
                    className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                  >
                    Add Text
                  </button>
                  
                  {texts.length > 1 && (
                    <button 
                      onClick={removeActiveText}
                      className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                    >
                      Remove Text
                    </button>
                  )}
                </div>
                
                {texts.length > 1 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {texts.map(text => (
                      <button
                        key={text.id}
                        onClick={() => setActiveTextId(text.id)}
                        className={`px-3 py-1 rounded text-sm ${
                          text.id === activeTextId ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'
                        }`}
                      >
                        {text.text.substring(0, 10)}{text.text.length > 10 ? '...' : ''}
                      </button>
                    ))}
                  </div>
                )}
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Text</label>
                    <input
                      type="text"
                      value={getActiveText().text}
                      onChange={(e) => updateActiveText({ text: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 text-white"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Font</label>
                    <select
                      value={getActiveText().font}
                      onChange={(e) => updateActiveText({ font: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 text-white"
                    >
                      <option value="Arial">Arial</option>
                      <option value="Verdana">Verdana</option>
                      <option value="Helvetica">Helvetica</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Courier New">Courier New</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Palatino">Palatino</option>
                      <option value="Garamond">Garamond</option>
                      <option value="Bookman">Bookman</option>
                      <option value="Comic Sans MS">Comic Sans MS</option>
                      <option value="Trebuchet MS">Trebuchet MS</option>
                      <option value="Impact">Impact</option>
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Font Size: {getActiveText().fontSize}px
                      </label>
                      <input
                        type="range"
                        min="10"
                        max="200"
                        value={getActiveText().fontSize}
                        onChange={(e) => updateActiveText({ fontSize: parseInt(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Font Weight: {getActiveText().fontWeight}
                      </label>
                      <input
                        type="range"
                        min="100"
                        max="900"
                        step="100"
                        value={getActiveText().fontWeight}
                        onChange={(e) => updateActiveText({ fontWeight: parseInt(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Font Color</label>
                    <input
                      type="color"
                      value={getActiveText().fontColor}
                      onChange={(e) => updateActiveText({ fontColor: e.target.value })}
                      className="w-full h-10 rounded cursor-pointer"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Outline Weight: {getActiveText().outlineWeight.toFixed(1)}
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.1"
                        value={getActiveText().outlineWeight}
                        onChange={(e) => updateActiveText({ outlineWeight: parseFloat(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Outline Color</label>
                      <input
                        type="color"
                        value={getActiveText().outlineColor}
                        onChange={(e) => updateActiveText({ outlineColor: e.target.value })}
                        className="w-full h-10 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Glow Intensity: {getActiveText().glowIntensity.toFixed(1)}
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.1"
                        value={getActiveText().glowIntensity}
                        onChange={(e) => updateActiveText({ glowIntensity: parseFloat(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Glow Color</label>
                      <input
                        type="color"
                        value={getActiveText().glowColor}
                        onChange={(e) => updateActiveText({ glowColor: e.target.value })}
                        className="w-full h-10 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Opacity: {(getActiveText().opacity * 100).toFixed(0)}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={getActiveText().opacity}
                      onChange={(e) => updateActiveText({ opacity: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Rotation: {getActiveText().rotation}°
                      </label>
                      <input
                        type="range"
                        min="-180"
                        max="180"
                        value={getActiveText().rotation}
                        onChange={(e) => updateActiveText({ rotation: parseInt(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Horizontal Tilt: {getActiveText().horizontalTilt}°
                      </label>
                      <input
                        type="range"
                        min="-45"
                        max="45"
                        value={getActiveText().horizontalTilt}
                        onChange={(e) => updateActiveText({ horizontalTilt: parseInt(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Vertical Tilt: {getActiveText().verticalTilt}°
                      </label>
                      <input
                        type="range"
                        min="-45"
                        max="45"
                        value={getActiveText().verticalTilt}
                        onChange={(e) => updateActiveText({ verticalTilt: parseInt(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
        
        <footer className="mt-12 text-center text-gray-500 text-sm">
          <p>TextBIMG - Add text to your images with complete customization</p>
        </footer>
      </div>
    </div>
  );
}
